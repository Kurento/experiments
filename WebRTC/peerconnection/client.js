"use strict";

// Global state
// ============

const global = {
  pcSend: null,
  pcRecv: null,
  statsInterval: null,

  // Memory used to calculate averages and rates.
  printWebRtcStats: { bytesSent: 0 },
  printPingPlotterMos: {
    packetsLost: 0,
    packetsSent: 0,
    retransmittedPacketsSent: 0,
  },
  printJitsiQualityPct: {
    bytesSent: 0,
  },
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
  const statsData = {
    packetsLost: 0,
    packetsSent: 0,
    retransmittedPacketsSent: 0,
    bytesSent: 0,
  };

  // Retrieve stats once per second; this is needed to calculate values such as
  // bitrates (bits per second) or interval losses (packets lost per second).
  const intervalID = setInterval(async () => {
    const pc = global.pcSend;

    const statsReport = await pc.getStats();

    // These functions are totally independent, so no code reuse between them.
    printWebRtcStats(statsReport);
    printPingPlotterMos(statsReport);
    printJitsiQualityPct(statsReport);
  }, 1000);
  global.statsInterval = intervalID;
}

/**
 * Extracts specific stats arrays from an RTCStatsReport.
 *
 * @param {RTCStatsReport} statsReport A stats report obtained from
 *   `RTCPeerConnection.getStats()`.
 * @returns {Object} An object containing each stat type in an individual array.
 */
function getStatsArrays(statsReport) {
  // DEBUG - Print all contents of the RTCStatsReport.
  // statsReport.forEach((stat) => console.log(JSON.stringify(stat)));

  // RTCStatsReport behaves like a Map. Each value is an RTCStats-derived
  // object, where "type" is one of the RTCStatsType enum.
  //
  // Spec:
  // - RTCStatsReport: https://w3c.github.io/webrtc-pc/#dom-rtcstatsreport
  // - RTCStats: https://w3c.github.io/webrtc-pc/#dom-rtcstats
  // - RTCStatsType: https://w3c.github.io/webrtc-stats/#dom-rtcstatstype

  const ret = {
    candidatePairs: [],
    codecs: [],
    localCandidates: [],
    localOutVideos: [],
    remoteCandidates: [],
    remoteInVideos: [],
    transports: [],
  };

  // Build an array for each type of stats.
  statsReport.forEach((stat) => {
    switch (stat.type) {
      case "candidate-pair":
        ret.candidatePairs.push(stat);
        break;
      case "codec":
        ret.codecs.push(stat);
        break;
      case "local-candidate":
        ret.localCandidates.push(stat);
        break;
      case "outbound-rtp":
        if (stat.kind === "video") {
          ret.localOutVideos.push(stat);
        }
        break;
      case "remote-candidate":
        ret.remoteCandidates.push(stat);
        break;
      case "remote-inbound-rtp":
        if (stat.kind === "video") {
          ret.remoteInVideos.push(stat);
        }
        break;
      case "transport":
        ret.transports.push(stat);
        break;
      default:
        break;
    }
  });

  return ret;
}

