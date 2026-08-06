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
let isRandom = false; // 随机切台开关

// 记忆库：保存每个视频的进度、总时长与离开绝对时间
const videoPlaybackTimes = {};

// 1. 读取视频列表 (防缓存)
async function loadVideoList() {
  try {
    const response = await fetch('videos.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = data;
        videoList.sort(() => Math.random() - 0.5);
        console.log(`✅ 成功加载 ${videoList.length} 个跨次元频道！`);
      }
    }
  } catch (e) {
    console.warn("⚠️ 读取 videos.json 失败，使用默认列表。", e);
  }
}

loadVideoList();

// 2. Web Audio 白噪音
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
const ctx = canvas ? canvas.getContext('2d') : null;
let noiseInterval = null;

function generateNoise() {
  if (!canvas || !ctx) return;
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

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    const currentVideoId = videoList[currentChannelIndex];
    delete videoPlaybackTimes[currentVideoId];
    changeChannel(1);
  }
}

// 5. 换台逻辑 (修复时间溢出 + 完美随机支持)
function changeChannel(direction) {
  if (!isPowerOn) return;

  // A. 保存离开频道时的进度与总时长
  if (player && player.getCurrentTime && videoList[currentChannelIndex]) {
    const currentVideoId = videoList[currentChannelIndex];
    const duration = (player.getDuration && player.getDuration()) || 0;
    videoPlaybackTimes[currentVideoId] = {
      videoTime: player.getCurrentTime() || 0,
      duration: duration,
      leaveTimestamp: Date.now() / 1000
    };
  }

  playStaticSound(450);
  startNoise();

  // B. 计算下一个频道索引 (支持 RND 开关)
  if (isRandom && videoList.length > 1) {
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * videoList.length);
    } while (nextIndex === currentChannelIndex);
    currentChannelIndex = nextIndex;
  } else {
    currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;
  }

  const nextVideoId = videoList[currentChannelIndex];

  // C. 平行宇宙时间流逝 (取模运算，确保时间永不超出视频长度)
  let targetTime = 0;
  if (videoPlaybackTimes[nextVideoId]) {
    const saved = videoPlaybackTimes[nextVideoId];
    const timePassed = (Date.now() / 1000) - saved.leaveTimestamp;
    targetTime = saved.videoTime + timePassed;
    
    // 💡 核心修复：如果超时则进行取模，相当于视频在后台自动循环播放，绝不出界！
    if (saved.duration && saved.duration > 0) {
      targetTime = targetTime % saved.duration;
    }
  }

  setTimeout(() => {
    if (player && player.loadVideoById) {
      player.loadVideoById({
        videoId: nextVideoId,
        startSeconds: Math.floor(targetTime)
      });
    }
    setTimeout(stopNoise, 150);
  }, 350);
}

function togglePower() {
  const tvScreen = document.getElementById('tvScreen');
  isPowerOn = !isPowerOn;

  if (isPowerOn) {
    if (tvScreen) tvScreen.classList.add('powered-on');
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
      if (tvScreen) tvScreen.classList.remove('powered-on');
    }, 300);
  }
}

// 6. 安全绑定 DOM 事件 (防止 null 节点导致脚本崩溃)
function initRemoteEvents() {
  const btnPower = document.getElementById('btnPower');
  const btnNext = document.getElementById('btnChannelNext');
  const btnPrev = document.getElementById('btnChannelPrev');
  const btnVolUp = document.getElementById('btnVolUp');
  const btnVolDown = document.getElementById('btnVolDown');
  const btnMute = document.getElementById('btnMute');
  const btnRandom = document.getElementById('btnRandom');

  if (btnPower) btnPower.addEventListener('click', togglePower);
  if (btnNext) btnNext.addEventListener('click', () => changeChannel(1));
  if (btnPrev) btnPrev.addEventListener('click', () => changeChannel(-1));

  if (btnVolUp) {
    btnVolUp.addEventListener('click', () => {
      if (player && isPowerOn && player.setVolume) {
        player.setVolume(Math.min(player.getVolume() + 10, 100));
      }
    });
  }

  if (btnVolDown) {
    btnVolDown.addEventListener('click', () => {
      if (player && isPowerOn && player.setVolume) {
        player.setVolume(Math.max(player.getVolume() - 10, 0));
      }
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      if (player && isPowerOn && player.mute) {
        isMuted = !isMuted;
        if (isMuted) player.mute();
        else player.unMute();
      }
    });
  }

  if (btnRandom) {
    btnRandom.addEventListener('click', () => {
      isRandom = !isRandom;
      if (isRandom) {
        btnRandom.classList.add('active');
        btnRandom.innerText = 'RND: ON';
      } else {
        btnRandom.classList.remove('active');
        btnRandom.innerText = 'RND: OFF';
      }
    });
  }
}

// 确保 DOM 加载完成后绑定
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRemoteEvents);
} else {
  initRemoteEvents();
}
