const pc1 = new RTCPeerConnection();
const pc2 = new RTCPeerConnection();

const addCandidate = (pc, can) => can && pc.addIceCandidate(can).catch(log);
pc1.onicecandidate = (ev) => addCandidate(pc2, ev.candidate);
pc2.onicecandidate = (ev) => addCandidate(pc1, ev.candidate);

let isNegotiating = false; // Workaround for Chrome bug #740501: skip nested negotiations
pc1.onnegotiationneeded = (ev) => {
  if (isNegotiating) {
    log("[onnegotiationneeded] pc1 (Chrome bug #740501 - SKIP)");
    return;
  }
  log("[onnegotiationneeded] pc1");
  isNegotiating = true;
  const options = {};
  if (strictDirChk.checked) {
    options.offerToReceiveAudio = false;
    options.offerToReceiveVideo = false;
  }
  console.log("[onnegotiationneeded] pc1.createOffer()");
  pc1.createOffer(options)
    .then((offer) => {
      if (printSdpChk.checked) {
        console.log("[onnegotiationneeded] pc1 SDP Offer: " + offer.sdp);
      }
      console.log("[onnegotiationneeded] pc1.setLocalDescription()");
      return pc1.setLocalDescription(offer);
    })
    .then(() => {
      console.log("[onnegotiationneeded] pc2.setRemoteDescription()");
      return pc2.setRemoteDescription(pc1.localDescription);
    })
    .then(() => {
      console.log("[onnegotiationneeded] pc2.createAnswer()");
      return pc2.createAnswer();
    })
    .then((answer) => {
      if (printSdpChk.checked) {
        console.log("[onnegotiationneeded] pc2 SDP Answer: " + answer.sdp);
      }
      console.log("[onnegotiationneeded] pc2.setLocalDescription()");
      return pc2.setLocalDescription(answer);
    })
    .then(() => {
      console.log("[onnegotiationneeded] pc1.setRemoteDescription()");
      return pc1.setRemoteDescription(pc2.localDescription);
    })
    .catch((err) => log("[onnegotiationneeded] Error: " + err));
}

pc1.onsignalingstatechange = (ev) => { // Workaround for Chrome: skip nested negotiations
  isNegotiating = (pc1.signalingState != 'stable');
}

pc2.oniceconnectionstatechange = () => update(statediv, pc2.iceConnectionState);

// Choose one: ontrack / onaddstream
// ----
// Option 1: ontrack (preferred)
pc2.ontrack = (trackEvent) => v2.srcObject = trackEvent.streams[0];
// ----
// Option 2: onaddstream (DEPRECATED)
// pc2.onaddstream = (streamEvent) => v2.srcObject = streamEvent.stream;
// ----

// ------------ Mute logic ------------

function StateVars(disableChk, replaceChk, removeChk, track, sender) {
  this.disableChk = disableChk || null;  // <input type="checkbox">
  this.replaceChk = replaceChk || null;  // <input type="checkbox">
  this.removeChk = removeChk || null;    // <input type="checkbox">
  this.track = track || null;            // MediaStreamTrack
  this.sender = sender || null;          // RTCRtpSender
}

const audioVars = new StateVars(aDisableChk, aReplaceChk, aRemoveChk);
const videoVars = new StateVars(vDisableChk, vReplaceChk, vRemoveChk);
let avStream;

function disableTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/mediacapture-streams/#dom-mediastreamtrack-enabled

  const vars = (isAudio ? audioVars : videoVars);

  log("[disableTrack] Set " + (isAudio ? "AUDIO" : "VIDEO") + " DISABLE "
      + (isActive ? "ON" : "OFF"));

  vars.track.enabled = !isActive;

  log("[disableTrack] " + (isAudio ? "AUDIO" : "VIDEO") + " DISABLE is "
      + (isActive ? "ON" : "OFF"));

  // Update UI
  vars.replaceChk.disabled = isActive;
  vars.removeChk.disabled = isActive;
}

function replaceTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack

  const vars = (isAudio ? audioVars : videoVars);

  let track;
  if (isActive) { track = null; }
  else { track = vars.track; }

  log("[replaceTrack] Set " + (isAudio ? "AUDIO" : "VIDEO") + " REPLACE "
      + (isActive ? "ON" : "OFF"));

  vars.sender.replaceTrack(track)
    .then(() => {
      log("[replaceTrack] " + (isAudio ? "AUDIO" : "VIDEO") + " REPLACE is "
          + (isActive ? "ON" : "OFF"));

      // Update UI
      vars.disableChk.disabled = isActive;
      vars.removeChk.disabled = isActive;
    })
    .catch((err) => {
      if (err.name === 'InvalidModificationError') {
        log("[replaceTrack] Error in sender.replaceTrack(): Renegotiation needed, error: "
            + err);
      }
      else {
        log("[replaceTrack] Error in sender.replaceTrack(): " + err);
      }

      // Update UI (rollback)
      vars.replaceChk.checked = !isActive;
    });
}

function removeTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-addtrack
  // https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-removetrack

  const vars = (isAudio ? audioVars : videoVars);

  log("[removeTrack] Set " + (isAudio ? "AUDIO" : "VIDEO") + " REMOVE "
      + (isActive ? "ON" : "OFF"));

  if (isActive) {
    try {
      pc1.removeTrack(vars.sender);
      // removeTrack() triggers onnegotiationneeded
    }
    catch (err) {
      log("[removeTrack] Error in pc1.removeTrack(): " + err);

      // Update UI (rollback)
      vars.removeChk.checked = !isActive;

      return;
    }
  }
  else {
    try {
      vars.sender = pc1.addTrack(vars.track, avStream);
      // addTrack() triggers onnegotiationneeded
    }
    catch (err) {
      log("[removeTrack] Error in pc1.addTrack(): " + err);

      // Update UI (rollback)
      vars.removeChk.checked = !isActive;

      return;
    }
  }

  log("[removeTrack] " + (isAudio ? "AUDIO" : "VIDEO") + " REMOVE is "
      + (isActive ? "ON" : "OFF"));

  // Update UI
  vars.disableChk.disabled = isActive;
  vars.replaceChk.disabled = isActive;
}