function printWebRtcStats(videoStatsReport) {
  const stats = getStatsArrays(videoStatsReport);

  // Filter and match stats, to find the wanted values
  // (report only from first video track that is found)

  // Note: in TypeScript, most of these would be using the '?' operator.

  const localOutVideoStats = stats.localOutVideos[0];
  const remoteInVideoStats = stats.remoteInVideos.find(
    (r) => r.id === localOutVideoStats.remoteId
  );
  const codecStats = stats.codecs.find(
    (c) => c.id === localOutVideoStats.codecId
  );
  const transportStats = stats.transports.find(
    (t) => t.id === localOutVideoStats.transportId
  );
  const candidatePairStats = stats.candidatePairs.find(
    (p) => p.id === transportStats.selectedCandidatePairId
  );
  const localCandidateStats = stats.localCandidates.find(
    (c) => c.id === candidatePairStats.localCandidateId
  );
  const remoteCandidateStats = stats.remoteCandidates.find(
    (c) => c.id === candidatePairStats.remoteCandidateId
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

/* ==== printPingPlotterMos -- BEGIN ==== */

function printPingPlotterMos(videoStatsReport) {
  const stats = getStatsArrays(videoStatsReport);

  // Filter and match stats, to find the wanted values
  // (report only from first video track that is found)

  const localOutVideoStats = stats.localOutVideos[0];
  const remoteInVideoStats = stats.remoteInVideos.find(
    (r) => r.id === localOutVideoStats.remoteId
  );

  // Calculate per-second values.
  const packetsLostPerS =
    remoteInVideoStats.packetsLost - global.printPingPlotterMos.packetsLost;
  const packetsSentPerS =
    localOutVideoStats.packetsSent - global.printPingPlotterMos.packetsSent;
  const packetsResentPerS =
    localOutVideoStats.retransmittedPacketsSent -
    global.printPingPlotterMos.retransmittedPacketsSent;

  // Update values in memory, for the next iteration.
  global.printPingPlotterMos.packetsLost = remoteInVideoStats.packetsLost;
  global.printPingPlotterMos.packetsSent = localOutVideoStats.packetsSent;
  global.printPingPlotterMos.retransmittedPacketsSent =
    localOutVideoStats.retransmittedPacketsSent;

  // Prepare arguments and call the calculate function.
  const latencyMs = (1000.0 * remoteInVideoStats.roundTripTime) / 2.0;
  const jitterMs = 1000.0 * remoteInVideoStats.jitter;
  const packetLossPct =
    (100.0 * packetsLostPerS) / (packetsSentPerS - packetsResentPerS);

  const pingPlotterMos = calculatePingPlotterMos(
    latencyMs,
    jitterMs,
    packetLossPct
  );
  console.log("PingPlotter MOS (stars [1 - 4.4]):", pingPlotterMos);
}

// Calculate a Mean Opinion Score (MOS)
// https://www.pingman.com/kb/article/how-is-mos-calculated-in-pingplotter-pro-50.html
function calculatePingPlotterMos(latencyMs, jitterMs, packetLossPct) {
  const EffectiveLatency = latencyMs + jitterMs * 2.0 + 10.0;
  let R;
  if (EffectiveLatency < 160.0) {
    R = 93.2 - EffectiveLatency / 40.0;
  } else {
    R = 93.2 - (EffectiveLatency - 120.0) / 10.0;
  }
  R = R - packetLossPct * 2.5;
  const MOS = 1 + 0.035 * R + 0.000007 * R * (R - 60) * (100 - R);
  return MOS;
}

/* ==== printPingPlotterMos -- END ==== */

/* ==== printJitsiQualityPct -- BEGIN ==== */

function printJitsiQualityPct(videoStatsReport) {
  const stats = getStatsArrays(videoStatsReport);

  // Filter and match stats, to find the wanted values
  // (report only from first video track that is found)

  const localOutVideoStats = stats.localOutVideos[0];

  // Calculate per-second values.
  const bytesSentPerS =
    localOutVideoStats.bytesSent - global.printJitsiQualityPct.bytesSent;

  // Update values in memory, for the next iteration.
  global.printJitsiQualityPct.bytesSent = localOutVideoStats.bytesSent;

  // Prepare arguments and call the calculate function.
  const width = localOutVideoStats.frameWidth;
  const height = localOutVideoStats.frameHeight;
  const bitrateSentKbps = (bytesSentPerS * 8) / 1000.0;

  // About bitrateCapKbps:
  // Possible sources of maximum bitrate caps are:
  // - SDP m-section with the attribute `b=AS`.
  // - RtpParameters max bitrate set with
  //   `RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })`.
  // Here, we use `null` because in this example there is no cap set.
  const bitrateCapKbps = null;

  const jitsiQualityPct = calculateJitsiQualityPct(
    width,
    height,
    bitrateSentKbps,
    bitrateCapKbps
  );
  console.log("Jitsi Quality Percent ([0 - 100%]):", jitsiQualityPct);
}

/**
 * This function is translated from the same one in WebRTC source code:
 * https://source.chromium.org/chromium/chromium/src/+/master:third_party/webrtc/media/engine/webrtc_video_engine.cc;l=266-282;drc=ceb44959cae281f8a77174acc96676efc9ae6db1
 *
 * PROBLEMS:
 * Other
 */
function GetMaxDefaultVideoBitrateKbps(width, height, is_screenshare) {
  let max_bitrate;
  if (width * height <= 320 * 240) {
    max_bitrate = 600;
  } else if (width * height <= 640 * 480) {
    max_bitrate = 1700;
  } else if (width * height <= 960 * 540) {
    max_bitrate = 2000;
  } else {
    max_bitrate = 2500;
  }
  if (is_screenshare) max_bitrate = Math.max(max_bitrate, 1200);
  return max_bitrate;
}

/**
 * The maximum bitrate to use as reference against the current bitrate.
 *
 * This cap helps in the cases where the participant's bitrate is high
 * but not enough to fulfill high targets, such as with 1080p.
 *
 * @const {number}
 */
const MAX_TARGET_BITRATE_KBPS = 2500;

/**
 * Calculates a "connection quality" percentage value.
 *
 * @param {number} width Current width of the output video, in pixels.
 * @param {number} height Current height of the output video, in pixels.
 * @param {number} bitrateSentKbps Current output bitrate, in Kbps.
 * @param {?number} bitrateCapKbps Any maximum bitrate cap that might be
 *   configured on the output track, in Kbps.
 * @returns {number} Quality percentage measurement, from 0% to 100%.
 *
 * About width, height:
 * The output video resolution can be found in the  stats types:
 * - "track"
 * - "media-source"
 * - "outbound-rtp"
 * Otherwise, it also can be read directly from MediaStreamTrack.getSettings():
 * - https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings
 * - https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/height
 *
 * About bitrateCapKbps:
 * Possible sources of maximum bitrate caps are:
 * - SDP m-section with the attribute `b=AS`.
 * - RtpParameters max bitrate set with
 *   `RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })`.
 *
 * Based on the function `_calculateConnectionQuality()` in Jitsi Meet:
 * https://github.com/jitsi/lib-jitsi-meet/blob/412606485511afc9a2495f6fb58aa76f65d509a9/modules/connectivity/ConnectionQuality.js#L322
 */
function calculateJitsiQualityPct(
  width,
  height,
  bitrateSentKbps,
  bitrateCapKbps
) {
  // Target sending bitrate in perfect conditions.
  let targetKbps = GetMaxDefaultVideoBitrateKbps(width, height, false);
  targetKbps = Math.min(targetKbps, MAX_TARGET_BITRATE_KBPS);
  if (bitrateCapKbps) {
    targetKbps = Math.min(targetKbps, bitrateCapKbps);
  }

  // "Quality" is the ratio between actual bitrate and target bitrate.
  const qualityPct = (100.0 * bitrateSentKbps) / targetKbps;

  return qualityPct;
}

/* ==== printJitsiQualityPct -- END ==== */

/* ==== Ideas that can be used in the UI -- BEGIN ==== */

/**
 * The connection quality percentage that must be reached to be considered of
 * good quality and can result in the quality display being hidden.
 *
 * @const {number}
 */
const UI_QUALITY_DISPLAY_THRESHOLD = 30;

/**
 * An array of display configurations for the quality indicator and its bars.
 *
 * @const
 *
 * Jisti compares the quality percent to the { percent } fields of this array,
 * and chooses the first object that satisfies the threshold.
 *
 * Other UI tips shown in the Jitsi quality indicator are:
 * - "Inactive" when the connection hasn't been started yet.
 * - "Lost" when the connection is interrupted because packets suddenly
 *    stopped flowing.
 */
const UI_QUALITY_TO_WIDTH = [
  // Full (3 bars)
  {
    colorClass: "status-high",
    percent: UI_QUALITY_DISPLAY_THRESHOLD,
    tip: "Good",
    width: "100%",
  },

  // 2 bars
  {
    colorClass: "status-med",
    percent: 10,
    tip: "Non Optimal",
    width: "66%",
  },

  // 1 bar
  {
    colorClass: "status-low",
    percent: 0,
    tip: "Poor",
    width: "33%",
  },

  // Note: we never show 0 bars as long as there is a connection.
];

/* ==== Ideas that can be used in the UI -- END ==== */

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
