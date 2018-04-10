var pc1 = new RTCPeerConnection();
var pc2 = new RTCPeerConnection();

var addCandidate = (pc, can) => can && pc.addIceCandidate(can).catch(log);
pc1.onicecandidate = (ev) => addCandidate(pc2, ev.candidate);
pc2.onicecandidate = (ev) => addCandidate(pc1, ev.candidate);

var isNegotiating = false; // Workaround for Chrome: skip nested negotiations
pc1.onnegotiationneeded = (ev) => {
  if (isNegotiating) {
    log("PC1: onnegotiationneeded (Chrome bug - SKIP)");
    return;
  }
  log("PC1: onnegotiationneeded");
  isNegotiating = true;
  pc1.createOffer()
    .then((offer) => pc1.setLocalDescription(offer))
    .then(() => {
      if (printSdpChk.checked) {
        console.log("PC1: NEW OFFER: " + pc1.localDescription.sdp);
      }
      return pc2.setRemoteDescription(pc1.localDescription);
    })
    .then(() => pc2.createAnswer())
    .then((answer) => pc2.setLocalDescription(answer))
    .then(() => pc1.setRemoteDescription(pc2.localDescription))
    .catch((err) => log(err));
}

pc1.onsignalingstatechange = (ev) => { // Workaround for Chrome: skip nested negotiations
  isNegotiating = (pc1.signalingState != 'stable');
}

pc2.oniceconnectionstatechange = () => update(statediv, pc2.iceConnectionState);

//- Firefox (native) / Chrome (adapter.js polyfill)
pc2.ontrack = (ev) => v2.srcObject = ev.streams[0];
//----
//- Firefox (native) / Chrome (native) / (DEPRECATED)
// pc2.onaddstream = (ev) => v2.srcObject = ev.stream;

var avStream;
var aSender, aTrack;
var vSender, vTrack;

function disableTrack(isActive, isAudio)
{
  (isAudio ? aTrack : vTrack).enabled = !isActive;

  // Update UI
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
  (isAudio ? aRemoveChk : vRemoveChk).disabled = isActive;
  log((isAudio ? "AUDIO" : "VIDEO") + " "
      + (isActive ? "DISABLE (ON)" : "DISABLE (OFF)"));
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
      log((isAudio ? "AUDIO" : "VIDEO")
          + (isActive ? " REPLACE (ON)" : " REPLACE (OFF)"));
    })
    .catch((err) => {
      // Update UI (rollback)
      (isAudio ? aReplaceChk : vReplaceChk).checked = !isActive;
      log("REPLACE TRACK FAILED: " + err);
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
      // removeTrack() triggers onnegotiationneeded
      pc1.removeTrack(sender);
    }
    catch (err) {
      // Update UI (rollback)
      (isAudio ? aRemoveChk : vRemoveChk).checked = !isActive;
      log("REMOVE TRACK FAILED: " + err);
      return;
    }
  }
  else {
    try {
      // addTrack() triggers onnegotiationneeded
      sender = pc1.addTrack(track, avStream);
    }
    catch (err) {
      // Update UI (rollback)
      (isAudio ? aRemoveChk : vRemoveChk).checked = !isActive;
      log("ADD TRACK FAILED: " + err);
      return;
    }
    if (isAudio) { aSender = sender; }
    else { vSender = sender; }
  }

  // Update UI
  (isAudio ? aDisableChk : vDisableChk).disabled = isActive;
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
  log((isAudio ? "AUDIO" : "VIDEO")
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

      // Get audio track
      aTrack = avStream.getAudioTracks()[0];

      //- Firefox (native) / Chrome (adapter.js polyfill)
      log("[getUserMedia] New track: " + aTrack.kind);
      aSender = pc1.addTrack(aTrack, avStream);
      //----
      //- Firefox (native) / Chrome (native) / (DEPRECATED)
      // log("Add stream: audio + video");
      // pc1.addStream(avStream);
      // aSender = pc1.getSenders().find((sender) => sender.track == aTrack);

      if (useVideo) {
        // Get video track
        vTrack = avStream.getVideoTracks()[0];
        log("[getUserMedia] New track: " + vTrack.kind);
        vSender = pc1.addTrack(vTrack, avStream);
      }
    })
    .catch((err) => log(err));

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
