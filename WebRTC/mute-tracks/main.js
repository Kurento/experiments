"use strict";

// ----------------------------------------------------------------------------

// HTML UI elements
// ================

const ui = {
  // Video
  videoSend: document.getElementById("videoSend"),
  videoRecv: document.getElementById("videoRecv"),

  // Settings
  useVideo: document.getElementById("useVideo"),
  logSdp: document.getElementById("logSdp"),

  // Controls
  start: document.getElementById("start"),
  disableAudio: document.getElementById("disableAudio"),
  disableVideo: document.getElementById("disableVideo"),
  replaceAudio: document.getElementById("replaceAudio"),
  replaceAudioInput: document.getElementById("replaceAudioInput"),
  replaceVideo: document.getElementById("replaceVideo"),
  replaceVideoInput: document.getElementById("replaceVideoInput"),
  removeAudio: document.getElementById("removeAudio"),
  removeVideo: document.getElementById("removeVideo"),

  // Output
  state: document.getElementById("state"),
  log: document.getElementById("log"),
  stats: document.getElementById("stats"),
};

ui.useVideo.checked = true;

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
  constructor(uiDisable, uiReplace, uiReplaceInput, uiRemove, track, sender) {
    this.uiDisable = uiDisable || null; // <input type="checkbox">
    this.uiReplace = uiReplace || null; // <input type="checkbox">
    this.uiReplaceInput = uiReplaceInput || null; // <select>
    this.uiRemove = uiRemove || null; // <input type="checkbox">
    this.track = track || null; // MediaStreamTrack
    this.sender = sender || null; // RTCRtpSender
  }
}

let stream = null;
const pcSend = new RTCPeerConnection();
const pcRecv = new RTCPeerConnection();
const audioVars = new MediaVars(
  ui.disableAudio,
  ui.replaceAudio,
  ui.replaceAudioInput,
  ui.removeAudio
);
const videoVars = new MediaVars(
  ui.disableVideo,
  ui.replaceVideo,
  ui.replaceVideoInput,
  ui.removeVideo
);

// ----------------------------------------------------------------------------

async function start() {
  await startWebRTC();
  await startMedia();
  await queryReplaceDevices(); // Requires a Secure Context, i.e. an HTTPS server.
}

/*
 * Initialize WebRTC PeerConnection event handlers.
 */
async function startWebRTC() {
  const addCandidate = (pc, c) => c && pc.addIceCandidate(c).catch(log);
  pcSend.onicecandidate = (iceEvent) =>
    addCandidate(pcRecv, iceEvent.candidate);
  pcRecv.onicecandidate = (iceEvent) =>
    addCandidate(pcSend, iceEvent.candidate);

  pcSend.onnegotiationneeded = async (_event) => {
    try {
      log("[pcSend.onnegotiationneeded] New SDP Offer/Answer negotiation");

      const sdpOffer = await pcSend.createOffer();
      await pcSend.setLocalDescription(sdpOffer);
      await pcRecv.setRemoteDescription(pcSend.localDescription);
      const sdpAnswer = await pcRecv.createAnswer();
      await pcRecv.setLocalDescription(sdpAnswer);
      await pcSend.setRemoteDescription(pcRecv.localDescription);

      if (ui.logSdp.checked) {
        // prettier-ignore
        console.log(`[pcSend.onnegotiationneeded] SDP Offer:\n${sdpOffer.sdp}`);
        // prettier-ignore
        console.log(`[pcSend.onnegotiationneeded] SDP Answer:\n${sdpAnswer.sdp}`);
      }
    } catch (error) {
      log(`ERROR [pcSend.onnegotiationneeded] ${error}`);
    }
  };

  pcRecv.oniceconnectionstatechange = () => {
    update(ui.state, pcRecv.iceConnectionState);
  };

  pcRecv.ontrack = (trackEvent) => {
    ui.videoRecv.srcObject = trackEvent.streams[0];
  };
}

/*
 * Request user media and add it to WebRTC PeerConnection.
 */
