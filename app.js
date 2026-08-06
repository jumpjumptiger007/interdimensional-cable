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
let isRandom = false; // 💡 随机切台开关状态

// 💡 记忆库：记录每个视频离开时的进度与真实时间戳
// 格式: { "video_id": { videoTime: 12.5, leaveTimestamp: 1722880000 } }
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

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    const currentVideoId = videoList[currentChannelIndex];
    delete videoPlaybackTimes[currentVideoId];
    changeChannel(1);
  }
}

// 5. 换台核心逻辑（方案 B + 随机切台）
function changeChannel(direction) {
  if (!isPowerOn) return;

  // 💡 A. 切台前：保存当前频道的播放秒数 + 离开时刻的绝对时间戳
  if (player && player.getCurrentTime && videoList[currentChannelIndex]) {
    const currentVideoId = videoList[currentChannelIndex];
    videoPlaybackTimes[currentVideoId] = {
      videoTime: player.getCurrentTime() || 0,
      leaveTimestamp: Date.now() / 1000 // 单位：秒
    };
  }

  playStaticSound(450);
  startNoise();

  // 💡 B. 根据随机开关决定下一个频道
  if (isRandom && videoList.length > 1) {
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * videoList.length);
    } while (nextIndex === currentChannelIndex); // 避免随机到当前同一个台
    currentChannelIndex = nextIndex;
  } else {
    currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;
  }

  const nextVideoId = videoList[currentChannelIndex];

  // 💡 C. 方案 B：计算平行宇宙时间流逝 (离开时长 + 原进度)
  let targetTime = 0;
  if (videoPlaybackTimes[nextVideoId]) {
    const saved = videoPlaybackTimes[nextVideoId];
    const timePassed = (Date.now() / 1000) - saved.leaveTimestamp;
    targetTime = saved.videoTime + timePassed; // 后台同步流逝
  }

  setTimeout(() => {
    if (player && player.loadVideoById) {
      player.loadVideoById({
        videoId: nextVideoId,
        startSeconds: targetTime
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

// 6. 绑定事件
document.getElementById('btnPower').addEventListener('click', togglePower);
document.getElementById('btnChannelNext').addEventListener('click', () => changeChannel(1));
document.getElementById('btnChannelPrev').addEventListener('click', () => changeChannel(-1));

// 💡 随机开关点击处理
const btnRandom = document.getElementById('btnRandom');
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
