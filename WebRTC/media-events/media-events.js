
video2.onloadstart       = () => console.log("1 loadstart");
video2.onloadedmetadata  = () => console.log("2 loadedmetadata");
video2.onloadeddata      = () => console.log("3 loadeddata");
video2.oncanplay         = () => console.log("4 canplay");
video2.onplay            = () => console.log("5 play");
video2.onplaying         = () => console.log("6 playing");
video2.oncanplaythrough  = () => console.log("7 canplaythrough");



/* ====================== */
/* ==== WebRTC Setup ==== */
/* ====================== */

const pc1 = new RTCPeerConnection();
const pc2 = new RTCPeerConnection();

function addCandidate(pc, can) {
  can && pc.addIceCandidate(can).catch(log);
}
pc1.onicecandidate = (ev) => addCandidate(pc2, ev.candidate);
pc2.onicecandidate = (ev) => addCandidate(pc1, ev.candidate);

let isNegotiating = false; // Workaround for Chrome bug #740501: skip nested negotiations
pc1.onnegotiationneeded = (ev) => {
  if (isNegotiating) { return; }
  isNegotiating = true;
  pc1.createOffer()
    .then((offer) => pc1.setLocalDescription(offer))
    .then(() => pc2.setRemoteDescription(pc1.localDescription))
    .then(() => pc2.createAnswer())
    .then((answer) => pc2.setLocalDescription(answer))
    .then(() => pc1.setRemoteDescription(pc2.localDescription))
    .catch((err) => log("[onnegotiationneeded] Error: " + err));
}
pc1.onsignalingstatechange = (ev) => {
  // Workaround for Chrome bug #740501: skip nested negotiations
  isNegotiating = (pc1.signalingState != 'stable');
}

pc2.ontrack = (trackEv) => {
  const kind = trackEv.track.kind;
  log("Remote track available: " + kind);
  if (kind === 'video') {
    log("Hold remote video for 3 seconds...");
    setTimeout(() => {
      log("Set remote video now");
      video2.srcObject = trackEv.streams[0];

      log("Hold play() for 3 seconds...");
      setTimeout(() => {
        log("play() remote video now");
        video2.play();
      }, 5000);
    }, 5000);
  }
};



/* ==================== */
/* ==== UI actions ==== */
/* ==================== */

startBtn.onclick = () => {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      video1.srcObject = stream;
      video1.play();
      stream.getTracks().forEach((track) => {
        log("Local track available: " + track.kind);
        pc1.addTrack(track, stream);
        // RTCPeerConnection.addTrack() triggers onnegotiationneeded
      });
    })
    .catch((err) => log("[getUserMedia] Error: " + err));

  startBtn.disabled = true;
}

function log(msg) {
  div.innerHTML = div.innerHTML + msg + "<br>";
  console.log(msg);
}
