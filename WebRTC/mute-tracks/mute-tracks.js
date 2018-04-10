var pc1 = new RTCPeerConnection();
var pc2 = new RTCPeerConnection();

var addCandidate = (pc, can) => can && pc.addIceCandidate(can).catch(log);
pc1.onicecandidate = (ev) => addCandidate(pc2, ev.candidate);
pc2.onicecandidate = (ev) => addCandidate(pc1, ev.candidate);

var isNegotiating = false; // Workaround for Chrome: skip nested negotiations
pc1.onnegotiationneeded = (ev) => {
  if (isNegotiating) {
    log("[onnegotiationneeded] pc1 (Chrome bug - SKIP)");
    return;
  }
  log("[onnegotiationneeded] pc1");
  isNegotiating = true;
  pc1.createOffer()
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

var avStream;
var aSender, aTrack;
var vSender, vTrack;

function disableTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/mediacapture-streams/#dom-mediastreamtrack-enabled

  (isAudio ? aTrack : vTrack).enabled = !isActive;

  // Update UI
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
  (isAudio ? aRemoveChk : vRemoveChk).disabled = isActive;
  log("[disableTrack]" + (isAudio ? " AUDIO" : " VIDEO")
      + (isActive ? " DISABLE (ON)" : " DISABLE (OFF)"));
}

function replaceTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack

  let track;
  if (isActive) { track = null; }
  else { track = (isAudio ? aTrack : vTrack); }

  (isAudio ? aSender : vSender).replaceTrack(track)
    .then(() => {
      // Update UI
      (isAudio ? aDisableChk : vDisableChk).disabled = isActive;
      (isAudio ? aRemoveChk : vRemoveChk).disabled = isActive;
      log("[replaceTrack]" + (isAudio ? " AUDIO" : " VIDEO")
          + (isActive ? " REPLACE (ON)" : " REPLACE (OFF)"));
    })
    .catch((err) => {
      // Update UI (rollback)
      (isAudio ? aReplaceChk : vReplaceChk).checked = !isActive;
      log("[replaceTrack] Error in sender.replaceTrack(): " + err);
    });
}

function removeTrack(isActive, isAudio)
{
  // https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-addtrack
  // https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-replacetrack

  let sender = (isAudio ? aSender : vSender);
  let track = (isAudio ? aTrack : vTrack);

  if (isActive) {
    try {
      pc1.removeTrack(sender); // removeTrack() triggers onnegotiationneeded
    }
    catch (err) {
      // Update UI (rollback)
      (isAudio ? aRemoveChk : vRemoveChk).checked = !isActive;
      log("[removeTrack] Error in pc1.removeTrack(): " + err);
      return;
    }
  }
  else {
    try {
      sender = pc1.addTrack(track, avStream); // addTrack() triggers onnegotiationneeded
    }
    catch (err) {
      // Update UI (rollback)
      (isAudio ? aRemoveChk : vRemoveChk).checked = !isActive;
      log("[removeTrack] Error in pc1.addTrack(): " + err);
      return;
    }
    if (isAudio) { aSender = sender; }
    else { vSender = sender; }
  }

  // Update UI
  (isAudio ? aDisableChk : vDisableChk).disabled = isActive;
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
  log("[removeTrack]" + (isAudio ? " AUDIO" : " VIDEO")
      + (isActive ? " REMOVE (ON)" : " REMOVE (OFF)"));
}

aDisableChk.onclick = () => disableTrack(aDisableChk.checked, true);
vDisableChk.onclick = () => disableTrack(vDisableChk.checked, false);
aReplaceChk.onclick = () => replaceTrack(aReplaceChk.checked, true);
vReplaceChk.onclick = () => replaceTrack(vReplaceChk.checked, false);
aRemoveChk.onclick = () => removeTrack(aRemoveChk.checked, true);
vRemoveChk.onclick = () => removeTrack(vRemoveChk.checked, false);

startBtn.onclick = () => {
  let useVideo = vStartChk.checked;

  navigator.mediaDevices.getUserMedia({ video: useVideo, audio: true })
    .then((stream) => {
      avStream = stream;
      v1.srcObject = avStream;

      // Choose one: addTrack / addStream
      // ----
      // Option 1: addTrack() (preferred)
      aTrack = avStream.getAudioTracks()[0];
      log("[getUserMedia] New track: " + aTrack.kind);
      aSender = pc1.addTrack(aTrack, avStream); // addTrack() triggers onnegotiationneeded
      if (useVideo) {
        vTrack = avStream.getVideoTracks()[0];
        log("[getUserMedia] New track: " + vTrack.kind);
        vSender = pc1.addTrack(vTrack, avStream); // addTrack() triggers onnegotiationneeded
      }
      // ----
      // Option 2: addStream() (DEPRECATED)
      // log("[getUserMedia] New stream (audio + video)");
      // pc1.addStream(avStream); // addStream() triggers onnegotiationneeded
      // aTrack = avStream.getAudioTracks()[0];
      // aSender = pc1.getSenders().find((sender) => sender.track == aTrack);
      // ----
    })
    .catch((err) => log("[getUserMedia] Error: " + err));

  // Program regular updating of stats
  repeat(100, () => Promise.all([pc1.getStats(), pc2.getStats()])
    .then(([s1, s2]) => {
      var s = "";
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
