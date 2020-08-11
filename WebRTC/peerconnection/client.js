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
  console.log("Page loaded");

  if ("adapter" in window) {
    console.log(
      // eslint-disable-next-line no-undef
      `webrtc-adapter loaded, browser: '${adapter.browserDetails.browser}', version: '${adapter.browserDetails.version}'`
    );
  } else {
    console.warn("webrtc-adapter is not loaded! an install or config issue?");
  }
});

window.addEventListener("beforeunload", () => {
  console.log("Page unloading");
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
        console.error("[pcSend.icecandidate] Error:", err);
      }
    } else {
      console.log("[pcSend.icecandidate] All ICE candidates have been sent");
    }
  });

  pcRecv.addEventListener("icecandidate", async (iceEvent) => {
    if (iceEvent.candidate) {
      // Send the candidate to the remote peer.
      try {
        await pcSend.addIceCandidate(iceEvent.candidate);
      } catch (err) {
        console.error("[pcRecv.icecandidate] Error:", err);
      }
    } else {
      console.log("[pcRecv.icecandidate] All ICE candidates have been sent");
    }
  });
}

function startWebrtcSdp() {
  const pcSend = global.pcSend;
  const pcRecv = global.pcRecv;

  pcSend.addEventListener("negotiationneeded", async () => {
    console.log("[pcSend.negotiationneeded]");

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
      console.error("[pcSend.negotiationneeded] Error:", err);
    }
  });

  pcRecv.addEventListener("iceconnectionstatechange", () => {
    console.log(
      "[pcRecv.iceconnectionstatechange] pcRecv.iceConnectionState:",
      pcRecv.iceConnectionState
    );
  });
}

async function startWebrtcMedia() {
  const pcSend = global.pcSend;
  const pcRecv = global.pcRecv;

  pcRecv.addEventListener("track", (trackEvent) => {
    console.log(
      `[pcRecv.track] kind: ${trackEvent.track.kind}, direction: ${trackEvent.transceiver.direction}`
    );
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

  // Start showing the local video.
  // This works automatically because `ui.localVideo` is "autoplay".
  ui.localVideo.srcObject = localStream;

  // Add the new tracks to the sender PeerConnection.
  for (const track of localStream.getTracks()) {
    // NOTE: `addTrack()` triggers event "negotiationneeded".
    // NOTE: `addTrack()` causes creation of a "sendrecv" RTCRtpTransceiver.
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack
    const sender = pcSend.addTrack(track, localStream);

    const transceiver = pcSend
      .getTransceivers()
      .find((t) => t.sender == sender);
    console.log(
      `[pcSend.addTrack] kind: ${track.kind}, direction: ${transceiver.direction}`
    );
  }
}
