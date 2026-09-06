// Interdimensional Cable
// Keeps the original playback behavior, but adds UI state synchronization for the redesigned TV/remote.

// Default / fallback videos
let videoList = [
  "dQw4w9WgXcQ",
  "L_LUpnjgPso",
  "9bZkp7q19f0",
  "w4m6N7Zk-yM",
  "fC7oUOUEEi4"
];

let player = null;
let currentChannelIndex = 0;
let isPowerOn = false;
let isMuted = false;
let isRandom = true;
let osdTimer = null;

const videoPlaybackTimes = {};
const hasRandomSeeked = {};

let apiReady = false;
let listReady = false;

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadVideoList() {
  try {
    const response = await fetch(`videos.json?t=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`videos.json returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      videoList = shuffleArray(data);
      console.log(`Loaded ${videoList.length} interdimensional channels.`);
    }
  } catch (error) {
    console.warn("Could not load videos.json. Using fallback channels.", error);
    videoList = shuffleArray([...videoList]);
  } finally {
    listReady = true;
    tryInitPlayer();
  }
}

loadVideoList();

function showChannelOSD() {
  const osd = document.getElementById("channelDisplay");
  if (!osd || !isPowerOn) return;

  const channelNum = String(currentChannelIndex + 1).padStart(2, "0");
  osd.textContent = isRandom ? `CH ${channelNum} · RND` : `CH ${channelNum}`;
  osd.classList.add("show");

  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    osd.classList.remove("show");
  }, 1900);
}

// --- Static noise audio ------------------------------------------------------

let audioCtx = null;

function playStaticSound(duration = 400) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * (duration / 1000)));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();

    whiteNoise.buffer = buffer;
    gainNode.gain.setValueAtTime(0.105, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + duration / 1000
    );

    whiteNoise.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    whiteNoise.start();
  } catch (error) {
    // Audio feedback is decorative; playback controls should still work if WebAudio is blocked.
    console.debug("Static sound unavailable.", error);
  }
}

// --- Static noise canvas -----------------------------------------------------

const canvas = document.getElementById("noiseCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let noiseInterval = null;

function generateNoise() {
  if (!canvas || !ctx) return;

  const width = Math.max(1, Math.floor(canvas.clientWidth / 2));
  const height = Math.max(1, Math.floor(canvas.clientHeight / 2));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const imageData = ctx.createImageData(width, height);
  const buffer32 = new Uint32Array(imageData.data.buffer);

  for (let i = 0; i < buffer32.length; i++) {
    const value = Math.floor(Math.random() * 255);
    buffer32[i] =
      (255 << 24) |
      (value << 16) |
      (value << 8) |
      value;
  }

  ctx.putImageData(imageData, 0, 0);
}

function startNoise() {
  if (!canvas) return;

  generateNoise();
  canvas.classList.add("active");

  if (!noiseInterval) {
    noiseInterval = setInterval(generateNoise, 45);
  }
}

function stopNoise() {
  if (!canvas) return;

  canvas.classList.remove("active");

  if (noiseInterval) {
    clearInterval(noiseInterval);
    noiseInterval = null;
  }
}

// --- YouTube ---------------------------------------------------------------

function onYouTubeIframeAPIReady() {
  apiReady = true;
  tryInitPlayer();
}

function tryInitPlayer() {
  if (!apiReady || !listReady || player || !videoList.length) return;

  player = new YT.Player("player", {
    videoId: videoList[currentChannelIndex],
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      cc_load_policy: 0,
      iv_load_policy: 3
    },
    events: {
      onStateChange: onPlayerStateChange
    }
  });
}

function onPlayerStateChange(event) {
  const currentVideoId = videoList[currentChannelIndex];

  if (
    event.data === YT.PlayerState.PLAYING &&
    isPowerOn &&
    currentVideoId
  ) {
    if (
      videoPlaybackTimes[currentVideoId] === undefined &&
      !hasRandomSeeked[currentVideoId]
    ) {
      const tryRandomSeek = () => {
        if (!player || !isPowerOn || currentVideoId !== videoList[currentChannelIndex]) {
          return;
        }

        const duration = player.getDuration ? player.getDuration() : 0;

        if (duration > 0) {
          hasRandomSeeked[currentVideoId] = true;

          if (isRandom && duration > 300) {
            const maxStartTime = Math.max(0, duration - 60);
            const randomStartTime = Math.floor(Math.random() * maxStartTime);

            player.seekTo(randomStartTime, true);
            videoPlaybackTimes[currentVideoId] = randomStartTime;
          } else {
            videoPlaybackTimes[currentVideoId] = 0;
          }
        } else {
          setTimeout(tryRandomSeek, 120);
        }
      };

      tryRandomSeek();
    }
  }

  if (event.data === YT.PlayerState.ENDED && isPowerOn && currentVideoId) {
    delete videoPlaybackTimes[currentVideoId];
    delete hasRandomSeeked[currentVideoId];
    changeChannel(1);
  }
}

// --- Channel / power ---------------------------------------------------------

