"use strict";

// Config
// ======

// 3 spatial simulcast layers, with a different SSRC and RID for each layer.
// RTCRtpEncodingParameters[]
// https://w3c.github.io/webrtc-pc/#dom-rtcrtpencodingparameters
const simulcastEncodings = [
  {
    rid: "r0",
    active: false,
    maxBitrate: 2000000,
    scaleResolutionDownBy: 16.0,
  },
  {
    rid: "r1",
    active: false,
    maxBitrate: 2000000,
    scaleResolutionDownBy: 8.0,
  },
  {
    rid: "r2",
    active: true,
    maxBitrate: 2000000,
    scaleResolutionDownBy: 1.0,
  },
];

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,

  tcSendVideo: null,
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
    const kind = trackEvent.track.kind;
    const direction = trackEvent.transceiver
      ? trackEvent.transceiver.direction
      : "unknown";
    console.log(`[on pcRecv.track] kind: ${kind}, direction: ${direction}`);

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
    const tcInit = {
      direction: "sendonly",
      streams: [localStream],
    };

    // "sendEncodings" is only valid for video tracks.
    if (track.kind === "video") {
      tcInit.sendEncodings = simulcastEncodings;
    }

    // NOTE: addTransceiver() triggers event "negotiationneeded".
    const transceiver = pcSend.addTransceiver(track, tcInit);

    if (track.kind === "video" && !global.tcSendVideo) {
      global.tcSendVideo = transceiver;
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

  const tcSendVideo = global.tcSendVideo;
  if (!tcSendVideo) {
    console.error("[onQualityChanged] BUG: no video sending transceiver");
    return;
  }

  console.log("[onQualityChanged] Simulcast encoding:", quality);

  const senderParams = tcSendVideo.sender.getParameters();
  senderParams.encodings.forEach((encoding, index) => {
    if (index === quality) {
      encoding.active = true;
    } else {
      encoding.active = false;
    }
  });

  await tcSendVideo.sender.setParameters(senderParams);
}
