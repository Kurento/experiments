var pc1 = new RTCPeerConnection();
var pc2 = new RTCPeerConnection();

var addCandidate = (pc, can) => can && pc.addIceCandidate(can).catch(log);
pc1.onicecandidate = (e) => addCandidate(pc2, e.candidate);
pc2.onicecandidate = (e) => addCandidate(pc1, e.candidate);

var isNegotiating = false;  // Workaround for Chrome: skip nested negotiations
pc1.onnegotiationneeded = (e) => {
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

pc1.onsignalingstatechange = (e) => {  // Workaround for Chrome: skip nested negotiations
  isNegotiating = (pc1.signalingState != "stable");
}

pc2.oniceconnectionstatechange = () => update(statediv, pc2.iceConnectionState);

//- Firefox (native) / Chrome (adapter.js polyfill)
pc2.ontrack = (e) => v2.srcObject = e.streams[0];
//----
//- Firefox (native) / Chrome (native) / (DEPRECATED)
// pc2.onaddstream = (e) => v2.srcObject = e.stream;

var avStream;
var aSender, aTrack;
var vSender, vTrack;

function disableTrack(isActive, isAudio) {
  log((isAudio ? "AUDIO" : "VIDEO") + " "
    + (isActive ? "DISABLE (ON)" : "DISABLE (OFF)"));

  (isAudio ? aTrack : vTrack).enabled = !isActive;

  // Update UI
  (isAudio ? aRemoveChk : vRemoveChk).disabled = isActive;
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
}

function removeTrack(isActive, isAudio) {
  log((isAudio ? "AUDIO" : "VIDEO") + " "
    + (isActive ? "REMOVE (ON)" : "REMOVE (OFF)"));

  let sender = (isAudio ? aSender : vSender);
  let track = (isAudio ? aTrack : vTrack);
  if (isActive) { pc1.removeTrack(sender); }
  else { sender = pc1.addTrack(track, avStream); }

  // Update UI
  (isAudio ? aDisableChk : vDisableChk).disabled = isActive;
  (isAudio ? aReplaceChk : vReplaceChk).disabled = isActive;
}

function replaceTrack(isActive, isAudio) {
  log((isAudio ? "AUDIO" : "VIDEO") + " "
    + (isActive ? "REPLACE (ON)" : "REPLACE (OFF)"));

  let track;
  if (isActive) { track = null; }
  else { track = (isAudio ? aTrack : vTrack); }

  try {
    (isAudio ? aSender : vSender).replaceTrack(track);
  } catch (err) {
    log("REPLACE NOT SUPPORTED");
  }

  // Update UI
  (isAudio ? aDisableChk : vDisableChk).disabled = isActive;
  (isAudio ? aRemoveChk : vRemoveChk).disabled = isActive;
}

aDisableChk.onclick = () => disableTrack(aDisableChk.checked, true);
vDisableChk.onclick = () => disableTrack(vDisableChk.checked, false);
aRemoveChk.onclick = () => removeTrack(aRemoveChk.checked, true);
vRemoveChk.onclick = () => removeTrack(vRemoveChk.checked, false);
aReplaceChk.onclick = () => replaceTrack(aReplaceChk.checked, true);
vReplaceChk.onclick = () => replaceTrack(vReplaceChk.checked, false);

startBtn.onclick = () => {
  let useVideo = vStartChk.checked;

  navigator.mediaDevices.getUserMedia({ video: useVideo, audio: true })
    .then((stream) => {
      avStream = stream;
      v1.srcObject = avStream;

      // Prepare audio track
      aTrack = avStream.getAudioTracks()[0];

      //- Firefox (native) / Chrome (adapter.js polyfill)
      log("Add track: " + aTrack.kind);
      aSender = pc1.addTrack(aTrack, avStream);
      //----
      //- Firefox (native) / Chrome (native) / (DEPRECATED)
      // log("Add stream: audio + video");
      // pc1.addStream(avStream);
      // aSender = pc1.getSenders().find((sender) => sender.track == aTrack);

      if (useVideo) {
        // Prepare video track
        vTrack = avStream.getVideoTracks()[0];
        log("Add track: " + vTrack.kind);
        vSender = pc1.addTrack(vTrack, avStream);
      }
    })
    .catch((err) => log(err));

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
  aDisableChk.disabled = false;
  aRemoveChk.disabled = false;
  aReplaceChk.disabled = false;
  if (useVideo) {
    vDisableChk.disabled = false;
    vRemoveChk.disabled = false;
    vReplaceChk.disabled = false;
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
