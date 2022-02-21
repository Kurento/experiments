"use strict";

// ----------------------------------------------------------------------------

// HTML UI elements
// ================

const ui = {
  // Video
  localVideo: document.getElementById("localVideo"),
  remoteVideo: document.getElementById("remoteVideo"),

  // Settings
  useVideo: document.getElementById("useVideo"),
  logSdp: document.getElementById("logSdp"),
  forceSendonly: document.getElementById("forceSendonly"),

  // Controls
  start: document.getElementById("start"),
  disableAudio: document.getElementById("disableAudio"),
  disableVideo: document.getElementById("disableVideo"),
  replaceAudio: document.getElementById("replaceAudio"),
  replaceVideo: document.getElementById("replaceVideo"),
  removeAudio: document.getElementById("removeAudio"),
  removeVideo: document.getElementById("removeVideo"),

  // Output
  state: document.getElementById("state"),
  log: document.getElementById("log"),
  stats: document.getElementById("stats"),
};

ui.useVideo.checked = true;
ui.forceSendonly.checked = true;

ui.start.onclick = async () => await start();
ui.disableAudio.onclick = () => disableTrack(ui.disableAudio.checked, true);
ui.disableVideo.onclick = () => disableTrack(ui.disableVideo.checked, false);
ui.replaceAudio.onclick = async () =>
  await replaceTrack(ui.replaceAudio.checked, true);
ui.replaceVideo.onclick = async () =>
  await replaceTrack(ui.replaceVideo.checked, false);
ui.removeAudio.onclick = () => removeTrack(ui.removeAudio.checked, true);
ui.removeVideo.onclick = () => removeTrack(ui.removeVideo.checked, false);

// ----------------------------------------------------------------------------

// Global state
// ============

class MediaVars {
  constructor(uiDisable, uiReplace, uiRemove, track, sender) {
    this.uiDisable = uiDisable || null; // <input type="checkbox">
    this.uiReplace = uiReplace || null; // <input type="checkbox">
    this.uiRemove = uiRemove || null; // <input type="checkbox">
    this.track = track || null; // MediaStreamTrack
    this.sender = sender || null; // RTCRtpSender
  }
}

let stream = null;
const pcLocal = new RTCPeerConnection();
const pcRemote = new RTCPeerConnection();
const audioVars = new MediaVars(
  ui.disableAudio,
  ui.replaceAudio,
  ui.removeAudio
);
const videoVars = new MediaVars(
  ui.disableVideo,
  ui.replaceVideo,
  ui.removeVideo
);

// ----------------------------------------------------------------------------

async function start() {
  await startMedia();
  await startWebRTC();
}

async function startMedia() {
  const useVideo = ui.useVideo.checked;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: useVideo,
      audio: true,
    });
    ui.localVideo.srcObject = stream;

    // Save the audio track
    {
      audioVars.track = stream.getAudioTracks()[0];
      audioVars.sender = pcLocal.addTrack(audioVars.track, stream);
      // pc.addTrack() triggers "negotiationneeded"
    }

    // Save the video track
    if (useVideo) {
      videoVars.track = stream.getVideoTracks()[0];
      videoVars.sender = pcLocal.addTrack(videoVars.track, stream);
      // pc.addTrack() triggers "negotiationneeded"
    }
  } catch (error) {
    log("[getUserMedia] Error: " + error);
  }

  // Program regular updating of stats
  setInterval(
    () =>
      Promise.all([pcLocal.getStats(), pcRemote.getStats()])
        .then(([s1, s2]) => {
          let str = "";
          s1.forEach((stat) => {
            if (stat.type == "outbound-rtp" && !stat.isRemote) {
              str += "<h4>Sender side</h4>" + dumpStats(stat);
            }
          });
          s2.forEach((stat) => {
            if (stat.type == "inbound-rtp" && !stat.isRemote) {
              str += "<h4>Receiver side</h4>" + dumpStats(stat);
            }
          });
          update(ui.stats, "<small>" + str + "</small>");
        })
        .catch((error) => log(error)),
    100
  );

  // Update UI
  ui.useVideo.disabled = true;
  ui.logSdp.disabled = true;
  ui.forceSendonly.disabled = true;
  ui.start.disabled = true;
  {
    ui.disableAudio.disabled = false;
    ui.replaceAudio.disabled = false;
    ui.removeAudio.disabled = false;
  }
  if (useVideo) {
    ui.disableVideo.disabled = false;
    ui.replaceVideo.disabled = false;
    ui.removeVideo.disabled = false;
  }
}

