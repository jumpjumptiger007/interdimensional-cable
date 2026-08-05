// 默认 Mock 列表 (作为 fallback 兜底数据)
let videoList = [
  "dQw4w9WgXcQ",
  "L_LUpnjgPso",
  "9bZkp7q19f0"
];

let player = null;
let currentChannelIndex = 0;
let isPowerOn = false;
let isMuted = false;

// 优先异步加载自动生成的 videos.json 文件
async function loadVideoList() {
  try {
    const response = await fetch('videos.json');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = data;
        // 随机打乱播放列表，每次刷新都有新鲜感
        videoList.sort(() => Math.random() - 0.5);
        console.log(`成功加载 ${videoList.length} 个视频！`);
      }
    }
  } catch (e) {
    console.warn("未能加载本地 videos.json，使用备用视频列表。");
  }
}

// 页面初始化加载数据
loadVideoList();

// 1. Web Audio API 生成白噪音音效
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

// 2. Canvas 雪花屏画面生成
const canvas = document.getElementById('noiseCanvas');
const ctx = canvas.getContext('2d');
let noiseInterval = null;

function generateNoise() {
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
  canvas.classList.add('active');
  if (!noiseInterval) noiseInterval = setInterval(generateNoise, 40);
}

function stopNoise() {
  canvas.classList.remove('active');
  if (noiseInterval) {
    clearInterval(noiseInterval);
    noiseInterval = null;
  }
}

// 3. YouTube API 初始化与事件监听
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    videoId: videoList[currentChannelIndex],
    playerVars: {
      'autoplay': 0,
      'controls': 0,
      'disablekb': 1,
      'modestbranding': 1,
      'rel': 0,
      'playsinline': 1
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    changeChannel(1);
  }
}

// 4. 遥控器逻辑控制
function changeChannel(direction) {
  if (!isPowerOn) return;

  playStaticSound(450);
  startNoise();

  currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;

  setTimeout(() => {
    if (player && player.loadVideoById) {
      player.loadVideoById(videoList[currentChannelIndex]);
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

// 绑定按钮事件
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