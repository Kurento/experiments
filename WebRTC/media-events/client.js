"use strict";

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,

  // Workaround for Chrome bug #740501: skip nested negotiations.
  // - https://bugs.chromium.org/p/chromium/issues/detail?id=740501
  // - https://stackoverflow.com/questions/48963787/failed-to-set-local-answer-sdp-called-in-wrong-state-kstable/49055883#49055883
  isNegotiating: false,
};

// HTML UI elements
// ================

const ui = {
  // Inputs
  start: document.getElementById("uiStart"),
  stop: document.getElementById("uiStop"),

  // Video
  localVideo: document.getElementById("uiLocalVideo"),
  remoteVideo: document.getElementById("uiRemoteVideo"),

  // Debug
  console: document.getElementById("uiConsole"),
};

ui.start.addEventListener("click", startWebrtc);
ui.stop.addEventListener("click", stopWebrtc);
ui.stop.disabled = true;

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

// Send all logs to both console and UI.
{
  const logMethod = console.log;
  const logMessages = [];

  console.log = function () {
    logMessages.push.apply(logMessages, arguments);
    ui.console.innerHTML = logMessages.reduce(
      (acc, cur) => acc + cur + "<br>",
      ""
    );
    logMethod.apply(console, arguments);
  };
}

// START implementation
// ====================

async function startWebrtc() {
  // HTMLMediaElement events setup.
  startMediaEvents();

  // RTCPeerConnection setup.
  startWebrtcPc();

  // SDP Offer/Answer negotiation.
  startWebrtcSdp();

  // Media flow.
  await startWebrtcMedia();

  // Update UI.
  ui.start.disabled = true;
  ui.stop.disabled = false;
}

function startMediaEvents() {
  function handleEvent(event) {
    const element = event.target;
    let details = "";

    switch (event.type) {
      case "loadedmetadata":
        details = `duration: ${element.duration}, size: ${element.videoWidth}x${element.videoHeight}`;
        break;
      case "durationchange":
        details = `duration: ${element.duration}`;
        break;
      case "ratechange":
        details = `rate: ${element.playbackRate}, default: ${element.defaultPlaybackRate}`;
        break;
      case "resize":
        details = `size: ${element.videoWidth}x${element.videoHeight}`;
        break;
      case "volumechange":
        details = `volume: ${element.volume}, muted: ${element.muted}`;
        break;
      default:
        break;
    }

    console.log(`Event ${event.target.id}.${event.type} ${details}`);
  }

  // Relevant documentation:
  // * https://html.spec.whatwg.org/multipage/media.html#mediaevents
  // * https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events

  const eventNames = [
    // Network fetch:
    "loadstart",
    // "progress", // Constantly emitted during playback.
    "suspend",
    "abort",
    "error",
    "emptied",
    "stalled",

    // Playback status:
    "loadedmetadata",
    "loadeddata",
    "canplay",
    "canplaythrough",
    "playing",
    "waiting",
    "seeking",
    "seeked",
    "ended",

    // Playback control:
    "durationchange",
    // "timeupdate", // Constantly emitted during playback.
    "play",
    "pause",
    "ratechange",
    "resize",
    "volumechange",
  ];

  for (const eventName of eventNames) {
    ui.localVideo.addEventListener(eventName, handleEvent);
  }
  // Seen in StackOverflow but not in docs ??
  ui.localVideo.addEventListener("size", handleEvent);

  for (const eventName of eventNames) {
    ui.remoteVideo.addEventListener(eventName, handleEvent);
  }
  // Seen in StackOverflow but not in docs ??
  ui.remoteVideo.addEventListener("size", handleEvent);
}

