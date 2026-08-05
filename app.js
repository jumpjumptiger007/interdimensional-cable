// 默认 Mock/兜底视频列表 (仅当 fetch 本地 videos.json 失败时使用)
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

// 1. 优先读取自动生成的 videos.json (增加防缓存时间戳)
async function loadVideoList() {
  try {
    // 加上 ?t= 时间戳，防止浏览器强缓存 GitHub Pages 上的旧 json 数据
    const response = await fetch('videos.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        videoList = data;
        // 随机打乱频道顺序，每次刷新页面都有新鲜感
        videoList.sort(() => Math.random() - 0.5);
        console.log(`✅ 成功加载 ${videoList.length} 个 Reddit 真实频道！`);
      }
    }
  } catch (e) {
    console.warn("⚠️ 未能加载本地 videos.json (可能因本地 file:// 跨域拦截)，使用兜底视频列表。", e);
  }
}

// 页面初始化时异步加载数据
loadVideoList();

// 2. Web Audio API 纯代码实时生成换台“沙沙”白噪音音效
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
    output[i] = Math.random() * 2 - 1; // 产生随机杂音采样
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

// 3. Canvas 雪花屏画面生成
const canvas = document.getElementById('noiseCanvas');
const ctx = canvas.getContext('2d');
let noiseInterval = null;

function generateNoise() {
  if (!canvas) return;
  const w = canvas.width = canvas.clientWidth / 2; // 降采样提高绘制性能
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

// 4. YouTube API 初始化与事件监听
// 找到 app.js 中的这一段并更新：
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
      'cc_load_policy': 0, // 💡 0 代表默认强制关闭 CC 字幕
      'iv_load_policy': 3  // 💡 顺便隐藏视频内部的弹窗遮罩/注解
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}


// 监听播放状态：当前频道视频播放结束，自动切到下一台
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED && isPowerOn) {
    changeChannel(1);
  }
}

// 5. 遥控器核心逻辑控制
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

// 6. 绑定遥控器按钮点击事件
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
