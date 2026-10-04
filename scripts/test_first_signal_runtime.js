const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function element() {
  const classes = new Set();
  return {
    dataset: {}, style: {}, textContent: "", attributes: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        enabled ? classes.add(name) : classes.delete(name);
        return enabled;
      }
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    toggleAttribute(name, force) { this.setAttribute(name, String(force)); },
    append() {},
    offsetWidth: 1
  };
}

function appHarness() {
  const elements = new Map();
  const timers = new Map();
  const storage = new Map();
  let timerId = 0;
  const document = {
    readyState: "loading",
    body: element(),
    head: element(),
    addEventListener() {},
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  const context = vm.createContext({
    console, document, YT,
    window: { YT },
    location: { protocol: "http:", origin: "http://localhost" },
    navigator: { vibrate() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval() {},
    Math: Object.create(Math)
  });
  vm.runInContext(source, context, { filename: "app.js" });
  return {
    context, timers, storage,
    run(code) { return vm.runInContext(code, context); },
    element(id) { return document.getElementById(id); },
    runTimer(delay) {
      const timer = [...timers.values()].find(entry => entry.delay === delay);
      assert.ok(timer, `expected a ${delay}ms timer`);
      timer.callback();
    }
  };
}

function installPlayer(app, ids = ["AAAAAAAAAAA", "BBBBBBBBBBB"]) {
  const calls = [];
  app.context.__calls = calls;
  app.context.__playerVideoId = ids[0];
  app.run(`player = {
    loadVideoById(value) { __calls.push(["load", value]); __playerVideoId = value.videoId; },
    cueVideoById(value) { __calls.push(["cue", value]); __playerVideoId = value.videoId; },
    getVideoData() { return { video_id: __playerVideoId }; },
    getPlayerState() { return 1; }, getDuration() { return 600; }, setVolume() {},
    playVideo() { __calls.push(["play"]); }, pauseVideo() {}, stopVideo() {}
  };`);
  app.run(`videoList = ${JSON.stringify(ids)}; listReady = true; apiReady = true;`);
  return calls;
}

test("missing or empty pool falls back to normal catalog playback", () => {
  const app = appHarness();
  const calls = installPlayer(app, ["AAAAAAAAAAA"]);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = []; isRandom = true; loadChannelVideo(videoList[0]);");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["cue", { videoId: "AAAAAAAAAAA", startSeconds: 0 }]);
  assert.equal(app.run("pendingRandomStartId"), "AAAAAAAAAAA");
  app.run("onPlayerStateChange({data: YT.PlayerState.PLAYING});");
  assert.equal(app.run("firstUsePending"), false);
  assert.equal(JSON.parse(app.storage.get("retro-signal-tv-state-v1")).firstSignalComplete, true);
});

test("power cycle retries the same active candidate at 0:00", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA','BBBBBBBBBBB']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; togglePower(); togglePower();");
  app.runTimer(440);
  assert.equal(app.run("isPowerOn"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["load", { videoId: "AAAAAAAAAAA", startSeconds: 0 }]);
  assert.equal(app.run("firstSignalTried.size"), 1);
});

test("first curated candidate starts at 0:00 and success returns navigation to the catalog", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA']; curatedBootstrapAvailable = true; onPlayerReady();");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["load", { videoId: "AAAAAAAAAAA", startSeconds: 0 }]);
  app.run("onPlayerStateChange({data: YT.PlayerState.PLAYING}); changeChannel(1);");
  assert.equal(app.run("firstUsePending"), false);
  assert.equal(app.run("currentChannelIndex"), 1);
  assert.equal(app.run("firstSignalPool.length"), 1);
});

test("a real error clears autoplay-block state and tries an unused candidate", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA','BBBBBBBBBBB']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; autoplayBlocked = true; onPlayerError();");
  assert.equal(app.run("autoplayBlocked"), false);
  assert.equal(app.run("invalidVideoIds.has('AAAAAAAAAAA')"), true);
  assert.equal(app.run("activeFirstSignal"), "BBBBBBBBBBB");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["load", { videoId: "BBBBBBBBBBB", startSeconds: 0 }]);
});

test("channel input preserves the active candidate; only a real error advances", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA','BBBBBBBBBBB']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; changeChannel(1); loadChannelVideo(videoList[1]);");
  assert.equal(app.run("activeFirstSignal"), "AAAAAAAAAAA");
  assert.equal(app.run("firstSignalTried.size"), 1);
  assert.equal(calls.length, 0);
  app.run("onPlayerError();");
  assert.equal(app.run("activeFirstSignal"), "BBBBBBBBBBB");
  assert.equal(app.run("firstSignalTried.size"), 2);
  assert.equal(calls.length, 1);
});

test("only the currently attempted curated video can complete first use", () => {
  const app = appHarness();
  installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; player.getVideoData = () => ({video_id:'BBBBBBBBBBB'}); onPlayerStateChange({data: YT.PlayerState.PLAYING});");
  assert.equal(app.run("firstUsePending"), true);
  assert.equal(app.storage.has("retro-signal-tv-state-v1"), false);
  app.run("player.getVideoData = () => ({video_id:'AAAAAAAAAAA'}); onPlayerStateChange({data: YT.PlayerState.PLAYING});");
  assert.equal(app.run("firstUsePending"), false);
  assert.equal(JSON.parse(app.storage.get("retro-signal-tv-state-v1")).channelId, "AAAAAAAAAAA");
});

test("autoplay blocked preserves the channel and POWER retries before normal toggle semantics", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; onAutoplayBlocked(); togglePower();");
  assert.equal(app.run("isPowerOn"), true);
  assert.equal(app.run("invalidVideoIds.size"), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["play"]);
  assert.equal(app.element("channelDisplay").textContent, "PRESS POWER TO START SIGNAL");
  assert.equal(app.element("channelDisplay").classList.contains("persistent"), true);
  app.run("onPlayerStateChange({data: YT.PlayerState.PLAYING});");
  assert.equal(app.run("autoplayBlocked"), false);
  assert.equal(app.run("document.body.dataset.signal"), "locked");
  app.run("togglePower();");
  assert.equal(app.run("isPowerOn"), false);
});

test("an existing state key suppresses first-use bootstrap and keeps its remembered channel", () => {
  const app = appHarness();
  const calls = installPlayer(app);
  app.storage.set("retro-signal-tv-state-v1", JSON.stringify({ channelId: "BBBBBBBBBBB", random: true }));
  app.run("readStoredState(); isPowerOn = true; firstSignalPool = ['AAAAAAAAAAA']; curatedBootstrapAvailable = true; loadChannelVideo(videoList[1]);");
  assert.equal(app.run("firstUsePending"), false);
  assert.equal(app.run("window.savedChannelId"), "BBBBBBBBBBB");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["cue", { videoId: "BBBBBBBBBBB", startSeconds: 0 }]);
});

test("an exhausted curated pool shows no signal and clears blocked retry state", () => {
  const app = appHarness();
  installPlayer(app, ["AAAAAAAAAAA"]);
  app.run("isPowerOn = true; firstUsePending = true; firstSignalPool = ['AAAAAAAAAAA']; curatedBootstrapAvailable = true; firstSignalTried.add('AAAAAAAAAAA'); activeFirstSignal = 'AAAAAAAAAAA'; autoplayBlocked = true; onPlayerError();");
  assert.equal(app.run("firstUsePending"), true);
  assert.equal(app.run("autoplayBlocked"), false);
  assert.equal(app.run("document.body.dataset.signal"), "no-signal");
  assert.equal(app.storage.has("retro-signal-tv-state-v1"), false);
});
