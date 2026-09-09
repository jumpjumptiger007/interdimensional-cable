// Retro Signal TV: a small, static YouTube channel receiver.
let videoList = ["dQw4w9WgXcQ", "L_LUpnjgPso", "9bZkp7q19f0", "w4m6N7Zk-yM", "fC7oUOUEEi4"];
let player, currentChannelIndex = 0, isPowerOn = false, isMuted = false, isRandom = true, isFilterOn = true;
let apiReady = false, listReady = false, playerRequested = false, osdTimer, noiseInterval, audioCtx;
const STORAGE_KEY = "retro-signal-tv-state-v1", MAX_CHANNEL_ATTEMPTS = 120;
const invalidVideoIds = new Set(), blockedVideoIds = new Set(), favoriteVideoIds = new Set();
const videoPlaybackTimes = {}, hasRandomSeeked = {};
const canvas = document.getElementById("noiseCanvas"), ctx = canvas?.getContext("2d");

function readStoredState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (!saved || typeof saved !== "object") return;
    isMuted = Boolean(saved.muted); isRandom = saved.random !== false;
    if (Number.isFinite(saved.volume)) window.savedVolume = Math.max(0, Math.min(100, saved.volume));
    if (typeof saved.channelId === "string") window.savedChannelId = saved.channelId;
    if (Array.isArray(saved.blocked)) saved.blocked.forEach(id => typeof id === "string" && blockedVideoIds.add(id));
    if (Array.isArray(saved.favorites)) saved.favorites.forEach(id => typeof id === "string" && favoriteVideoIds.add(id));
    if (["black", "signal-room"].includes(saved.ambience)) setAmbience(saved.ambience, false);
    else if (saved.ambience === "blackout") setAmbience("black", false);
    else if (["dark", "warm", "basement"].includes(saved.ambience)) setAmbience("signal-room", false);
  } catch (_) { /* Invalid local state must not stop the receiver. */ }
}
function persistState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: isMuted, random: isRandom, volume: player?.getVolume?.() ?? window.savedVolume ?? 70, channelId: videoList[currentChannelIndex], blocked: [...blockedVideoIds], favorites: [...favoriteVideoIds], ambience: document.body.dataset.ambience || "signal-room" })); } catch (_) {}
}
function shuffleArray(items) { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }
async function loadVideoList() {
  try { const response = await fetch(`videos.json?t=${Date.now()}`); if (!response.ok) throw new Error("Unable to load channel list"); const data = await response.json(); if (Array.isArray(data) && data.length) videoList = shuffleArray(data.filter(id => typeof id === "string")); }
  catch (error) { console.warn("Using bundled fallback channels.", error); videoList = shuffleArray([...videoList]); }
  finally { const remembered = videoList.indexOf(window.savedChannelId); currentChannelIndex = remembered >= 0 ? remembered : 0; listReady = true; tryInitPlayer(); }
}
function showChannelOSD(message) { const osd = document.getElementById("channelDisplay"); if (!osd || !isPowerOn) return; const number = String(currentChannelIndex + 1).padStart(2, "0"); osd.textContent = message || (isRandom ? `CH ${number} · RND` : `CH ${number}`); osd.classList.add("show"); clearTimeout(osdTimer); osdTimer = setTimeout(() => osd.classList.remove("show"), message ? 2600 : 1900); }
function playClick(kind = "channel") { try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain(); oscillator.type = "square"; oscillator.frequency.value = kind === "power" ? 84 : 170; gain.gain.setValueAtTime(kind === "channel" ? .025 : .04, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .045); oscillator.connect(gain).connect(audioCtx.destination); oscillator.start(); oscillator.stop(audioCtx.currentTime + .05); } catch (_) {} }
function buzz() { try { navigator.vibrate?.(8); } catch (_) {} }
function generateNoise() { if (!canvas || !ctx || !isPowerOn || document.hidden) return; const width = Math.max(1, Math.floor(canvas.clientWidth / 2)), height = Math.max(1, Math.floor(canvas.clientHeight / 2)); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; } const image = ctx.createImageData(width, height), pixels = new Uint32Array(image.data.buffer); for (let i = 0; i < pixels.length; i++) { const n = Math.floor(Math.random() * 255); pixels[i] = (255 << 24) | (n << 16) | (n << 8) | n; } ctx.putImageData(image, 0, 0); }
function startNoise() { if (!canvas) return; canvas.classList.add("active"); generateNoise(); if (!noiseInterval) noiseInterval = setInterval(generateNoise, 45); }
function stopNoise() { canvas?.classList.remove("active"); if (noiseInterval) { clearInterval(noiseInterval); noiseInterval = null; } }
function requestPlayer() { if (playerRequested) return; playerRequested = true; const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.async = true; document.head.append(script); }
function onYouTubeIframeAPIReady() { apiReady = true; tryInitPlayer(); }
function tryInitPlayer() {
  if (!isPowerOn || !apiReady || !listReady || player || !videoList.length) return;
  const index = findNextPlayableIndex(0, currentChannelIndex); if (index === null) return showNoSignal(); currentChannelIndex = index;
  // Keep the supported native player presentation minimal; required YouTube UI remains available.
  const playerVars = { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, cc_load_policy: 0 }; if (location.protocol.startsWith("http")) playerVars.origin = location.origin;
  player = new YT.Player("player", { videoId: videoList[currentChannelIndex], playerVars, events: { onStateChange: onPlayerStateChange, onError: onPlayerError, onReady: onPlayerReady } });
}
function onPlayerReady() { if (!player) return; player.setVolume(window.savedVolume ?? 70); if (isMuted) player.mute(); player.playVideo(); }
function onPlayerStateChange(event) {
  const id = videoList[currentChannelIndex];
  if (event.data === YT.PlayerState.PLAYING && isPowerOn && id && videoPlaybackTimes[id] === undefined && !hasRandomSeeked[id]) {
    const seek = () => { if (!player || !isPowerOn || id !== videoList[currentChannelIndex]) return; const duration = player.getDuration?.() || 0; if (!duration) return setTimeout(seek, 120); hasRandomSeeked[id] = true; if (isRandom && duration > 300) { const start = Math.floor(Math.random() * Math.max(0, duration - 60)); player.seekTo(start, true); videoPlaybackTimes[id] = start; } else videoPlaybackTimes[id] = 0; }; seek();
  }
  const endedState = window.YT?.PlayerState?.ENDED ?? 0;
  const activePlayerId = player?.getVideoData?.().video_id;
  if (event.data === endedState && isPowerOn && id && (!activePlayerId || activePlayerId === id)) {
    delete videoPlaybackTimes[id];
    delete hasRandomSeeked[id];
    // Skip saving a completed video at its final timestamp, then advance safely.
    changeChannel(1, true);
  }
}
function onPlayerError() { const failed = videoList[currentChannelIndex]; if (!failed || !isPowerOn) return; invalidVideoIds.add(failed); startTransition("signal-lost"); showChannelOSD("SIGNAL LOST"); setTimeout(() => changeChannel(1, true), 180); }
function isPlayable(id) { return id && !invalidVideoIds.has(id) && !blockedVideoIds.has(id); }
function findNextPlayableIndex(direction, start = currentChannelIndex) { if (!videoList.length) return null; const step = direction === 0 ? 1 : Math.sign(direction), attempts = Math.min(videoList.length, MAX_CHANNEL_ATTEMPTS); for (let attempt = direction === 0 ? 0 : 1; attempt <= attempts; attempt++) { const index = (start + step * attempt + videoList.length) % videoList.length; if (isPlayable(videoList[index])) return index; } return null; }
function saveCurrentPlaybackPosition() { const id = videoList[currentChannelIndex]; if (player?.getCurrentTime && player?.getPlayerState?.() !== -1 && id) videoPlaybackTimes[id] = player.getCurrentTime() || 0; }
function startTransition(kind) { const screen = document.getElementById("tvScreen"); if (!screen) return; const variants = ["static", "sync-tear", "vertical-roll", "flash", "rgb-split", "black-snap"]; screen.dataset.transition = kind || variants[Math.floor(Math.random() * variants.length)]; screen.classList.add("transitioning"); startNoise(); }
function endTransition() { const screen = document.getElementById("tvScreen"); screen?.classList.remove("transitioning"); if (screen) delete screen.dataset.transition; stopNoise(); }
function changeChannel(direction, fromFailure = false) { if (!isPowerOn || !videoList.length) return; if (!fromFailure) saveCurrentPlaybackPosition(); const next = findNextPlayableIndex(direction); if (next === null) return showNoSignal(); currentChannelIndex = next; persistState(); playClick(); startTransition(); showChannelOSD(); syncFavoriteUI(); const id = videoList[currentChannelIndex], saved = videoPlaybackTimes[id]; setTimeout(() => { player?.loadVideoById?.({ videoId: id, startSeconds: saved === undefined ? 0 : Math.floor(saved) }); setTimeout(endTransition, 180); }, 210); }
function showNoSignal() { endTransition(); startNoise(); showChannelOSD("NO SIGNAL"); document.getElementById("tvScreen")?.classList.add("no-signal"); player?.stopVideo?.(); }
function syncPowerUI() { document.getElementById("tvScreen")?.classList.toggle("powered-on", isPowerOn); document.getElementById("tvSet")?.classList.toggle("powered-on", isPowerOn); document.getElementById("powerLed")?.classList.toggle("on", isPowerOn); document.getElementById("btnPower")?.classList.toggle("active", isPowerOn); document.getElementById("btnPower")?.setAttribute("aria-pressed", String(isPowerOn)); }
function togglePower() { isPowerOn = !isPowerOn; playClick("power"); buzz(); syncPowerUI(); const screen = document.getElementById("tvScreen"); if (isPowerOn) { screen?.classList.remove("no-signal"); screen?.classList.add("powering-on"); requestPlayer(); startNoise(); showChannelOSD(); setTimeout(() => { screen?.classList.remove("powering-on"); tryInitPlayer(); player?.playVideo?.(); endTransition(); }, 520); } else { saveCurrentPlaybackPosition(); persistState(); screen?.classList.add("powering-off"); player?.pauseVideo?.(); setTimeout(() => { stopNoise(); screen?.classList.remove("powering-off"); syncPowerUI(); }, 380); } }
function syncMuteUI() { const button = document.getElementById("btnMute"); button?.classList.toggle("active", isMuted); button?.setAttribute("aria-pressed", String(isMuted)); }
function syncRandomUI() { const button = document.getElementById("btnRandom"); if (!button) return; button.classList.toggle("active", isRandom); button.setAttribute("aria-pressed", String(isRandom)); button.textContent = isRandom ? "RND" : "SEQ"; }
function syncFilterUI() { document.getElementById("tvScreen")?.classList.toggle("filters-off", !isFilterOn); const button = document.getElementById("btnFilter"); button?.classList.toggle("active", isFilterOn); button?.setAttribute("aria-pressed", String(isFilterOn)); }
function toggleFilter() { isFilterOn = !isFilterOn; syncFilterUI(); }
function syncFavoriteUI() { const button = document.getElementById("btnFavorite"), active = favoriteVideoIds.has(videoList[currentChannelIndex]); button?.classList.toggle("active", active); button?.setAttribute("aria-pressed", String(active)); }
function changeVolume(delta) { if (!player || !isPowerOn) return; player.setVolume(Math.max(0, Math.min(100, player.getVolume() + delta))); if (delta > 0 && isMuted) { isMuted = false; player.unMute?.(); syncMuteUI(); } persistState(); }
function setPressedFeedback(button) { button?.classList.add("is-pressed"); setTimeout(() => button?.classList.remove("is-pressed"), 105); buzz(); }
function toggleFavorite() { const id = videoList[currentChannelIndex]; if (!id) return; favoriteVideoIds.has(id) ? favoriteVideoIds.delete(id) : favoriteVideoIds.add(id); syncFavoriteUI(); persistState(); }
function blockCurrentVideo() { const id = videoList[currentChannelIndex]; if (!id) return; blockedVideoIds.add(id); favoriteVideoIds.delete(id); persistState(); syncFavoriteUI(); changeChannel(1, true); }
function toggleFullscreen() { const room = document.querySelector(".room"); if (!document.fullscreenEnabled || !room) return; document.fullscreenElement ? document.exitFullscreen() : room.requestFullscreen?.(); }
function syncFullscreenControl() { const button = document.getElementById("btnFullscreen"); button?.toggleAttribute("disabled", !document.fullscreenEnabled); button?.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement))); }
function setAmbience(value, save = true) { document.body.dataset.ambience = value; const button = document.getElementById("btnRoom"); if (button) button.textContent = value === "black" ? "ROOM: BLACK" : "ROOM: SIGNAL ROOM"; if (save) persistState(); }
function cycleAmbience() { setAmbience(document.body.dataset.ambience === "black" ? "signal-room" : "black"); }
function openHelp() { const modal = document.getElementById("helpModal"); if (!modal) return; modal.hidden = false; document.getElementById("btnHelpClose")?.focus(); }
function closeHelp() { document.getElementById("helpModal")?.setAttribute("hidden", ""); document.getElementById("btnHelp")?.focus(); }
function isEditable(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable; }
function initRemoteEvents() {
  readStoredState(); syncPowerUI(); syncMuteUI(); syncRandomUI(); syncFilterUI(); syncFavoriteUI(); syncFullscreenControl();
  const bind = (id, handler) => document.getElementById(id)?.addEventListener("click", event => { setPressedFeedback(event.currentTarget); handler(); });
  bind("btnPower", togglePower); bind("btnChannelNext", () => changeChannel(1)); bind("btnChannelPrev", () => changeChannel(-1)); bind("btnVolUp", () => changeVolume(10)); bind("btnVolDown", () => changeVolume(-10));
  bind("btnMute", () => { if (!player || !isPowerOn) return; isMuted = !isMuted; isMuted ? player.mute?.() : player.unMute?.(); syncMuteUI(); persistState(); }); bind("btnRandom", () => { isRandom = !isRandom; syncRandomUI(); persistState(); if (isPowerOn) showChannelOSD(); }); bind("btnFilter", toggleFilter); bind("btnFullscreen", toggleFullscreen); bind("btnFavorite", toggleFavorite); bind("btnSkip", blockCurrentVideo); bind("btnRoom", cycleAmbience); bind("btnHelp", openHelp); document.getElementById("btnHelpClose")?.addEventListener("click", closeHelp);
  document.getElementById("helpModal")?.addEventListener("click", event => { if (event.target.id === "helpModal") closeHelp(); }); document.addEventListener("fullscreenchange", syncFullscreenControl); document.addEventListener("visibilitychange", () => { if (document.hidden) stopNoise(); });
  document.addEventListener("keydown", event => { if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return; if (event.key === "Escape") return closeHelp(); const controls = { ArrowUp: ["btnChannelNext", () => changeChannel(1)], ArrowDown: ["btnChannelPrev", () => changeChannel(-1)], ArrowLeft: ["btnVolDown", () => changeVolume(-10)], ArrowRight: ["btnVolUp", () => changeVolume(10)], " ": ["btnPower", togglePower], m: ["btnMute", () => document.getElementById("btnMute")?.click()], f: ["btnFullscreen", toggleFullscreen], t: ["btnFilter", toggleFilter], "?": ["btnHelp", openHelp] }; const entry = controls[event.key.toLowerCase()] || controls[event.key]; if (!entry) return; event.preventDefault(); setPressedFeedback(document.getElementById(entry[0])); entry[1](); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js?version=8").catch(() => {}); loadVideoList();
}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initRemoteEvents) : initRemoteEvents();
