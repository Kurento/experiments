# mute-tracks

Here we test different methods of muting audio or video tracks on a browser's [RTCPeerConnection] object. We have identified three methods to achieve this, with different levels of support in each one of the tested browsers (Chrome and Firefox).

Preview this experiment in jsFiddle: [mute-tracks].

<iframe width="100%" height="300" src="//jsfiddle.net/j1elo/n3tf0rtL/embedded/js,html,result/" allowpaymentrequest allowfullscreen="allowfullscreen" frameborder="0"></iframe>

[RTCPeerConnection]: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
[mute-tracks]: https://jsfiddle.net/j1elo/n3tf0rtL/



## MediaStreamTrack.enabled

The WebRTC standard supports the concept of "muting" a given track by means of the `MediaStreamTrack.enabled` property [1]. This property is already implemented in current versions of Chrome and Firefox, and it enables or disables the generation of data that will then be sent over the wire to the remote peer. When `MediaStreamTrack.enabled = false`, the intended behavior is to generate "zero-information content", which translates into black frames for video codecs, and silence for audio codecs [2]. This empty content still has to be sent to the remote peer, as it could cause decoding problems otherwise.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/enabled
[2]: https://www.w3.org/TR/mediacapture-streams/#track-enabled

Underlying codec implementations are expected to reduce as much as possible their output when in the "zero-information" mode [3]. Still, current implementations generate a significant amount of data. Besides this, the RTP/RTCP protocols are left running as normal, thus even if the RTP packets contained absolutely empty data, still there would be a slight usage of bandwidth. All this is very well known, and the official *WebRTC Audio-only peer connection demo* page even includes an informational table with some values for both number of packets sent and expected bandwidth usage when in muted state [4]. E.g. for the Opus codec, ~40 kbps (~5 kB/s) and 50 packets/s are expected.

[3]: https://github.com/w3c/webrtc-pc/issues/1764#issuecomment-364154913
[4]: https://webrtc.github.io/samples/src/content/peerconnection/audio/

There has been some very recent conversations (as in, about a month ago at the time of this writing) about this topic [5], and also some draft changes to the spec that add explicit wording about how to achieve "zero-information" for the case of the video codecs [6]:

> 5.2 RTCRtpSender Interface
> Attributes
> track of type MediaStreamTrack
> (...) [If track is disabled], the RTCRtpSender MUST send silence (audio), black frames (video) or a zero-information-content equivalent. In the case of video, the RTCRtpSender SHOULD send one black frame per second. If track is null then the RTCRtpSender does not send.

[5]: https://github.com/webrtc/samples/pull/1009
[6]: http://w3c.github.io/webrtc-pc/#rtcrtpsender-interface

This wording is very recent too, and it hasn't even reached a published state in the spec yet [7]. Besides, this doesn't even cover the case of audio codecs, a problem that has been raised in the webrtc-pc issue #1764, again in a very recent discussion [8].

[7]: https://www.w3.org/TR/webrtc/#rtcrtpsender-interface
[8]: https://github.com/w3c/webrtc-pc/issues/1764

What all this means is that, by mere coincidence, it seems that people working in the WebRTC implementations and specs have just very recently started paying attention to the situation of the audio transmission while in muted state. All those conversations and additions to the specs might end up bringing some improvements to the implementations found in web browsers, but stating an expected timeline for that would be nothing more than speculating.



## RTCRtpSender.replaceTrack()

In any current WebRTC implementation, the actual sending of RTP packets is done by an object of the class RTCRtpSender, which contains a reference to a source MediaStreamTrack from where it gets the audio or video data that must be sent to the remote peer. The method `RTCRtpSender.replaceTrack()` was introduced to allow seamless swapping of the source tracks without any kind of renegotiation needed. The intended use case for this is to e.g. change between front-facing and back cameras of a smartphone in the middle of a call.

`replaceTrack()` includes however one interesting detail: it allows to replace the currently running track with null, i.e. calling `RTCRtpSender.replaceTrack(null)`, which leaves the RTCRtpSender with nothing to send. In this case, the spec says that the RTCRtpSender should simply avoid sending any data [9]:

> If withTrack is null, have the sender stop sending, without negotiating. Otherwise, have the sender switch seamlessly to transmitting withTrack instead of the sender's existing track, without negotiating.

[9]: https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack

The WebRTC spec itself uses this feature of `replaceTrack()` to propose an example "Hold" functionality between peers [10]; Mozilla also provides the same example, complemented with more detailed explanations of how it works [11].

[10]: https://w3c.github.io/webrtc-pc/#hold-functionality
[11]: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Intro_to_RTP#Leveraging_RTP_to_implement_a_hold_feature

Just like it happens with the features of the previous section, there has been a very recent conversation about using the `replaceTrack(null)` feature to achieve a *"hard" mute* for an RTCRtpSender [12]. The proposal was to show off an example of this in the official WebRTC Samples page, but there was some opposition and in the end the example has landed the test-pages section of their website [13].

Note: While testing that demo, the button named "toggle audio with replaceTrack" is the one that calls `replaceTrack(null)` to stop the audio track, but the button itself will be disabled if the browser doesn't support this function. As of Firefox version 58, this button is clickable because Firefox supports the `replaceTrack()` method, but it fails because handling `null` as an argument is not yet implemented (make sure to open the JavaScript Console while testing this demo, to see the debug log messages).

[12]: https://github.com/webrtc/samples/pull/1009
[13]: https://webrtc.github.io/test-pages/src/replaceTrack/index.html

Sadly, even if the `RTCRtpSender.replaceTrack(null)` feature seems like the ideal solution to stop wasting bandwidth during audio mute, it seems that we are *just a bit ahead of time* right now: not only the conversation about this topic has just started barely a month ago, but the main browsers still don't have a conforming implementation of this:

- Chrome, currently at version 64, will start supporting `replaceTrack()` since version 65 [14]. It's still to be seen if this includes support for `replaceTrack(null)`.
- Firefox, currently at version 58, has already shipped support for `replaceTrack()`, but it still doesn't support calling `replaceTrack(null)`, thus defeating the purpose of this trick to mute the audio track.
- Safari is expected to support this as soon as Apple updates it's Blink engine to the same version that Chrome 65 uses.

[14]: https://www.chromestatus.com/feature/5700232381726720



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

**A**. `MediaStreamTrack.enabled` is the officially supported way to mute tracks, but it relies on the underlying codecs to provide an optimized mode for producing "zero-content" data. Current implementations won't take care of that, and the official conversations in this respect have barely started.

**B**. `RTCRtpSender.replaceTrack(null)` seems like the **ideal solution**, and even people who form part of the WebRTC working groups are showcasing this feature in their internal / unofficial test pages. However, it is just too early to rely on this feature, as we may be several months ahead of having a stable implementation across browsers.

**C**. `RTCPeerConnection.removeTrack()` seems like the only solution which is currently well-supported by browsers and might provide the desired results. However, this is the option which brings more complexity to the table.

One of the main requisites is to allow for almost-seamless switch between muted and unmuted states, and this introduces worries about how much time could be taken by both the media availability change and the SDP renegotiation, in the case of the method **C**. To explore this, this *mute-tracks* example code uses HTML and JavaScript to work with the corresponding browser API, in order to see how fast it is to change between modes. It allows to use both methods **A**, **B**, and **C** to mute any or both of the audio and the video tracks. You can use this demo to see that in both Chrome and Firefox the time taken to swap tracks is almost negligible.
