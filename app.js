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
let isRandom = false; // 随机起点开关
let osdTimer = null;

// 1. 纯粹断点记忆库：只记录离开时的精准秒数 (例: { "dQw4w9WgXcQ": 42 })
const videoPlaybackTimes = {};
// 2. 标记防止重复触发随机 Seek
const hasRandomSeeked = {};

// 等待 YouTube API 与视频列表都就绪后再初始化播放器
let apiReady = false;
let listReady = false;

// 洗牌：保留「顺序切台 + 断点记忆」逻辑，只改变每次打开时的频道顺序
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 读取视频列表
async function loadVideoList() {
  try {
    const response = await fetch('videos.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = shuffleArray(data);
        console.log(`✅ 成功加载 ${videoList.length} 个跨次元频道（本次顺序已随机）！`);
      }
    }
  } catch (e) {
    console.warn("⚠️ 读取 videos.json 失败，使用默认列表。", e);
    videoList = shuffleArray([...videoList]);
  } finally {
    listReady = true;
    tryInitPlayer();
  }
}

loadVideoList();

// 复古荧光台号 OSD 显示
function showChannelOSD() {
  const osd = document.getElementById('channelDisplay');
  if (!osd || !isPowerOn) return;

  const channelNum = String(currentChannelIndex + 1).padStart(2, '0');
  osd.innerText = isRandom ? `CH ${channelNum} (RND)` : `CH ${channelNum}`;
  osd.classList.add('show');

  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    osd.classList.remove('show');
  }, 2200);
}

// Web Audio 白噪音
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

// Canvas 雪花屏
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

// YouTube API 初始化
function onYouTubeIframeAPIReady() {
  apiReady = true;
  tryInitPlayer();
}

function tryInitPlayer() {
  if (!apiReady || !listReady || player) return;

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

// 播放状态监听：精准处理长视频随机起播逻辑
function onPlayerStateChange(event) {
  const currentVideoId = videoList[currentChannelIndex];

  // 💡 当视频处于播放状态且未被初始化时
  if (event.data === YT.PlayerState.PLAYING && isPowerOn) {
    if (videoPlaybackTimes[currentVideoId] === undefined && !hasRandomSeeked[currentVideoId]) {
      
      // 解决 YouTube API 时长延迟异步 Bug：轮询直至获取真实视频时长
      const tryRandomSeek = () => {
        const duration = player.getDuration ? player.getDuration() : 0;

        if (duration > 0) {
          hasRandomSeeked[currentVideoId] = true;

          // 条件：开启 RND 开关 且 视频总时长 > 300 秒 (5分钟)
          if (isRandom && duration > 300) {
            const maxStartTime = Math.max(0, duration - 60);
            const randomStartTime = Math.floor(Math.random() * maxStartTime);

            console.log(`🎲 触发 5 分钟长视频随机起播：第 ${randomStartTime} 秒 (总长: ${Math.floor(duration)} 秒)`);
            player.seekTo(randomStartTime, true);
            videoPlaybackTimes[currentVideoId] = randomStartTime;
          } else {
            videoPlaybackTimes[currentVideoId] = 0;
          }
        } else {
          // 若视频时长未加载出，100ms 后重试
          setTimeout(tryRandomSeek, 100);
        }
      };

      tryRandomSeek();
    }
  }

  // 视频自然播放完毕
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    delete videoPlaybackTimes[currentVideoId];
    delete hasRandomSeeked[currentVideoId];
    changeChannel(1);
  }
}

// 换台逻辑 (严格顺序切台 + 断点记忆)
function changeChannel(direction) {
  if (!isPowerOn) return;

  // 切台前精准保存当前秒数
  if (player && player.getCurrentTime && videoList[currentChannelIndex]) {
    const currentVideoId = videoList[currentChannelIndex];
    if (player.getPlayerState && player.getPlayerState() !== -1) {
      videoPlaybackTimes[currentVideoId] = player.getCurrentTime() || 0;
    }
  }

  playStaticSound(450);
  startNoise();

  // 按顺序切台
  currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;

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
    setTimeout(stopNoise, 150);
  }, 350);
}

function togglePower() {
  const tvScreen = document.getElementById('tvScreen');
  const powerLed = document.getElementById('powerLed');
  isPowerOn = !isPowerOn;

  if (isPowerOn) {
    if (tvScreen) tvScreen.classList.add('powered-on');
    if (powerLed) powerLed.classList.add('on');
    playStaticSound(600);
    startNoise();
    showChannelOSD();
    setTimeout(() => {
      stopNoise();
      if (player && player.playVideo) player.playVideo();
    }, 500);
  } else {
    playStaticSound(300);
    startNoise();
    if (powerLed) powerLed.classList.remove('on');
    if (player && player.pauseVideo) player.pauseVideo();
    setTimeout(() => {
      stopNoise();
      if (tvScreen) tvScreen.classList.remove('powered-on');
    }, 300);
  }
}

// DOM 事件绑定
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
      if (isPowerOn) showChannelOSD();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRemoteEvents);
} else {
  initRemoteEvents();
}
