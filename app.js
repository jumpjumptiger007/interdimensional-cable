/**
 * 跨次元电视 (Interdimensional Cable) - 核心重构版 app.js
 */

// ==========================================
// 1. 频道配置与全局状态管理
// ==========================================
// 请保留或修改你原有的频道数据结构
const CHANNELS = [
    { id: 'ch_01', videoId: 'dQw4w9WgXcQ', name: 'Channel 01' },
    { id: 'ch_02', videoId: '9bZkp7q19f0', name: 'Channel 02' },
    { id: 'ch_03', videoId: 'L_LUpnjgPso', name: 'Channel 03' }
];

let currentChannelIndex = 0;
let isRndEnabled = true; // RND 开关状态（默认开启）
let player = null;

/**
 * 频道记忆状态对象结构:
 * { 
 *   [channelId]: { 
 *     visited: boolean,  // 是否已被切入过
 *     savedTime: number  // 离开时的精确秒数
 *   } 
 * }
 */
const channelsState = {};

// ==========================================
// 2. 音效与视效 (DO NOT TOUCH - 保持不变)
// ==========================================
let audioCtx = null;

function playWhiteNoise(durationMs = 300) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const bufferSize = audioCtx.sampleRate * (durationMs / 1000);
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = buffer;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime); // 白噪音音量
        
        whiteNoise.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        whiteNoise.start();
    } catch (e) {
        console.warn('AudioContext 不支持或自动播放受限', e);
    }
}

function playSnowEffect(durationMs = 350) {
    const canvas = document.getElementById('snow-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';

    let animationFrameId;
    const startTime = Date.now();

    function renderSnow() {
        const width = canvas.width = canvas.offsetWidth || window.innerWidth;
        const height = canvas.height = canvas.offsetHeight || window.innerHeight;
        const imgData = ctx.createImageData(width, height);
        const buffer = new Uint32Array(imgData.data.buffer);

        for (let i = 0; i < buffer.length; i++) {
            const color = Math.floor(Math.random() * 255);
            buffer[i] = (255 << 24) | (color << 16) | (color << 8) | color;
        }

        ctx.putImageData(imgData, 0, 0);

        if (Date.now() - startTime < durationMs) {
            animationFrameId = requestAnimationFrame(renderSnow);
        } else {
            canvas.style.display = 'none';
            cancelAnimationFrame(animationFrameId);
        }
    }

    renderSnow();
    playWhiteNoise(durationMs);
}

// ==========================================
// 3. 断点保存与起播策略引擎 (核心修复)
// ==========================================

/**
 * [修复 1] 纯粹的断点保存逻辑
 * 切走频道时触发，直接保存当前秒数，不计算离开时间差。
 */
function saveCurrentChannelProgress() {
    if (!player || typeof player.getCurrentTime !== 'function') return;

    const currentChannel = CHANNELS[currentChannelIndex];
    if (!currentChannel) return;

    const currentTime = player.getCurrentTime() || 0;
    
    // 纯粹记录当前播放进度，记录 visited 状态
    channelsState[currentChannel.id] = {
        visited: true,
        savedTime: currentTime
    };
    
    console.log(`[Progress Saved] 频道 ${currentChannel.id} 记忆点: ${currentTime.toFixed(1)}s`);
}

/**
 * [修复 2] 播放策略：判定断点续播 vs 长视频随机起播
 */
function applyPlaybackStrategy() {
    if (!player || typeof player.getDuration !== 'function') return;

    const currentChannel = CHANNELS[currentChannelIndex];
    const channelData = channelsState[currentChannel.id] || { visited: false, savedTime: 0 };
    const duration = player.getDuration() || 0;

    // --- 场景 A：已经访问过的频道 -> 强行恢复上次离开时的断点 (无视 RND) ---
    if (channelData.visited) {
        console.log(`[Playback] 恢复断点: 频道 ${currentChannel.id} -> ${channelData.savedTime.toFixed(1)}s`);
        player.seekTo(channelData.savedTime, true);
        player.playVideo();
        return;
    }

    // --- 场景 B：第一次访问该频道 ---
    // 判定条件：视频总时长 > 300 秒 (5分钟) 且开启了 RND 模式
    if (duration > 300 && isRndEnabled) {
        const maxStartSec = Math.max(0, duration - 60);
        const randomTime = Math.floor(Math.random() * maxStartSec);
        
        console.log(`[Playback] 触发长视频 RND (时长 ${duration.toFixed(0)}s > 300s) -> 随机跳至 ${randomTime}s`);
        player.seekTo(randomTime, true);
    } else {
        // 短视频 (≤ 5 min) 或未开启 RND -> 从 0 秒正常开始
        console.log(`[Playback] 正常起播: 从 0s 开始播放`);
        player.seekTo(0, true);
    }

    player.playVideo();

    // 标记为已访问，防止在当前频道内反复切换时重复触发 RND
    channelsState[currentChannel.id] = {
        visited: true,
        savedTime: player.getCurrentTime() || 0
    };
}

// ==========================================
// 4. YouTube Iframe API 初始化与事件处理
// ==========================================
function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-player', {
        videoId: CHANNELS[currentChannelIndex].videoId,
        playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    applyPlaybackStrategy();
    updateUI();
}

function onPlayerStateChange(event) {
    // 捕获 API 加载完成并开始缓冲/播放的瞬态，确保获取到正确的 Video Duration
    if (event.data === YT.PlayerState.UNSTARTED || event.data === YT.PlayerState.BUFFERING) {
        applyPlaybackStrategy();
    }
}

// ==========================================
// 5. 频道切换控制 (CH+ / CH-)
// ==========================================
function changeChannel(direction) {
    // 1. 切走前保存当前断点
    saveCurrentChannelProgress();

    // 2. 顺序更新频道索引 (0 -> 1 -> 2 -> 0)
    if (direction === 'next') {
        currentChannelIndex = (currentChannelIndex + 1) % CHANNELS.length;
    } else if (direction === 'prev') {
        currentChannelIndex = (currentChannelIndex - 1 + CHANNELS.length) % CHANNELS.length;
    }

    const newChannel = CHANNELS[currentChannelIndex];

    // 3. 播放切台视效与噪音
    playSnowEffect(350);

    // 4. 加载新视频
    if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById(newChannel.videoId);
    }

    updateUI();
}

// ==========================================
// 6. UI 状态绑定与 DOM 事件监听
// ==========================================
function updateUI() {
    // 更新频道显示文本
    const channelDisplay = document.getElementById('channel-display');
    if (channelDisplay) {
        const channelNumStr = String(currentChannelIndex + 1).padStart(2, '0');
        channelDisplay.textContent = `CH ${channelNumStr}`;
    }

    // 更新 RND 按钮样式状态
    const rndBtn = document.getElementById('btn-rnd');
    if (rndBtn) {
        rndBtn.classList.toggle('active', isRndEnabled);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // CH+ 按钮：顺序加一
    const chUpBtn = document.getElementById('btn-ch-up');
    if (chUpBtn) {
        chUpBtn.addEventListener('click', () => changeChannel('next'));
    }

    // CH- 按钮：顺序减一
    const chDownBtn = document.getElementById('btn-ch-down');
    if (chDownBtn) {
        chDownBtn.addEventListener('click', () => changeChannel('prev'));
    }

    // RND 按钮：切换模式开关
    const rndBtn = document.getElementById('btn-rnd');
    if (rndBtn) {
        rndBtn.addEventListener('click', () => {
            isRndEnabled = !isRndEnabled;
            updateUI();
            console.log(`[RND Mode] ${isRndEnabled ? '启用' : '禁用'}`);
        });
    }
});