aDisableChk.onclick = () => disableTrack(aDisableChk.checked, true);
vDisableChk.onclick = () => disableTrack(vDisableChk.checked, false);
aReplaceChk.onclick = () => replaceTrack(aReplaceChk.checked, true);
vReplaceChk.onclick = () => replaceTrack(vReplaceChk.checked, false);
aRemoveChk.onclick = () => removeTrack(aRemoveChk.checked, true);
vRemoveChk.onclick = () => removeTrack(vRemoveChk.checked, false);

startBtn.onclick = () => {
  const useVideo = vStartChk.checked;

  navigator.mediaDevices.getUserMedia({ video: useVideo, audio: true })
    .then((stream) => {
      avStream = stream;
      v1.srcObject = avStream;

      // Choose one: addTrack / addStream
      // ----
      // Option 1: addTrack() (preferred)
      audioVars.track = avStream.getAudioTracks()[0];
      log("[getUserMedia] New track: " + audioVars.track.kind);
      audioVars.sender = pc1.addTrack(audioVars.track, avStream);
      // addTrack() triggers onnegotiationneeded
      if (useVideo) {
        videoVars.track = avStream.getVideoTracks()[0];
        log("[getUserMedia] New track: " + videoVars.track.kind);
        videoVars.sender = pc1.addTrack(videoVars.track, avStream);
        // addTrack() triggers onnegotiationneeded
      }
      // ----
      // Option 2: addStream() (DEPRECATED)
      // log("[getUserMedia] New stream (audio + video)");
      // pc1.addStream(avStream); // addStream() triggers onnegotiationneeded
      // audioVars.track = avStream.getAudioTracks()[0];
      // audioVars.sender = pc1.getSenders().find(
      //     (s) => s.track == audioVars.track);
      // ----
    })
    .catch((err) => log("[getUserMedia] Error: " + err));

  // Program regular updating of stats
  repeat(100, () => Promise.all([pc1.getStats(), pc2.getStats()])
    .then(([s1, s2]) => {
      let s = "";
      s1.forEach(stat => {
        if (stat.type == "outbound-rtp" && !stat.isRemote) {
          s += "<h4>Sender side</h4>" + dumpStats(stat);
        }
      });
      s2.forEach(stat => {
        if (stat.type == "inbound-rtp" && !stat.isRemote) {
          s += "<h4>Receiver side</h4>" + dumpStats(stat);
        }
      });
      update(statsdiv, "<small>"+ s +"</small>");
  }))
  .catch(err => log(err));

  // Update UI
  vStartChk.disabled = true;
  printSdpChk.disabled = true;
  strictDirChk.disabled = true;
  startBtn.disabled = true;
  aDisableChk.disabled = false;
  aReplaceChk.disabled = false;
  aRemoveChk.disabled = false;
  if (useVideo) {
    vDisableChk.disabled = false;
    vReplaceChk.disabled = false;
    vRemoveChk.disabled = false;
  }
}

function dumpStats(o) {
  var s = "Timestamp: "+ new Date(o.timestamp).toTimeString() +" Type: "+ o.type +"<br>";
  s += "Media Type: " + o.mediaType + "<br>";
  if (o.ssrc !== undefined) s += "SSRC: " + o.ssrc + " ";
  if (o.packetsReceived !== undefined) {
    s += "Recvd: " + o.packetsReceived + " packets";
    if (o.bytesReceived !== undefined) {
      s += " ("+ (o.bytesReceived/1024000).toFixed(2) +" MB)";
    }
    if (o.packetsLost !== undefined) s += " Lost: "+ o.packetsLost;
  } else if (o.packetsSent !== undefined) {
    s += "Sent: " + o.packetsSent + " packets";
    if (o.bytesSent !== undefined) s += " ("+ (o.bytesSent/1024000).toFixed(2) +" MB)";
  } else {
    s += "<br><br>";
  }
  s += "<br>";
  if (o.bitrateMean !== undefined) {
    s += " Avg. bitrate: "+ (o.bitrateMean/1000000).toFixed(2) +" Mbps";
    if (o.bitrateStdDev !== undefined) {
      s += " ("+ (o.bitrateStdDev/1000000).toFixed(2) +" StdDev)";
    }
    if (o.discardedPackets !== undefined) {
      s += " Discarded packts: "+ o.discardedPackets;
    }
  }
  s += "<br>";
  if (o.framerateMean !== undefined) {
    s += " Avg. framerate: "+ (o.framerateMean).toFixed(2) +" fps";
    if (o.framerateStdDev !== undefined) {
      s += " ("+ o.framerateStdDev.toFixed(2) +" StdDev)";
    }
  }
  if (o.droppedFrames !== undefined) s += " Dropped frames: "+ o.droppedFrames;
  if (o.jitter !== undefined) s += " Jitter: "+ o.jitter;
  return s;
}

var log = (msg) => {
  div.innerHTML = div.innerHTML + msg + "<br>";
  console.log(msg);
}
var update = (div, msg) => div.innerHTML = msg;
var wait = (ms) => new Promise((r) => setTimeout(r, ms));
var repeat = (ms, func) => new Promise((r) => (setInterval(func, ms), wait(ms).then(r)));