async function startMedia() {
  const useVideo = ui.useVideo.checked;

  // Get default stream tracks
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: useVideo,
      audio: true,
    });
    ui.videoSend.srcObject = stream;

    // Save the audio track
    {
      // Triggers "negotiationneeded"
      const tc = pcSend.addTransceiver(stream.getAudioTracks()[0], {
        direction: "sendonly",
        streams: [stream],
      });

      audioVars.track = tc.sender.track;
      audioVars.sender = tc.sender;
    }

    // Save the video track
    if (useVideo) {
      // Triggers "negotiationneeded"
      const tc = pcSend.addTransceiver(stream.getVideoTracks()[0], {
        direction: "sendonly",
        streams: [stream],
      });

      videoVars.track = tc.sender.track;
      videoVars.sender = tc.sender;
    }
  } catch (error) {
    log(`ERROR [getUserMedia] ${error}`);
  }

  // Program regular updating of stats
  setInterval(
    () =>
      Promise.all([pcSend.getStats(), pcRecv.getStats()])
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
        .catch((error) => log(`ERROR ${error}`)),
    100
  );

  // Update UI
  ui.useVideo.disabled = true;
  ui.logSdp.disabled = true;
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

/*
 * Request IDs for all media devices.
 * Requires a Secure Context:
 * - Page must be served through HTTPS.
 * - User must have granted consent from a call to `getUserMedia()`.
 */
async function queryReplaceDevices() {
  for (const select of [ui.replaceAudioInput, ui.replaceVideoInput]) {
    const option = document.createElement("option");
    option.value = "null";
    option.text = "null (mute track)";
    select.appendChild(option);
  }

  let devices = [];
  try {
    // getUserMedia() must have been run at least once BEFORE enumerateDevices()
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    log(`ERROR [enumerateDevices] ${error}`);
  }
  for (const device of devices) {
    console.log(device);

    const option = document.createElement("option");
    option.value = device.deviceId;
    if (device.kind === "audioinput") {
      // prettier-ignore
      option.text = `${device.label || "Unknown Microphone " + (ui.replaceAudioInput.length)}`;
      ui.replaceAudioInput.appendChild(option);
    } else if (device.kind === "videoinput") {
      // prettier-ignore
      option.text = `${device.label || "Unknown Camera " + (ui.replaceVideoInput.length)}`;
      ui.replaceVideoInput.appendChild(option);
    }
  }
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

  // prettier-ignore
  log(`[replaceTrack] Set ${isAudio ? "AUDIO" : "VIDEO"} REPLACE ${isActive ? "ON" : "OFF"}`);

  let newTrack;
  if (isActive) {
    const deviceId = vars.uiReplaceInput.value;
    if (deviceId === "null") {
      newTrack = null;
    } else {
      // MediaStreamConstraints
      const constraints = {
        audio: isAudio ? { deviceId: { exact: deviceId } } : false,
        video: !isAudio ? { deviceId: { exact: deviceId } } : false,
      };

      let newStream;
      let retry = true;
      while (true) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
          if (error.name === "NotReadableError" && retry) {
            // Workaround for Firefox bug #1238038
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1238038
            log(
              "[replaceTrack] Workaround for Firefox bug #1238038 -- WARNING: the track replacement cannot be undone"
            );

            // Firefox can only use 1 hardware device at the same time.
            // Because in this demo there is only 1 MediaStreamTrack making use
            // of any given source, stopping it will actually release the hardware.
            // WARNING: This is final. The original track is ended (`track.readyState === "ended"`),
            // so with this workaround, the track replacement cannot be undone.
            // Potential fix: A new `getUserMedia` call would be needed to undo this replacement.
            // Better fix: Wait until Firefox fixes its bug.
            vars.track.stop();

            // Try again, only once
            retry = false;
            continue;
          } else {
            log(`ERROR [getUserMedia] ${error}`);

            // Update UI (rollback)
            vars.uiReplace.checked = !isActive;

            return;
          }
        }
        break;
      }

      if (isAudio) {
        newTrack = newStream.getAudioTracks()[0];
      } else {
        newTrack = newStream.getVideoTracks()[0];
      }
    }
  } else {
    newTrack = vars.track;
  }

  try {
    await vars.sender.replaceTrack(newTrack);
  } catch (error) {
    if (error.name === "InvalidModificationError") {
      // prettier-ignore
      log(`ERROR [replaceTrack] Renegotiation needed; ${error}`);
    } else {
      log(`ERROR [replaceTrack] ${error}`);
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
      // Triggers "negotiationneeded"
      pcSend.removeTrack(vars.sender);

      // The local media section in SDP will have an incompatible direction,
      // forcing the remote side to answer with `a=inactive`.
    } catch (error) {
      log(`ERROR [removeTrack] ${error}`);

      // Update UI (rollback)
      vars.uiRemove.checked = !isActive;

      return;
    }
  } else {
    try {
      // Triggers "negotiationneeded"
      vars.sender = pcSend.addTrack(vars.track, stream);
    } catch (error) {
      log(`ERROR [addTrack] ${error}`);

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