function startWebrtcPc() {
  const pcSend = new RTCPeerConnection();
  global.pcSend = pcSend;

  const pcRecv = new RTCPeerConnection();
  global.pcRecv = pcRecv;

  async function onIceCandidate(iceEvent, pc) {
    if (iceEvent.candidate) {
      // Send the candidate to the remote peer.
      try {
        await pc.addIceCandidate(iceEvent.candidate);
      } catch (error) {
        console.error("[onIceCandidate] Error:", error);
      }
    } else {
      // console.log("[onIceCandidate] All ICE candidates have been sent");
    }
  }

  pcSend.addEventListener("icecandidate", (iceEvent) =>
    onIceCandidate(iceEvent, pcRecv)
  );
  pcRecv.addEventListener("icecandidate", (iceEvent) =>
    onIceCandidate(iceEvent, pcSend)
  );
}

function startWebrtcSdp() {
  const pcSend = global.pcSend;
  const pcRecv = global.pcRecv;

  pcSend.addEventListener("negotiationneeded", async () => {
    // console.log("[on pcSend.negotiationneeded]");

    if (global.isNegotiating) {
      console.log("Chrome bug #740501 - SKIP");
      return;
    }
    global.isNegotiating = true;

    try {
      const sdpOffer = await pcSend.createOffer();
      await pcSend.setLocalDescription(sdpOffer);
      await pcRecv.setRemoteDescription(pcSend.localDescription);
      // console.log("[pcSend] SDP Offer:", pcSend.localDescription.sdp);

      const sdpAnswer = await pcRecv.createAnswer();
      await pcRecv.setLocalDescription(sdpAnswer);
      await pcSend.setRemoteDescription(pcRecv.localDescription);
      // console.log("[pcRecv] SDP Answer:", pcRecv.localDescription.sdp);
    } catch (error) {
      console.error("[on pcSend.negotiationneeded] Error:", error);
    }
  });

  pcSend.addEventListener("signalingstatechange", () => {
    global.isNegotiating = pcSend.signalingState != "stable";
  });

  pcRecv.addEventListener("iceconnectionstatechange", () => {
    // console.log("[on pcRecv.iceconnectionstatechange] state:", pcRecv.iceConnectionState);
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
    const delay_s = 5;

    console.log(`[on pcRecv.track] kind: ${kind}, direction: ${direction}`);

    if (kind === "video") {
      console.log(
        `[on pcRecv.track](${kind}) Hold remote video for ${delay_s} seconds...`
      );
      setTimeout(() => {
        console.log(`[on pcRecv.track](${kind}) Set remote video now`);

        // Show the stream. Playback doesn't start automatically because the
        // <video> element is not "autoplay".
        ui.remoteVideo.srcObject = trackEvent.streams[0];

        console.log(
          `[on pcRecv.track](${kind}) Hold play() for ${delay_s} seconds...`
        );
        setTimeout(() => {
          console.log(`[on pcRecv.track](${kind}) play() remote video now`);
          ui.remoteVideo.play();
        }, delay_s * 1000);
      }, delay_s * 1000);
    }
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

  // Show the stream and start playback.
  ui.localVideo.srcObject = localStream;
  ui.localVideo.play();

  // Add the new tracks to the sender PeerConnection.
  for (const track of localStream.getTracks()) {
    // NOTE: addTrack() causes creation of a "sendrecv" RTCRtpTransceiver.
    //       https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#New_senders
    // NOTE: addTrack() triggers event "negotiationneeded".
    const sender = pcSend.addTrack(track, localStream);

    // Log the new track and its corresponding transceiver's direction.
    const transceiver = pcSend
      .getTransceivers()
      .find((tc) => tc.sender === sender);
    const direction = transceiver ? transceiver.direction : "unknown";
    console.log(
      `[pcSend.addTrack] kind: ${track.kind}, direction: ${direction}`
    );
  }
}

// STOP implementation
// ===================

function stopWebrtc() {
  ui.localVideo.pause();
  ui.localVideo.srcObject = null;
  ui.remoteVideo.pause();
  ui.remoteVideo.srcObject = null;

  global.pcSend.close();
  global.pcSend = null;
  global.pcRecv.close();
  global.pcRecv = null;

  // Update UI.
  ui.start.disabled = false;
  ui.stop.disabled = true;

  console.log("[stopWebrtc] Stopped");
}
