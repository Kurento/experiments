"use strict";

// Config
// ======

// 3 spatial simulcast layers, with a different SSRC and RID for each layer.
const videoEncodings = [
  {
    rid: "r0",
    maxBitrate: 3000000,
    scaleResolutionDownBy: 16.0,

    // mediasoup-client/Chrome74.ts:send()
    // https://w3c.github.io/webrtc-svc/#scalabilitymodes*
    // https://w3c.github.io/webrtc-svc/#dependencydiagrams*
    scalabilityMode: "L1T3",
  },
  {
    rid: "r1",
    maxBitrate: 6000000,
    scaleResolutionDownBy: 8.0,

    // mediasoup-client/Chrome74.ts:send()
    scalabilityMode: "L1T3",
  },
  {
    rid: "r2",
    maxBitrate: 9000000,
    scaleResolutionDownBy: 1.0,

    // mediasoup-client/Chrome74.ts:send()
    scalabilityMode: "L1T3",
  },
];

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,

  transceiverSendVideo: null,
};

// HTML UI elements
// ================

const ui = {
  // Inputs
  startWebrtc: document.getElementById("uiStartWebrtc"),
  qualityInputs: document.getElementById("uiQualityInputs"),

  // Video
  localVideo: document.getElementById("uiLocalVideo"),
  remoteVideo: document.getElementById("uiRemoteVideo"),
};

ui.startWebrtc.addEventListener("click", startWebrtc);

for (const input of document.getElementsByName("uiQuality")) {
  input.addEventListener("change", async () => onQualityChanged(input.value));
}

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
  ui.qualityInputs.disabled = false;
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

      // NOTE: A bit of SDP munging is required to make browser-to-browser
      // simulcast work, at least with Chrome:
      // * PeerConnection does not support receiving simulcast, so the SDP
      //   Answer will not, by default, include the "a=simulcast:recv" line.
      // * If the SDP Answer does not contain the "a=simulcast:recv" line, then
      //   simulcast will not be sent. Instead, the PeerConnection will fall
      //   back to only sending the first layer.
      // * If we manually add the "a=simulcast:recv" line, it happens to work,
      //   at least for a quick and dirty demo as this one.
      // See: https://groups.google.com/d/msg/discuss-webrtc/32Y1AUzQ9XU/rfzss0SQAgAJ
      sdpAnswer.sdp +=
        "a=rid:r0 recv\r\n" +
        "a=rid:r1 recv\r\n" +
        "a=rid:r2 recv\r\n" +
        "a=simulcast:recv r0;r1;r2\r\n";

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
    let transceiver;
    if (track.kind === "video") {
      transceiver = pcSend.addTransceiver(track, {
        direction: "sendonly",
        sendEncodings: videoEncodings,
        streams: [localStream],
      });

      if (!global.transceiverSendVideo) {
        global.transceiverSendVideo = transceiver;
      }
    } else {
      transceiver = pcSend.addTransceiver(track, {
        direction: "sendonly",
        streams: [localStream],
      });
    }

    console.log(
      `[pcSend.addTransceiver] kind: ${track.kind}, direction: ${transceiver.direction}`
    );
  }
}

// onQualityChanged() implementation
// =================================

async function onQualityChanged(value) {
  const quality = parseInt(value, 10);
  if (isNaN(quality)) {
    console.error("[onQualityChanged] BUG: value is NaN");
    return;
  }

  const transceiver = global.transceiverSendVideo;
  if (!transceiver) {
    console.error("[onQualityChanged] BUG: no video transceiver");
    return;
  }

  console.log("[onQualityChanged] Simulcast layer:", quality);

  const parameters = transceiver.sender.getParameters();
  parameters.encodings.forEach((encoding, index) => {
    if (index === quality) {
      encoding.active = true;
    } else {
      encoding.active = false;
    }
  });

  await transceiver.sender.setParameters(parameters);
}
