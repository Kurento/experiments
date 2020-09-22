"use strict";

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,
  statsInterval: null,
};

// HTML UI elements
// ================

const ui = {
  // Inputs
  startWebrtc: document.getElementById("uiStartWebrtc"),
  stopWebrtc: document.getElementById("uiStopWebrtc"),

  // Video
  localVideo: document.getElementById("uiLocalVideo"),
  remoteVideo: document.getElementById("uiRemoteVideo"),
};

ui.stopWebrtc.disabled = true;
ui.startWebrtc.addEventListener("click", startWebrtc);
ui.stopWebrtc.addEventListener("click", stopWebrtc);

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

// START implementation
// ====================

async function startWebrtc() {
  // RTCPeerConnection setup.
  startWebrtcPc();

  // SDP Offer/Answer negotiation.
  startWebrtcSdp();

  // Media flow.
  await startWebrtcMedia();

  // Statistics.
  await startWebrtcStats();

  // Update UI.
  ui.startWebrtc.disabled = true;
  ui.stopWebrtc.disabled = false;
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

async function startWebrtcStats() {
  // Program regular retrieval of stats.
  const intervalID = setInterval(async () => {
    const pcSend = global.pcSend;
    const pcRecv = global.pcRecv;

    // getStats() returns RTCStatsReport, which behaves like a Map.
    // Each RTCStatsReport's value is an RTCStats-derived object, where "type"
    // is one of the RTCStatsType enum.
    //
    // Spec:
    // https://w3c.github.io/webrtc-pc/#dom-rtcstatsreport
    // https://w3c.github.io/webrtc-pc/#dom-rtcstats
    // https://w3c.github.io/webrtc-stats/#dom-rtcstatstype
    const [reportSend, reportRecv] = await Promise.all([
      pcSend.getStats(),
      pcRecv.getStats(),
    ]);

    // DEBUG
    reportSend.forEach((stat) => console.log(JSON.stringify(stat)));

    // Extract values to an Array, so map(), filter(), etc are available.
    const statsSend = Array.from(reportSend.values());
    const statsRecv = Array.from(reportRecv.values());

    // Obtain all needed stats, finding them by their type.
    const rtpOutVideos = statsSend.filter(
      (s) => s.type === "outbound-rtp" && s.kind === "video"
    );
    const rtpRemoteInVideos = statsSend.filter(
      (s) => s.type === "remote-inbound-rtp" && s.kind === "video"
    );
    const candidatePairs = statsSend.filter((s) => s.type === "candidate-pair");
    const localCandidates = statsSend.filter(
      (s) => s.type === "local-candidate"
    );
    const remoteCandidates = statsSend.filter(
      (s) => s.type === "remote-candidate"
    );
    const codecs = statsSend.filter((s) => s.type === "codec");
    const transports = statsSend.filter((s) => s.type === "transport");

    // Filter and match stats, to find the wanted values.
    // (report only from first video track that is found)
    const rtpOutVideo = rtpOutVideos[0];
    const rtpRemoteInVideo = rtpRemoteInVideos.find(
      (r) => r.id === rtpOutVideo.remoteId
    );
    const codec = codecs.find((c) => c.id === rtpOutVideo.codecId);
    const transport = transports.find((t) => t.id === rtpOutVideo.transportId);
    const candidatePair = candidatePairs.find(
      (p) => p.id === transport.selectedCandidatePairId
    );
    const localCandidate = localCandidates.find(
      (c) => c.id === candidatePair.localCandidateId
    );
    const remoteCandidate = remoteCandidates.find(
      (c) => c.id === candidatePair.remoteCandidateId
    );

    let data = {};
    data.localSsrc = rtpOutVideo.ssrc;
    data.remoteSsrc = rtpRemoteInVideo.ssrc;
    data.codec = codec.mimeType;
    data.localPort = localCandidate.port;
    data.remotePort = remoteCandidate.port;
    data.packetsSent = rtpOutVideo.packetsSent;
    data.retransmittedPacketsSent = rtpOutVideo.retransmittedPacketsSent;
    data.bytesSent = rtpOutVideo.bytesSent;
    data.nackCount = rtpOutVideo.nackCount;
    data.firCount = rtpOutVideo.firCount ? rtpOutVideo.firCount : 0;
    data.pliCount = rtpOutVideo.pliCount ? rtpOutVideo.pliCount : 0;
    data.sliCount = rtpOutVideo.sliCount ? rtpOutVideo.sliCount : 0;
    data.iceRoundTripTime = candidatePair.currentRoundTripTime;
    data.inBitrate = candidatePair.availableIncomingBitrate
      ? candidatePair.availableIncomingBitrate
      : 0;
    data.outBitrate = candidatePair.availableOutgoingBitrate
      ? candidatePair.availableOutgoingBitrate
      : 0;

    // Use all obtained stats to print their values.
    console.log("[on interval] SEND VIDEO STATS:", data);
  }, 3000);
  global.statsInterval = intervalID;
}

// STOP implementation
// ===================

function stopWebrtc() {
  ui.localVideo.pause();
  ui.localVideo.srcObject = null;
  ui.remoteVideo.pause();
  ui.remoteVideo.srcObject = null;

  clearInterval(global.statsInterval);
  global.pcSend.close();
  global.pcSend = null;
  global.pcRecv.close();
  global.pcRecv = null;

  // Update UI.
  ui.startWebrtc.disabled = false;
  ui.stopWebrtc.disabled = true;

  console.log("[stopWebrtc] Stopped");
}