function saveCurrentPlaybackPosition() {
  if (
    !player ||
    !player.getCurrentTime ||
    !player.getPlayerState ||
    !videoList[currentChannelIndex]
  ) {
    return;
  }

  if (player.getPlayerState() !== -1) {
    videoPlaybackTimes[videoList[currentChannelIndex]] =
      player.getCurrentTime() || 0;
  }
}

function changeChannel(direction) {
  if (!isPowerOn || !videoList.length) return;

  saveCurrentPlaybackPosition();
  playStaticSound(430);
  startNoise();

  currentChannelIndex =
    (currentChannelIndex + direction + videoList.length) % videoList.length;

  showChannelOSD();

  const nextVideoId = videoList[currentChannelIndex];
  const savedTime = videoPlaybackTimes[nextVideoId];

  setTimeout(() => {
    if (player && player.loadVideoById) {
      player.loadVideoById({
        videoId: nextVideoId,
        startSeconds: savedTime !== undefined ? Math.floor(savedTime) : 0
      });
    }

    setTimeout(stopNoise, 145);
  }, 320);
}

function syncPowerUI() {
  const tvScreen = document.getElementById("tvScreen");
  const tvSet = document.getElementById("tvSet");
  const powerLed = document.getElementById("powerLed");
  const btnPower = document.getElementById("btnPower");

  tvScreen?.classList.toggle("powered-on", isPowerOn);
  tvSet?.classList.toggle("powered-on", isPowerOn);
  powerLed?.classList.toggle("on", isPowerOn);
  btnPower?.classList.toggle("active", isPowerOn);
  btnPower?.setAttribute("aria-pressed", String(isPowerOn));
}

function togglePower() {
  isPowerOn = !isPowerOn;

  if (isPowerOn) {
    syncPowerUI();
    playStaticSound(560);
    startNoise();
    showChannelOSD();

    setTimeout(() => {
      stopNoise();
      if (player && player.playVideo) {
        player.playVideo();
      }
    }, 470);
  } else {
    saveCurrentPlaybackPosition();
    playStaticSound(280);
    startNoise();

    if (player && player.pauseVideo) {
      player.pauseVideo();
    }

    setTimeout(() => {
      stopNoise();
      syncPowerUI();
    }, 260);
  }
}

// --- Remote UI ---------------------------------------------------------------

function setPressedFeedback(button) {
  if (!button) return;

  button.classList.add("is-pressed");
  setTimeout(() => button.classList.remove("is-pressed"), 105);
}

function syncMuteUI() {
  const btnMute = document.getElementById("btnMute");
  btnMute?.classList.toggle("active", isMuted);
  btnMute?.setAttribute("aria-pressed", String(isMuted));
}

function syncRandomUI() {
  const btnRandom = document.getElementById("btnRandom");
  if (!btnRandom) return;

  btnRandom.classList.toggle("active", isRandom);
  btnRandom.setAttribute("aria-pressed", String(isRandom));
  btnRandom.textContent = isRandom ? "RND" : "SEQ";
}

function changeVolume(delta) {
  if (!player || !isPowerOn || !player.setVolume || !player.getVolume) return;

  const nextVolume = Math.max(0, Math.min(100, player.getVolume() + delta));
  player.setVolume(nextVolume);

  if (nextVolume > 0 && isMuted && player.unMute) {
    isMuted = false;
    player.unMute();
    syncMuteUI();
  }
}

function initRemoteEvents() {
  const btnPower = document.getElementById("btnPower");
  const btnNext = document.getElementById("btnChannelNext");
  const btnPrev = document.getElementById("btnChannelPrev");
  const btnVolUp = document.getElementById("btnVolUp");
  const btnVolDown = document.getElementById("btnVolDown");
  const btnMute = document.getElementById("btnMute");
  const btnRandom = document.getElementById("btnRandom");

  syncPowerUI();
  syncMuteUI();
  syncRandomUI();

  btnPower?.addEventListener("click", () => {
    setPressedFeedback(btnPower);
    togglePower();
  });

  btnNext?.addEventListener("click", () => {
    setPressedFeedback(btnNext);
    changeChannel(1);
  });

  btnPrev?.addEventListener("click", () => {
    setPressedFeedback(btnPrev);
    changeChannel(-1);
  });

  btnVolUp?.addEventListener("click", () => {
    setPressedFeedback(btnVolUp);
    changeVolume(10);
  });

  btnVolDown?.addEventListener("click", () => {
    setPressedFeedback(btnVolDown);
    changeVolume(-10);
  });

  btnMute?.addEventListener("click", () => {
    setPressedFeedback(btnMute);

    if (!player || !isPowerOn || !player.mute || !player.unMute) return;

    isMuted = !isMuted;

    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }

    syncMuteUI();
  });

  btnRandom?.addEventListener("click", () => {
    setPressedFeedback(btnRandom);
    isRandom = !isRandom;
    syncRandomUI();

    if (isPowerOn) {
      showChannelOSD();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRemoteEvents);
} else {
  initRemoteEvents();
}
