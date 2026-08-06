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

// 💡 纯粹记忆库：只记录每个视频离开时的精准秒数 (例如: { "dQw4w9WgXcQ": 42.5 })
const videoPlaybackTimes = {};

// 1. 读取视频列表 (保持顺序)
async function loadVideoList() {
  try {
    const response = await fetch('videos.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = data;
        console.log(`✅ 成功加载 ${videoList.length} 个跨次元频道！`);
      }
    }
  } catch (e) {
    console.warn("⚠️ 读取 videos.json 失败，使用默认列表。", e);
  }
}

loadVideoList();

// 2. 复古荧光台号 OSD 显示
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

// 3. Web Audio 白噪音
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

// 4. Canvas 雪花屏
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

// 5. YouTube API 初始化
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

// 6. 状态监听：处理“首次进入长视频的随机起点”与“视频放完逻辑”
function onPlayerStateChange(event) {
  const currentVideoId = videoList[currentChannelIndex];

  // 💡 当视频开始播放时：判断是否需要触发长视频随机起点
  if (event.data === YT.PlayerState.PLAYING && isPowerOn) {
    // 只有当该频道从未被访问过（没有记忆点）时触发
    if (videoPlaybackTimes[currentVideoId] === undefined) {
      const duration = player.getDuration ? player.getDuration() : 0;
      
      // 满足条件：开启 RND 模式 且 视频时长超过 300 秒 (5 分钟)
      if (isRandom && duration > 300) {
        // 随机区间: 0 秒 到 (总时长 - 60 秒)
        const maxStartTime = Math.max(0, duration - 60);
        const randomStartTime = Math.floor(Math.random() * maxStartTime);
        
        player.seekTo(randomStartTime, true);
        videoPlaybackTimes[currentVideoId] = randomStartTime;
      } else {
        videoPlaybackTimes[currentVideoId] = 0;
      }
    }
  }

  // 视频播放完毕：清除记忆，自动切下一台
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    delete videoPlaybackTimes[currentVideoId];
    changeChannel(1);
  }
}

// 7. 换台逻辑（顺序切台 + 纯粹断点续播）
function changeChannel(direction) {
  if (!isPowerOn) return;

  // 💡 A. 切台前：精准记录当前视频的当前秒数
  if (player && player.getCurrentTime && videoList[currentChannelIndex]) {
    const currentVideoId = videoList[currentChannelIndex];
    if (player.getPlayerState && player.getPlayerState() !== -1) {
      videoPlaybackTimes[currentVideoId] = player.getCurrentTime() || 0;
    }
  }

  playStaticSound(450);
  startNoise();

  // 💡 B. 永远严格按顺序切台 (01 -> 02 -> 03)
  currentChannelIndex = (currentChannelIndex + direction + videoList.length) % videoList.length;

  showChannelOSD();

  const nextVideoId = videoList[currentChannelIndex];
  
  // 💡 C. 检查是否有历史记忆；如果有就跳转断点，没有则为 undefined
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
  isPowerOn = !isPowerOn;

  if (isPowerOn) {
    if (tvScreen) tvScreen.classList.add('powered-on');
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
    if (player && player.pauseVideo) player.pauseVideo();
    setTimeout(() => {
      stopNoise();
      if (tvScreen) tvScreen.classList.remove('powered-on');
    }, 300);
  }
}

// 8. 遥控器按键绑定
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
