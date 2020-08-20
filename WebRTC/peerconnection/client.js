"use strict";

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,
};

// HTML UI elements
// ================

const ui = {
  // Inputs
  startWebrtc: document.getElementById("uiStartWebrtc"),

  // Video
  localVideo: document.getElementById("uiLocalVideo"),
  remoteVideo: document.getElementById("uiRemoteVideo"),
};

ui.startWebrtc.addEventListener("click", startWebrtc);

window.addEventListener("load", () => {
  console.log("[on window.load] Page loaded");

  if ("adapter" in window) {
    console.log(
      // eslint-disable-next-line no-undef
      `[on window.load] webrtc-adapter loaded, browser: '${adapter.browserDetails.browser}', version: '${adapter.browserDetails.version}'`
    );
  } else {
    console.warn(
      "[on window.load] webrtc-adapter is not loaded! an install or config issue?"
    );
  }
});

window.addEventListener("beforeunload", () => {
  console.log("[on window.beforeunload] Page unloading");
});

// startWebrtc() implementation
// ============================

async function startWebrtc() {
  // RTCPeerConnection setup.
  startWebrtcPc();

  // SDP Offer/Answer negotiation.
  startWebrtcSdp();

  // Media flow.
  await startWebrtcMedia();

  // Update UI.
  ui.startWebrtc.disabled = true;
}

function startWebrtcPc() {
  const pcSend = new RTCPeerConnection();
  global.pcSend = pcSend;

  const pcRecv = new RTCPeerConnection();
  global.pcRecv = pcRecv;

  pcSend.addEventListener("icecandidate", async (iceEvent) => {
    if (iceEvent.candidate) {
      // Send the candidate to the remote peer.
      try {
        await pcRecv.addIceCandidate(iceEvent.candidate);
      } catch (err) {
        console.error("[on pcSend.icecandidate] Error:", err);
      }
    } else {
      console.log("[on pcSend.icecandidate] All ICE candidates have been sent");
    }
  });

  pcRecv.addEventListener("icecandidate", async (iceEvent) => {
    if (iceEvent.candidate) {
      // Send the candidate to the remote peer.
      try {
        await pcSend.addIceCandidate(iceEvent.candidate);
      } catch (err) {
        console.error("[on pcRecv.icecandidate] Error:", err);
      }
    } else {
      console.log("[on pcRecv.icecandidate] All ICE candidates have been sent");
    }
  });
}

function startWebrtcSdp() {
  const pcSend = global.pcSend;
  const pcRecv = global.pcRecv;

  pcSend.addEventListener("negotiationneeded", async () => {
    console.log("[on pcSend.negotiationneeded]");

    try {
      const sdpOffer = await pcSend.createOffer();
      await pcSend.setLocalDescription(sdpOffer);
      await pcRecv.setRemoteDescription(pcSend.localDescription);
      console.log("[pcSend] SDP Offer:", pcSend.localDescription.sdp);

      const sdpAnswer = await pcRecv.createAnswer();
      await pcRecv.setLocalDescription(sdpAnswer);
      await pcSend.setRemoteDescription(pcRecv.localDescription);
      console.log("[pcRecv] SDP Answer:", pcRecv.localDescription.sdp);
    } catch (err) {
      console.error("[on pcSend.negotiationneeded] Error:", err);
    }
  });

  pcRecv.addEventListener("iceconnectionstatechange", () => {
    console.log(
      "[on pcRecv.iceconnectionstatechange] pcRecv.iceConnectionState:",
      pcRecv.iceConnectionState
    );
  });
}

async function startWebrtcMedia() {
  const pcSend = global.pcSend;
  const pcRecv = global.pcRecv;

  pcRecv.addEventListener("track", (trackEvent) => {
    console.log(
      `[on pcRecv.track] kind: ${trackEvent.track.kind}, direction: ${trackEvent.transceiver.direction}`
    );

    // Show the stream.
    // This starts automatically because the <video> element is "autoplay".
    ui.remoteVideo.srcObject = trackEvent.streams[0];
  });

  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
  } catch (err) {
    console.error("[startWebrtcMedia] Error:", err);
    return;
  }

  // Show the stream.
  // This starts automatically because the <video> element is "autoplay".
  ui.localVideo.srcObject = localStream;

  // Add the new tracks to the sender PeerConnection.
  for (const track of localStream.getTracks()) {
    // NOTE: addTrack() causes creation of a "sendrecv" RTCRtpTransceiver.
    //       https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#New_senders
    // NOTE: addTrack() triggers event "negotiationneeded".
    const sender = pcSend.addTrack(track, localStream);

    // Log the new track and its corresponding transceiver's direction.
    const tc = pcSend.getTransceivers().find((tc) => tc.sender == sender);
    console.log(
      `[pcSend.addTrack] kind: ${track.kind}, direction: ${tc.direction}`
    );
  }
}