async function startWebRTC() {
  const addCandidate = (pc, c) => c && pc.addIceCandidate(c).catch(log);
  pcLocal.onicecandidate = (iceEvent) =>
    addCandidate(pcRemote, iceEvent.candidate);
  pcRemote.onicecandidate = (iceEvent) =>
    addCandidate(pcLocal, iceEvent.candidate);

  pcLocal.onnegotiationneeded = async (_event) => {
    const options = {};
    if (ui.forceSendonly.checked) {
      options.offerToReceiveAudio = false;
      options.offerToReceiveVideo = false;
    }

    try {
      log("[onnegotiationneeded] pcLocal.createOffer()");
      const sdpOffer = await pcLocal.createOffer(options);
      if (ui.logSdp.checked) {
        // prettier-ignore
        console.log(`[onnegotiationneeded] pcLocal SDP Offer:\n${sdpOffer.sdp}`);
      }

      log("[onnegotiationneeded] pcLocal.setLocalDescription()");
      await pcLocal.setLocalDescription(sdpOffer);

      log("[onnegotiationneeded] pcRemote.setRemoteDescription()");
      await pcRemote.setRemoteDescription(pcLocal.localDescription);

      log("[onnegotiationneeded] pcRemote.createAnswer()");
      const sdpAnswer = await pcRemote.createAnswer();
      if (ui.logSdp.checked) {
        // prettier-ignore
        console.log(`[onnegotiationneeded] pcRemote SDP Answer:\n${sdpAnswer.sdp}`);
      }

      log("[onnegotiationneeded] pcRemote.setLocalDescription()");
      await pcRemote.setLocalDescription(sdpAnswer);

      log("[onnegotiationneeded] pcLocal.setRemoteDescription()");
      await pcLocal.setRemoteDescription(pcRemote.localDescription);
    } catch (error) {
      log("[onnegotiationneeded] Error: " + error);
    }
  };

  pcRemote.oniceconnectionstatechange = () => {
    update(ui.state, pcRemote.iceConnectionState);
  };

  pcRemote.ontrack = (trackEvent) => {
    ui.remoteVideo.srcObject = trackEvent.streams[0];
  };
}

/*
 * https://www.w3.org/TR/mediacapture-streams/#dom-mediastreamtrack-enabled
 */
function disableTrack(isActive, isAudio) {
  const vars = isAudio ? audioVars : videoVars;

  // prettier-ignore
  log(`[disableTrack] Set ${isAudio ? "AUDIO" : "VIDEO"} DISABLE ${isActive ? "ON" : "OFF"}`);

  vars.track.enabled = !isActive;

  // prettier-ignore
  log(`[disableTrack] ${isAudio ? "AUDIO" : "VIDEO"} DISABLE is ${isActive ? "ON" : "OFF"}`);

  // Update UI
  vars.uiReplace.disabled = isActive;
  vars.uiRemove.disabled = isActive;
}

/*
 * https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack
 */
async function replaceTrack(isActive, isAudio) {
  const vars = isAudio ? audioVars : videoVars;

  let newTrack;
  if (isActive) {
    newTrack = null;
  } else {
    newTrack = vars.track;
  }

  // prettier-ignore
  log(`[replaceTrack] Set ${isAudio ? "AUDIO" : "VIDEO"} REPLACE ${isActive ? "ON" : "OFF"}`);

  try {
    await vars.sender.replaceTrack(newTrack);
  } catch (error) {
    if (error.name === "InvalidModificationError") {
      // prettier-ignore
      log("[replaceTrack] Error in sender.replaceTrack(): Renegotiation needed, error: " + error);
    } else {
      log("[replaceTrack] Error in sender.replaceTrack(): " + error);
    }

    // Update UI (rollback)
    vars.uiReplace.checked = !isActive;

    return;
  }

  // prettier-ignore
  log(`[replaceTrack] ${isAudio ? "AUDIO" : "VIDEO"} REPLACE is ${isActive ? "ON" : "OFF"}`);

  // Update UI
  vars.uiDisable.disabled = isActive;
  vars.uiRemove.disabled = isActive;
}

