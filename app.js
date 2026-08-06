// 默认 Mock/兜底视频列表
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

// 💡 记忆库：用来保存每个视频 ID 播放到的秒数 (例如: { "dQw4w9WgXcQ": 45.2 })
const videoPlaybackTimes = {};

// 1. 优先读取自动生成的 videos.json (防缓存)
async function loadVideoList() {
  try {
    const response = await fetch('videos.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = data;
        videoList.sort(() => Math.random() - 0.5);
        console.log(`✅ 成功加载 ${videoList.length} 个 Reddit 真实频道！`);
      }
    }
  } catch (e) {
    console.warn("⚠️ 未能加载本地 videos.json，使用兜底视频列表。", e);
  }
}

loadVideoList();

// 2. Web Audio API 白噪音
let audioCtx = null;
function playStaticSound(duration = 400) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const bufferSize = audioCtx.sampleRate * (duration / 1000);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = buffer;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (duration / 1000));

  whiteNoise.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  whiteNoise.start();
}

// 3. Canvas 雪花屏
const canvas = document.getElementById('noiseCanvas');
const ctx = canvas.getContext('2d');
let noiseInterval = null;

function generateNoise() {
  if (!canvas) return;
  const w = canvas.width = canvas.clientWidth / 2;
  const h = canvas.height = canvas.clientHeight / 2;
  const imgData = ctx.createImageData(w, h);
  const buffer32 = new Uint32Array(imgData.data.buffer);

  for (let i = 0; i < buffer32.length; i++) {
    const v = Math.floor(Math.random() * 255);
    buffer32[i] = (255 << 24) | (v << 16) | (v << 8) | v;
  }
  ctx.putImageData(imgData, 0, 0);
}

function startNoise() {
  if (!canvas) return;
  canvas.classList.add('active');
  if (!noiseInterval) noiseInterval = setInterval(generateNoise, 40);
}

function stopNoise() {
  if (!canvas) return;
  canvas.classList.remove('active');
  if (noiseInterval) {
    clearInterval(noiseInterval);
    noiseInterval = null;
  }
}

// 4. YouTube API 初始化
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    videoId: videoList[currentChannelIndex],
    playerVars: {
      'autoplay': 0,
      'controls': 1,
      'disablekb': 1,
      'modestbranding': 1,
      'rel': 0,
      'playsinline': 1,
      'cc_load_policy': 0,
      'iv_load_policy': 3
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}

// 5. 播放状态处理
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    // 💡 视频自然播放完毕，清空它的时间记忆（下次切回来重新播放）
    const currentVideoId = videoList[currentChannelIndex];
    delete videoPlaybackTimes[currentVideoId];
    
    changeChannel(1);
  }
}

// 6. 遥控器换台（含进度记忆逻辑）
function changeChannel(direction) {
  if (!isPowerOn) return;

  // 💡 A. 换台前：记录当前视频放到了第几秒
  if (player && player.getCurrentTime && videoList[currentChannelIndex]) {
    const currentVideoId = videoList[currentChannelIndex];
    videoPlaybackTimes[currentVideoId] = player.getCurrentTime() || 0;
  }

  playStaticSound(450);
  startNoise();

  currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;
  const nextVideoId = videoList[currentChannelIndex];

  // 💡 B. 读取新切入频道的进度，若没播过则从 0 秒开始
  const savedTime = videoPlaybackTimes[nextVideoId] || 0;

  setTimeout(() => {
    if (player && player.loadVideoById) {
      // 💡 C. 传入 startSeconds 跳转到上次离开的时间
      player.loadVideoById({
        videoId: nextVideoId,
        startSeconds: savedTime
      });
    }
    setTimeout(stopNoise, 150);
  }, 350);
}

function togglePower() {
  const tvScreen = document.getElementById('tvScreen');
  isPowerOn = !isPowerOn;

  if (isPowerOn) {
    tvScreen.classList.add('powered-on');
    playStaticSound(600);
    startNoise();
    setTimeout(() => {
      stopNoise();
      if (player && player.playVideo) player.playVideo();
    }, 500);
  } else {
    playStaticSound(300);
    startNoise();
    if (player && player.pauseVideo) player.pauseVideo();
    setTimeout(() => {
      stopNoise();
      tvScreen.classList.remove('powered-on');
    }, 300);
  }
}

// 绑定遥控器事件
document.getElementById('btnPower').addEventListener('click', togglePower);
document.getElementById('btnChannelNext').addEventListener('click', () => changeChannel(1));
document.getElementById('btnChannelPrev').addEventListener('click', () => changeChannel(-1));

document.getElementById('btnVolUp').addEventListener('click', () => {
  if (player && isPowerOn) {
    player.setVolume(Math.min(player.getVolume() + 10, 100));
  }
});

document.getElementById('btnVolDown').addEventListener('click', () => {
  if (player && isPowerOn) {
    player.setVolume(Math.max(player.getVolume() - 10, 0));
  }
});

document.getElementById('btnMute').addEventListener('click', () => {
  if (player && isPowerOn) {
    isMuted = !isMuted;
    if (isMuted) player.mute();
    else player.unMute();
  }
});
