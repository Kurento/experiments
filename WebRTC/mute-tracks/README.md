# mute-tracks

Here we test different methods of muting audio or video tracks on a browser's [RTCPeerConnection] object. We have identified three methods to achieve this, with different levels of support in each one of the tested browsers (Chrome and Firefox).

You can view this experiment in several ways:

* This jsFiddle: [mute-tracks].

* Directly opening the [index.html](index.html) file on a web browser. Most parts will work, but it won't be possible to select a different microphone or camera for the *Replace Track* method (because that requires a *Secure Context*, i.e. an HTTPS connection).

* Serving the page with an HTTPS server.

    Tip: If you already have Node.js installed, you can use *http-server* as a quick and dirty HTTPS server, like this:

    ```
    http-server --port 8080 --ssl --cert cert.pem --key key.pem
    ```

    To generate your own *cert.pem* and *key.pem*, use [mkcert]. There is a step-by-step guide on Kurento's [Self-Signed Certificates] docs.

[RTCPeerConnection]: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
[mute-tracks]: https://jsfiddle.net/j1elo/n3tf0rtL/6/
[mkcert]: https://github.com/FiloSottile/mkcert
[Self-Signed Certificates]: https://doc-kurento.readthedocs.io/en/latest/knowledge/selfsigned_certs.html#self-signed-certificates



## MediaStreamTrack.enabled

The WebRTC standard supports the concept of "muting" a given track by means of the `MediaStreamTrack.enabled` property [1]. This property is already implemented in current versions of Chrome and Firefox, and it enables or disables the generation of data that will then be sent over the wire to the remote peer. When `MediaStreamTrack.enabled = false`, the intended behavior is to generate "zero-information content", which translates into black frames for video codecs, and silence for audio codecs [2]. This empty content still has to be sent to the remote peer, as it could cause decoding problems otherwise.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/enabled
[2]: https://www.w3.org/TR/mediacapture-streams/#track-enabled

Underlying codec implementations are expected to reduce as much as possible their output when in the "zero-information" mode [3]. Still, current implementations generate a significant amount of data. Besides this, the RTP/RTCP protocols are left running as normal, thus even if the RTP packets contained absolutely empty data, there would be a slight usage of bandwidth. All this is very well known, and the official *WebRTC Audio-only peer connection demo* page even includes an informational table with some values for both number of packets sent and expected bandwidth usage when in muted state [4]. E.g. for the Opus codec, 40 kbps (5 kB/s) and 50 packets/s are expected.

[3]: https://github.com/w3c/webrtc-pc/issues/1764#issuecomment-364154913
[4]: https://webrtc.github.io/samples/src/content/peerconnection/audio/

There has been some conversations about this topic [5], and also some spec changes that add explicit wording about how to achieve "zero-information" for the case of the video codecs [6]:

> 5.2 RTCRtpSender Interface
> Attributes
> track of type MediaStreamTrack, readonly, nullable
> (...) [If track is ended or disabled], the RTCRtpSender MUST send black frames (video) and MUST NOT send (audio). In the case of video, the RTCRtpSender SHOULD send one black frame per second. If track is null then the RTCRtpSender does not send.

[5]: https://github.com/webrtc/samples/pull/1009
[6]: https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-track



## RTCRtpSender.replaceTrack()

In any current WebRTC implementation, the actual sending of RTP packets is done by an object of the class RTCRtpSender, which contains a reference to a source MediaStreamTrack from where it gets the audio or video data that must be sent to the remote peer. The method `RTCRtpSender.replaceTrack()` was introduced to allow seamless swapping of the source tracks without any kind of renegotiation needed. The intended use case for this is to e.g. change between front-facing and back cameras of a smartphone in the middle of a call.

`replaceTrack()` includes however one interesting detail: it allows to replace the currently running track with *null*, i.e. calling `RTCRtpSender.replaceTrack(null)`, which leaves the RTCRtpSender with nothing to send. In this case, the spec says that the RTCRtpSender should simply avoid sending any data [9]:

> If sending is true, and withTrack is null, have the sender stop sending.

[9]: https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack

The WebRTC spec itself uses this feature of `replaceTrack()` to propose an example "Hold" functionality between peers [10]; Mozilla also provides the same example, complemented with more detailed explanations of how it works [11].

[10]: https://www.w3.org/TR/webrtc/#hold-functionality
[11]: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Intro_to_RTP#Leveraging_RTP_to_implement_a_hold_feature

Using `replaceTrack(null)` feature to achieve a *"hard" mute* for an RTCRtpSender [12] was proposed and an example landed the test-pages section of the WebRTC website [13].

Note: While testing that demo, the button named "toggle audio with replaceTrack" is the one that calls `replaceTrack(null)` to stop the audio track, but the button itself will be disabled if the browser doesn't support this function. As of Firefox version 58, this button is clickable because Firefox supports the `replaceTrack()` method, but it fails because handling `null` as an argument is not yet implemented (make sure to open the JavaScript Console while testing this demo, to see the debug log messages).

[12]: https://github.com/webrtc/samples/pull/1009
[13]: https://webrtc.github.io/test-pages/src/replaceTrack/index.html



## RTCPeerConnection.removeTrack()

This is the last of the methods explored for muting tracks. Its definition tells us that this method stops sending media from the corresponding RTCRtpSender, by means of setting the inner MediaStreamTrack to `null` [15]. This is just what we would like to achieve with the `RTCRtpSender.replaceTrack(null)` method described in the previous section, but the `removeTrack()` function call also has the undesired side effect of changing the stated direction of the stream, which is an action that triggers an SDP renegotiation:

> 8. Set sender's [[SenderTrack]] to null.
> 10. If transceiver's [[Direction]] slot is `sendrecv`, set transceiver's [[Direction]] slot to `recvonly`.
> 11. If transceiver's [[Direction]] slot is `sendonly`, set transceiver's [[Direction]] slot to `inactive`.
> 12. Update the negotiation-needed flag for connection.

[15]: https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-removetrack

This change in the direction, and the required SDP renegotiation, introduces complexity because then a new SDP Offer/Answer negotiation must be performed between peers, which is something that is desirable to avoid.



# Conclusions

Now that all explored methods have been presented, this is a summary with the current situation and problems of each one:

**A**. `MediaStreamTrack.enabled` is the officially supported way to mute tracks, but it relies on the underlying codecs to provide an optimized mode for producing "zero-content" data.

**B**. `RTCRtpSender.replaceTrack(null)` seems like the **ideal solution**.

**C**. `RTCPeerConnection.removeTrack()` seems like another well-supported solution. However, this option requires an SDP renegotiation.
