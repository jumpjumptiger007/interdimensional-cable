// InterDemTV: a small, static YouTube channel receiver.
let videoList = ["dQw4w9WgXcQ", "L_LUpnjgPso", "9bZkp7q19f0", "w4m6N7Zk-yM", "fC7oUOUEEi4"];
let player, currentChannelIndex = 0, isPowerOn = false, isMuted = false, isRandom = true, isFilterOn = true;
let apiReady = false, listReady = false, playerRequested = false, osdTimer, transitionTimer, channelLoadTimer, powerTimer, scopeAcquisitionTimer, pendingRandomStartId, audioCtx;
const STORAGE_KEY = "retro-signal-tv-state-v1";
const CHANNEL_TRANSITION_MS = 300;
const CHANNEL_LOAD_DELAY_MS = 135;
const POWER_ON_MS = 440;
const invalidVideoIds = new Set();
const videoPlaybackTimes = {}, hasRandomSeeked = {};
const screen = document.getElementById("tvScreen"), signalModule = document.getElementById("signalModule");
const scopeWave = document.getElementById("scopeWave");
const WAVEFORM_PRESETS = [
  "M0 30 C7 17 14 17 21 30 S35 43 42 30 S56 17 63 30 S77 43 84 30 S95 20 100 30",
  "M0 30 C3 22 6 22 9 30 S15 38 18 30 S24 22 27 30 S33 38 36 30 S42 22 45 30 S51 38 54 30 S60 22 63 30 S69 38 72 30 S78 22 81 30 S87 38 90 30 S96 22 100 30",
  "M0 32 C6 31 8 16 14 21 S20 39 26 32 S33 25 39 29 S45 42 51 31 S58 12 64 24 S71 38 77 29 S85 23 91 32 S97 35 100 29",
  "M0 30 C12 30 14 18 27 18 S40 42 52 42 S65 19 78 19 S91 32 100 30"
];

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return;
    isMuted = Boolean(saved.muted);
    isRandom = saved.random !== false;
    if (Number.isFinite(saved.volume)) window.savedVolume = Math.max(0, Math.min(100, saved.volume));
    if (typeof saved.channelId === "string") window.savedChannelId = saved.channelId;
  } catch (_) { /* Invalid local state must not stop the receiver. */ }
}
function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      muted: isMuted,
      random: isRandom,
      volume: window.savedVolume ?? player?.getVolume?.() ?? 70,
      channelId: videoList[currentChannelIndex]
    }));
  } catch (_) { /* Storage may be unavailable in private browsing. */ }
}
async function loadVideoList() {
  try {
    const response = await fetch("videos.json?t=" + Date.now());
    if (!response.ok) throw new Error("Unable to load channel list");
    const data = await response.json();
    if (Array.isArray(data)) {
      const canonicalChannels = data.filter(id => typeof id === "string");
      if (canonicalChannels.length) videoList = canonicalChannels;
    }
  } catch (error) {
    console.warn("Using bundled fallback channels.", error);
    videoList = [...videoList];
  } finally {
    const remembered = videoList.indexOf(window.savedChannelId);
    currentChannelIndex = remembered >= 0 ? remembered : 0;
    syncChannelRail();
    listReady = true;
    tryInitPlayer();
  }
}
function channelLabel() { return "CH " + String(currentChannelIndex + 1).padStart(3, "0"); }
function syncChannelRail() {
  const label = channelLabel();
  const rail = document.getElementById("railChannel");
  if (rail) rail.textContent = label;
  updateWaveformPreset();
}
function updateWaveformPreset() {
  if (scopeWave) scopeWave.setAttribute("d", WAVEFORM_PRESETS[currentChannelIndex % WAVEFORM_PRESETS.length]);
}
function beginScopeAcquisition() {
  if (!signalModule) return;
  clearTimeout(scopeAcquisitionTimer);
  updateWaveformPreset();
  signalModule.dataset.acquiring = "true";
  const status = document.getElementById("scopeStatus");
  if (status) status.textContent = "SEEK";
  scopeAcquisitionTimer = setTimeout(() => {
    delete signalModule.dataset.acquiring;
    if (document.body.dataset.signal === "locked" && status) status.textContent = "LOCKED";
  }, 480);
}
function clearScopeAcquisition() {
  clearTimeout(scopeAcquisitionTimer);
  scopeAcquisitionTimer = null;
  if (signalModule) delete signalModule.dataset.acquiring;
}
function showChannelOSD(message) {
  const osd = document.getElementById("channelDisplay");
  if (!osd || !isPowerOn) return;
  osd.textContent = message || channelLabel() + (isRandom ? " · RND" : "");
  osd.classList.add("show");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => osd.classList.remove("show"), message ? 2600 : 1900);
}
function setSignalState(state) {
  if (signalModule) signalModule.dataset.signal = state;
  if (screen) screen.dataset.signal = state;
  const scopeStatus = document.getElementById("scopeStatus");
  const railStatus = document.getElementById("railSignalStatus");
  const statusText = { locked: "LOCKED", seeking: "SEEK", lost: "LOST", "no-signal": "NO SIGNAL", off: "STANDBY" }[state] || "STANDBY";
  if (scopeStatus && !(state === "locked" && signalModule?.dataset.acquiring === "true")) scopeStatus.textContent = statusText;
  if (railStatus) railStatus.textContent = statusText;
  document.body.dataset.signal = state;
}
function playClick(kind = "channel") {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = kind === "power" ? 84 : 170;
    gain.gain.setValueAtTime(kind === "channel" ? .025 : .04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .045);
    oscillator.connect(gain).connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + .05);
  } catch (_) { /* Audio feedback is optional. */ }
}
function buzz() { try { navigator.vibrate?.(8); } catch (_) { /* Haptics are optional. */ } }
function requestPlayer() {
  if (playerRequested) return;
  playerRequested = true;
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.append(script);
}
function onYouTubeIframeAPIReady() { apiReady = true; tryInitPlayer(); }
function tryInitPlayer() {
  if (!isPowerOn || !apiReady || !listReady || player || !videoList.length) return;
  const index = findNextPlayableIndex(0, currentChannelIndex);
  if (index === null) return showNoSignal();
  currentChannelIndex = index;
  syncChannelRail();
  const playerVars = { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, cc_load_policy: 0, iv_load_policy: 3, fs: 0 };
  if (location.protocol.startsWith("http")) playerVars.origin = location.origin;
  player = new YT.Player("player", {
    videoId: videoList[currentChannelIndex],
    playerVars,
    events: { onStateChange: onPlayerStateChange, onError: onPlayerError, onReady: onPlayerReady }
  });
}
function loadChannelVideo(id, saved) {
  if (!player || !id) return;
  if (saved === undefined && isRandom) {
    pendingRandomStartId = id;
    player.cueVideoById?.({ videoId: id, startSeconds: 0 });
    return;
  }
  pendingRandomStartId = null;
  hasRandomSeeked[id] = true;
  videoPlaybackTimes[id] = saved === undefined ? 0 : saved;
  player.loadVideoById?.({ videoId: id, startSeconds: Math.floor(videoPlaybackTimes[id]) });
}
function onPlayerReady() {
  if (!player) return;
  player.setVolume(window.savedVolume ?? 70);
  syncVolumeUI(window.savedVolume ?? 70);
  if (isMuted) player.mute();
  loadChannelVideo(videoList[currentChannelIndex], videoPlaybackTimes[videoList[currentChannelIndex]]);
}
function onPlayerStateChange(event) {
  const id = videoList[currentChannelIndex];
  const activePlayerId = player?.getVideoData?.().video_id;
  if (event.data === YT.PlayerState.CUED && isPowerOn && id && pendingRandomStartId === id && (!activePlayerId || activePlayerId === id)) {
    const duration = player.getDuration?.() || 0;
    const start = duration > 300 ? Math.floor(Math.random() * Math.max(0, duration - 60)) : 0;
    pendingRandomStartId = null;
    hasRandomSeeked[id] = true;
    videoPlaybackTimes[id] = start;
    player.loadVideoById?.({ videoId: id, startSeconds: start });
  }
  if (event.data === YT.PlayerState.PLAYING && isPowerOn && id && (!activePlayerId || activePlayerId === id)) {
    endTransition();
    setSignalState("locked");
  }
  const endedState = window.YT?.PlayerState?.ENDED ?? 0;
  if (event.data === endedState && isPowerOn && id && (!activePlayerId || activePlayerId === id)) {
    delete videoPlaybackTimes[id];
    delete hasRandomSeeked[id];
    changeChannel(1, true);
  }
}
function onPlayerError() {
  const failed = videoList[currentChannelIndex];
  if (!failed || !isPowerOn) return;
  invalidVideoIds.add(failed);
  startTransition("signal-lost");
  showChannelOSD("SIGNAL LOST");
  setTimeout(() => changeChannel(1, true), 180);
}
function isPlayable(id) { return Boolean(id && !invalidVideoIds.has(id)); }
function findNextPlayableIndex(direction, start = currentChannelIndex) {
  if (!videoList.length) return null;
  const step = direction === 0 ? 1 : Math.sign(direction);
  for (let attempt = direction === 0 ? 0 : 1; attempt <= videoList.length; attempt++) {
    const index = (start + step * attempt + videoList.length) % videoList.length;
    if (isPlayable(videoList[index])) return index;
  }
  return null;
}
function chooseRandomPlayableIndex() {
  const candidates = [];
  for (let index = 0; index < videoList.length; index++) {
    if (index !== currentChannelIndex && isPlayable(videoList[index])) candidates.push(index);
  }
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  return isPlayable(videoList[currentChannelIndex]) ? currentChannelIndex : null;
}
function saveCurrentPlaybackPosition() {
  const id = videoList[currentChannelIndex];
  if (player?.getCurrentTime && player?.getPlayerState?.() !== -1 && id) videoPlaybackTimes[id] = player.getCurrentTime() || 0;
}
function startTransition(kind) {
  if (!screen) return;
  clearTimeout(transitionTimer);
  transitionTimer = null;
  screen.classList.remove("transitioning");
  void screen.offsetWidth;
  if (kind === "signal-lost") {
    clearScopeAcquisition();
    setSignalState("lost");
    return;
  }
  screen.classList.add("transitioning");
  setSignalState("seeking");
  beginScopeAcquisition();
  transitionTimer = setTimeout(endTransition, CHANNEL_TRANSITION_MS);
}
function endTransition() {
  clearTimeout(transitionTimer);
  transitionTimer = null;
  screen?.classList.remove("transitioning");
  if (isPowerOn && !screen?.classList.contains("no-signal") && player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) setSignalState("locked");
}
function changeChannel(direction, fromFailure = false) {
  if (!isPowerOn || !videoList.length) return;
  if (!fromFailure) saveCurrentPlaybackPosition();
  const next = isRandom ? chooseRandomPlayableIndex() : findNextPlayableIndex(direction);
  if (next === null) return showNoSignal();
  currentChannelIndex = next;
  syncChannelRail();
  persistState();
  playClick();
  startTransition();
  showChannelOSD();
  const id = videoList[currentChannelIndex], saved = videoPlaybackTimes[id];
  clearTimeout(channelLoadTimer);
  channelLoadTimer = setTimeout(() => {
    channelLoadTimer = null;
    loadChannelVideo(id, saved);
  }, CHANNEL_LOAD_DELAY_MS);
}
function showNoSignal() {
  clearTimeout(channelLoadTimer);
  channelLoadTimer = null;
  endTransition();
  clearScopeAcquisition();
  showChannelOSD("NO SIGNAL");
  screen?.classList.add("no-signal");
  setSignalState("no-signal");
  player?.stopVideo?.();
}
function syncPowerUI() {
  screen?.classList.toggle("powered-on", isPowerOn);
  document.getElementById("railSignalLed")?.classList.toggle("on", isPowerOn);
  const powerState = document.getElementById("powerState");
  if (powerState) powerState.textContent = isPowerOn ? "ON" : "OFF";
  const button = document.getElementById("btnPower");
  button?.setAttribute("aria-pressed", String(isPowerOn));
  if (!isPowerOn) clearScopeAcquisition();
  setSignalState(isPowerOn ? "seeking" : "off");
}
function togglePower() {
  isPowerOn = !isPowerOn;
  clearTimeout(powerTimer);
  powerTimer = null;
  playClick("power");
  buzz();
  syncPowerUI();
  if (isPowerOn) {
    screen?.classList.remove("powering-off");
    screen?.classList.remove("no-signal");
    screen?.classList.add("powering-on");
    beginScopeAcquisition();
    requestPlayer();
    showChannelOSD();
    powerTimer = setTimeout(() => {
      powerTimer = null;
      screen?.classList.remove("powering-on");
      tryInitPlayer();
      if (player && !pendingRandomStartId) player.playVideo?.();
    }, POWER_ON_MS);
    return;
  }
  saveCurrentPlaybackPosition();
  persistState();
  clearTimeout(transitionTimer);
  transitionTimer = null;
  clearTimeout(channelLoadTimer);
  channelLoadTimer = null;
  pendingRandomStartId = null;
  screen?.classList.remove("transitioning");
  screen?.classList.remove("powering-on");
  screen?.classList.add("powering-off");
  setSignalState("off");
  player?.pauseVideo?.();
  powerTimer = setTimeout(() => {
    powerTimer = null;
    screen?.classList.remove("powering-off");
  }, 380);
}
function syncMuteUI() {
  const button = document.getElementById("btnMute");
  button?.setAttribute("aria-pressed", String(isMuted));
  const muteState = document.getElementById("muteState");
  if (muteState) muteState.textContent = isMuted ? "ON" : "OFF";
}
function toggleMute() {
  if (!player || !isPowerOn) return;
  isMuted = !isMuted;
  isMuted ? player.mute?.() : player.unMute?.();
  syncMuteUI();
  syncVolumeUI();
  persistState();
}
function syncRandomUI() {
  const button = document.getElementById("btnRandom");
  if (!button) return;
  const mode = isRandom ? "RND" : "SEQ";
  document.getElementById("randomState").textContent = mode;
  button.setAttribute("aria-label", isRandom ? "Random channel navigation" : "Sequential channel navigation");
  button.setAttribute("aria-pressed", String(isRandom));
}
function syncFilterUI() {
  screen?.classList.toggle("filters-on", isFilterOn);
  screen?.classList.toggle("filters-off", !isFilterOn);
  const button = document.getElementById("btnFilter");
  if (!button) return;
  document.getElementById("filterState").textContent = isFilterOn ? "ON" : "OFF";
  button.setAttribute("aria-pressed", String(isFilterOn));
}
function toggleFilter() { isFilterOn = !isFilterOn; syncFilterUI(); }
function syncVolumeUI(value = player?.getVolume?.() ?? window.savedVolume ?? 70) {
  const volume = isMuted ? 0 : Math.round(value);
  const label = document.getElementById("volumeText");
  const level = document.getElementById("volumeLevel");
  if (label) label.textContent = isMuted ? "00" : String(volume);
  if (level) level.style.width = `${volume}%`;
}
function changeVolume(delta) {
  if (!player || !isPowerOn || typeof player.getVolume !== "function" || typeof player.setVolume !== "function") return;
  const volume = Math.max(0, Math.min(100, player.getVolume() + delta));
  player.setVolume(volume);
  window.savedVolume = volume;
  if (delta > 0 && isMuted) { isMuted = false; player.unMute?.(); syncMuteUI(); }
  syncVolumeUI(volume);
  persistState();
}
function setPressedFeedback(button) {
  button?.classList.add("is-pressed");
  setTimeout(() => button?.classList.remove("is-pressed"), 105);
  buzz();
}
function toggleFullscreen() {
  const environment = document.getElementById("receiverEnvironment");
  if (!document.fullscreenEnabled || !environment) return;
  document.fullscreenElement ? document.exitFullscreen() : environment.requestFullscreen?.();
}
function syncFullscreenControl() {
  const button = document.getElementById("btnFullscreen");
  button?.toggleAttribute("disabled", !document.fullscreenEnabled);
  button?.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement)));
}
let helpTrigger;
function openHelp(event) {
  const dialog = document.getElementById("helpModal");
  if (!dialog || dialog.open) return;
  helpTrigger = event?.currentTarget || document.activeElement;
  dialog.showModal();
  document.getElementById("btnHelpClose")?.focus();
}
function closeHelp() {
  const dialog = document.getElementById("helpModal");
  if (dialog?.open) dialog.close();
}
function restoreHelpFocus() {
  if (helpTrigger instanceof HTMLElement && helpTrigger.isConnected) helpTrigger.focus();
  helpTrigger = null;
}
function isEditable(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
}
function initRemoteEvents() {
  readStoredState();
  syncPowerUI();
  syncMuteUI();
  syncRandomUI();
  syncFilterUI();
  syncFullscreenControl();
  syncVolumeUI();
  const bind = (id, handler) => document.getElementById(id)?.addEventListener("click", event => {
    setPressedFeedback(event.currentTarget);
    handler(event);
  });
  bind("btnPower", togglePower);
  bind("btnChannelNext", () => changeChannel(1));
  bind("btnChannelPrev", () => changeChannel(-1));
  bind("btnVolUp", () => changeVolume(10));
  bind("btnVolDown", () => changeVolume(-10));
  bind("btnMute", toggleMute);
  bind("btnRandom", () => { isRandom = !isRandom; syncRandomUI(); persistState(); if (isPowerOn) showChannelOSD(); });
  bind("btnFilter", toggleFilter);
  bind("btnFullscreen", toggleFullscreen);
  bind("btnHelp", openHelp);
  bind("btnHelpRemote", openHelp);
  document.getElementById("btnHelpClose")?.addEventListener("click", closeHelp);
  document.getElementById("helpModal")?.addEventListener("close", restoreHelpFocus);
  document.addEventListener("fullscreenchange", syncFullscreenControl);
  document.addEventListener("keydown", event => {
    if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const dialog = document.getElementById("helpModal");
    if (dialog?.open) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const controls = {
      ArrowUp: ["btnChannelNext", () => changeChannel(1)],
      ArrowDown: ["btnChannelPrev", () => changeChannel(-1)],
      ArrowLeft: ["btnVolDown", () => changeVolume(-10)],
      ArrowRight: ["btnVolUp", () => changeVolume(10)],
      " ": ["btnPower", togglePower],
      m: ["btnMute", toggleMute],
      f: ["btnFullscreen", toggleFullscreen],
      t: ["btnFilter", toggleFilter],
      "?": ["btnHelp", () => openHelp()]
    };
    const entry = controls[key];
    if (!entry) return;
    event.preventDefault();
    setPressedFeedback(document.getElementById(entry[0]));
    entry[1]();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js?version=41").catch(() => {});
  loadVideoList();
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initRemoteEvents) : initRemoteEvents();
