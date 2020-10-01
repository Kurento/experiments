"use strict";

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,
  statsInterval: null,

  // Memory used to calculate averages and rates.
  printWebRtcStats: { bytesSent: 0 },
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
  // Retrieve stats once per second; this is needed to calculate values such as
  // bitrates (bits per second) or interval losses (packets lost per second).
  const intervalID = setInterval(async () => {
    const pc = global.pcSend;

    // RTCStatsReport behaves like a Map. Each value is an RTCStats-derived
    // object, where "type" is one of the RTCStatsType enum.
    //
    // Doc:
    // - RTCStatsReport: https://w3c.github.io/webrtc-pc/#dom-rtcstatsreport
    // - RTCStats: https://w3c.github.io/webrtc-pc/#dom-rtcstats
    // - RTCStatsType: https://w3c.github.io/webrtc-stats/#dom-rtcstatstype
    const statsMap = await pc.getStats();

    // DEBUG - Print all contents of the RTCStatsReport.
    // statsMap.forEach((stats) => console.log(JSON.stringify(stats)));

    printWebRtcStats(statsMap);
  }, 1000);
  global.statsInterval = intervalID;
}

function printWebRtcStats(statsMap) {
  // Filter and match stats, to find the wanted values
  // (report only from first video track that is found)

  // Note: in TypeScript, most of these would be using the '?' operator.

  const localOutVideoStats = Array.from(statsMap.values()).find(
    (stats) => stats.type === "outbound-rtp" && stats.kind === "video"
  );
  const remoteInVideoStats = statsMap.get(localOutVideoStats.remoteId);
  const codecStats = statsMap.get(localOutVideoStats.codecId);
  const transportStats = statsMap.get(localOutVideoStats.transportId);
  const candidatePairStats = statsMap.get(
    transportStats.selectedCandidatePairId
  );
  const localCandidateStats = statsMap.get(candidatePairStats.localCandidateId);
  const remoteCandidateStats = statsMap.get(
    candidatePairStats.remoteCandidateId
  );

  // Calculate per-second values.
  const bytesSentPerS =
    localOutVideoStats.bytesSent - global.printWebRtcStats.bytesSent;

  // Update values in memory, for the next iteration.
  global.printWebRtcStats.bytesSent = localOutVideoStats.bytesSent;

  // Prepare data and print all values.
  const bitrateSentKbps = (bytesSentPerS * 8) / 1000.0;
  const availableInBitrateKbps = candidatePairStats.availableIncomingBitrate
    ? candidatePairStats.availableIncomingBitrate / 1000.0
    : 0;
  const availableOutBitrateKbps = candidatePairStats.availableOutgoingBitrate
    ? candidatePairStats.availableOutgoingBitrate / 1000.0
    : 0;
  let data = {};
  data.localSsrc = localOutVideoStats.ssrc;
  data.remoteSsrc = remoteInVideoStats.ssrc;
  data.codec = codecStats.mimeType;
  data.localPort = localCandidateStats.port;
  data.remotePort = remoteCandidateStats.port;
  data.packetsSent = localOutVideoStats.packetsSent;
  data.retransmittedPacketsSent = localOutVideoStats.retransmittedPacketsSent;
  data.bytesSent = localOutVideoStats.bytesSent;
  data.nackCount = localOutVideoStats.nackCount;
  data.firCount = localOutVideoStats.firCount ? localOutVideoStats.firCount : 0;
  data.pliCount = localOutVideoStats.pliCount ? localOutVideoStats.pliCount : 0;
  data.sliCount = localOutVideoStats.sliCount ? localOutVideoStats.sliCount : 0;
  data.iceRoundTripTime = candidatePairStats.currentRoundTripTime;
  data.bitrateSentKbps = bitrateSentKbps;
  data.availableInBitrateKbps = availableInBitrateKbps;
  data.availableOutBitrateKbps = availableOutBitrateKbps;

  console.log("[printWebRtcStats] VIDEO STATS:", data);
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