/*
 * https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-addtrack
 * https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-removetrack
 */
function removeTrack(isActive, isAudio) {
  const vars = isAudio ? audioVars : videoVars;

  // prettier-ignore
  log(`[removeTrack] Set ${isAudio ? "AUDIO" : "VIDEO"} REMOVE ${isActive ? "ON" : "OFF"}`);

  if (isActive) {
    try {
      pcLocal.removeTrack(vars.sender);
      // pc.removeTrack() triggers "negotiationneeded"
      // The local media section in SDP will have an incompatible direction,
      // forcing the remote side to answer with `a=inactive`.
    } catch (error) {
      log("[removeTrack] Error in pcLocal.removeTrack(): " + error);

      // Update UI (rollback)
      vars.uiRemove.checked = !isActive;

      return;
    }
  } else {
    try {
      vars.sender = pcLocal.addTrack(vars.track, stream);
      // pc.addTrack() triggers "negotiationneeded"
    } catch (error) {
      log("[removeTrack] Error in pcLocal.addTrack(): " + error);

      // Update UI (rollback)
      vars.uiRemove.checked = !isActive;

      return;
    }
  }

  // prettier-ignore
  log(`[removeTrack] ${isAudio ? "AUDIO" : "VIDEO"} REMOVE is ${isActive ? "ON" : "OFF"}`);

  // Update UI
  vars.uiDisable.disabled = isActive;
  vars.uiReplace.disabled = isActive;
}

function dumpStats(s) {
  // prettier-ignore
  let d = `Timestamp: ${new Date(s.timestamp).toTimeString()} Type: ${s.type}<br>`;
  d += `Media Type: ${s.mediaType}<br>`;
  if (s.ssrc !== undefined) d += `SSRC: ${s.ssrc} `;
  if (s.packetsReceived !== undefined) {
    d += `Recvd: ${s.packetsReceived} packets`;
    if (s.bytesReceived !== undefined) {
      d += ` (${(s.bytesReceived / 1024000).toFixed(2)} MB)`;
    }
    if (s.packetsLost !== undefined) d += ` Lost: ${s.packetsLost}`;
  } else if (s.packetsSent !== undefined) {
    d += `Sent: ${s.packetsSent} packets`;
    if (s.bytesSent !== undefined)
      d += ` (${(s.bytesSent / 1024000).toFixed(2)} MB)`;
  } else {
    d += "<br><br>";
  }
  d += "<br>";
  if (s.bitrateMean !== undefined) {
    d += ` Avg. bitrate: ${(s.bitrateMean / 1000000).toFixed(2)} Mbps`;
    if (s.bitrateStdDev !== undefined) {
      d += ` (${(s.bitrateStdDev / 1000000).toFixed(2)} StdDev)`;
    }
    if (s.discardedPackets !== undefined) {
      d += ` Discarded packts: ${s.discardedPackets}`;
    }
  }
  d += "<br>";
  if (s.framerateMean !== undefined) {
    d += ` Avg. framerate: ${s.framerateMean.toFixed(2)} fps`;
    if (s.framerateStdDev !== undefined) {
      d += ` (${s.framerateStdDev.toFixed(2)} StdDev)`;
    }
  }
  if (s.droppedFrames !== undefined) d += ` Dropped frames: ${s.droppedFrames}`;
  if (s.jitter !== undefined) d += ` Jitter: ${s.jitter}`;
  return d;
}

function log(msg) {
  ui.log.innerHTML = ui.log.innerHTML + msg + "<br>";
  console.log(msg);
}

function update(div, msg) {
  div.innerHTML = msg;
}
