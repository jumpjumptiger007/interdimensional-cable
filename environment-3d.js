const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
const FRAME_INTERVAL = 1000 / 30;
const MAX_DPR = 1.25;
const GRID_SPACING = 70;

const vertexShader = `
  const float TAU = 6.28318530718;
  attribute float aAccent;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uCoherence;
  uniform float uDistortion;
  uniform float uActivity;
  uniform float uSpeed;
  uniform vec3 uFieldColor;
  uniform vec3 uSignalColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 point = position;
    vec2 field = point.xy / uResolution;
    float phaseA = field.x * TAU * 3.6 + field.y * TAU * 0.32 - uTime * uSpeed;
    float phaseB = field.x * TAU * 1.2 - field.y * TAU * 1.35 + uTime * uSpeed * 0.38;
    float wave = sin(phaseA) * mix(0.72, 0.85, uCoherence)
      + sin(phaseB) * mix(0.28, 0.15, uCoherence);
    wave += sin(field.x * TAU * 0.85 + field.y * TAU * 0.62 - uTime * uSpeed * 0.22) * uDistortion * 0.08;
    point.y += wave * (6.0 + uDistortion * 8.0);

    float crest = smoothstep(0.72, 0.98, wave);
    float highlight = aAccent * crest * (0.05 + uActivity * 0.12);
    vColor = mix(uFieldColor, uSignalColor, highlight);
    vAlpha = 0.34 + highlight * 0.12;

    vec4 mvPosition = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
    #include <colorspace_fragment>
  }
`;

const stateTargets = {
  off: { coherence: 0.96, distortion: 0.12, activity: 0.1, speed: 0.105 },
  seeking: { coherence: 0.73, distortion: 0.4, activity: 0.42, speed: 0.235 },
  locked: { coherence: 0.88, distortion: 0.19, activity: 0.2, speed: 0.19 },
  lost: { coherence: 0.82, distortion: 0.3, activity: 0.28, speed: 0.205 },
  "no-signal": { coherence: 0.82, distortion: 0.3, activity: 0.28, speed: 0.205 }
};

function startEnvironment() {
  const host = document.querySelector(".environment-3d");
  if (!host) return;

  let renderer;
  let material;
  let geometry;
  let grid;
  let THREE;
  let scene;
  let camera;
  let resizeObserver;
  let stateObserver;
  let motionPreference;
  let failed = false;
  let ready = false;
  let frameId = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let target = stateTargets[document.body.dataset.signal] || stateTargets.off;

  const randomAt = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  const buildGrid = () => {
    const columns = Math.ceil(width / GRID_SPACING) + 3;
    const rows = Math.ceil(height / GRID_SPACING) + 3;
    const segmentCount = rows * (columns - 1) + columns * (rows - 1);
    const positions = new Float32Array(segmentCount * 6);
    const accents = new Float32Array(segmentCount * 2);
    const spanX = width + GRID_SPACING * 2;
    const spanY = height + GRID_SPACING * 2;
    const stepX = spanX / (columns - 1);
    const stepY = spanY / (rows - 1);
    let vertex = 0;

    const accentAt = (column, row) => randomAt(column + 37, row + 19) > 0.996 ? 1 : 0;
    const appendSegment = (fromColumn, fromRow, toColumn, toRow) => {
      positions[vertex * 3] = -width / 2 - GRID_SPACING + fromColumn * stepX;
      positions[vertex * 3 + 1] = -height / 2 - GRID_SPACING + fromRow * stepY;
      positions[vertex * 3 + 2] = 0;
      accents[vertex] = accentAt(fromColumn, fromRow);
      vertex++;

      positions[vertex * 3] = -width / 2 - GRID_SPACING + toColumn * stepX;
      positions[vertex * 3 + 1] = -height / 2 - GRID_SPACING + toRow * stepY;
      positions[vertex * 3 + 2] = 0;
      accents[vertex] = accentAt(toColumn, toRow);
      vertex++;
    };

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns - 1; column++) {
        appendSegment(column, row, column + 1, row);
      }
    }
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows - 1; row++) {
        appendSegment(column, row, column, row + 1);
      }
    }

    geometry?.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aAccent", new THREE.BufferAttribute(accents, 1));
    if (grid) grid.geometry = geometry;
    else {
      grid = new THREE.LineSegments(geometry, material);
      grid.frustumCulled = false;
      scene.add(grid);
    }
  };

  const fallback = () => {
    if (failed) return;
    failed = true;
    ready = false;
    document.body.classList.remove("webgl-active");
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    stateObserver?.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("resize", onWindowResize);
    if (motionPreference?.removeEventListener) motionPreference.removeEventListener("change", onMotionPreferenceChange);
    else motionPreference?.removeListener?.(onMotionPreferenceChange);
    if (renderer?.domElement.parentNode) renderer.domElement.remove();
    material?.dispose();
    geometry?.dispose();
    renderer?.dispose();
  };

  const resize = () => {
    if (failed) return false;
    const bounds = host.getBoundingClientRect();
    const nextWidth = Math.floor(bounds.width);
    const nextHeight = Math.floor(bounds.height);
    if (nextWidth < 1 || nextHeight < 1) return false;

    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (nextWidth === width && nextHeight === height && nextPixelRatio === pixelRatio) return false;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextPixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    if (material) material.uniforms.uResolution.value.set(width, height);
    if (camera) {
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
    }
    if (material && scene) buildGrid();
    return true;
  };

  const render = () => {
    if (!failed && renderer && scene && camera) renderer.render(scene, camera);
  };
  const approachingTarget = () => {
    const uniforms = material.uniforms;
    return Math.abs(uniforms.uCoherence.value - target.coherence) > 0.0006 ||
      Math.abs(uniforms.uDistortion.value - target.distortion) > 0.0006 ||
      Math.abs(uniforms.uActivity.value - target.activity) > 0.0006 ||
      Math.abs(uniforms.uSpeed.value - target.speed) > 0.0006;
  };

  const requestFrame = () => {
    if (ready && !frameId && !document.hidden) frameId = requestAnimationFrame(draw);
  };

  const draw = now => {
    frameId = 0;
    if (!ready || document.hidden) return;
    if (lastFrame && now - lastFrame < FRAME_INTERVAL - 1) {
      requestFrame();
      return;
    }

    const moving = approachingTarget();
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0;
    lastFrame = now;
    if (!reducedMotion) elapsed += delta;

    const easing = 1 - Math.exp(-delta * (reducedMotion ? 2.8 : 0.62));
    const uniforms = material.uniforms;
    uniforms.uCoherence.value += (target.coherence - uniforms.uCoherence.value) * easing;
    uniforms.uDistortion.value += (target.distortion - uniforms.uDistortion.value) * easing;
    uniforms.uActivity.value += (target.activity - uniforms.uActivity.value) * easing;
    uniforms.uSpeed.value += (target.speed - uniforms.uSpeed.value) * easing;
    uniforms.uTime.value = elapsed;
    render();

    if (!reducedMotion || moving) requestFrame();
  };

  const init = async () => {
    THREE = await import(THREE_URL);
    const bounds = host.getBoundingClientRect();
    const initialWidth = Math.max(1, Math.floor(bounds.width));
    const initialHeight = Math.max(1, Math.floor(bounds.height));
    camera = new THREE.OrthographicCamera(-initialWidth / 2, initialWidth / 2, initialHeight / 2, -initialHeight / 2, 0.1, 10);
    camera.position.z = 1;
    scene = new THREE.Scene();
    material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(initialWidth, initialHeight) },
        uCoherence: { value: target.coherence },
        uDistortion: { value: target.distortion },
        uActivity: { value: target.activity },
        uSpeed: { value: target.speed },
        uFieldColor: { value: new THREE.Color("#3B563F") },
        uSignalColor: { value: new THREE.Color("#A6FF1A") }
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true
    });

    renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: false, powerPreference: "low-power" });
    renderer.setClearColor(0x000000, 0);
    if (!renderer.getContext() || !resize()) throw new Error("WebGL unavailable");

    renderer.compile(scene, camera);
    const programs = renderer.info.programs || [];
    if (!programs.length || programs.some(program => program.diagnostics?.runnable === false)) {
      throw new Error("Shader setup failed");
    }

    renderer.render(scene, camera);
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.addEventListener("webglcontextlost", fallback, { once: true });
    host.append(canvas);
    document.body.classList.add("webgl-active");
    ready = true;

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        if (resize()) render();
      });
      resizeObserver.observe(host);
    } else {
      window.addEventListener("resize", onWindowResize, { passive: true });
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motionPreference?.addEventListener) motionPreference.addEventListener("change", onMotionPreferenceChange);
    else motionPreference?.addListener?.(onMotionPreferenceChange);

    if (!reducedMotion && !document.hidden) requestFrame();
  };

  const onWindowResize = () => {
    if (resize()) render();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
    } else {
      lastFrame = 0;
      requestFrame();
    }
  };

  const onMotionPreferenceChange = event => {
    reducedMotion = event.matches;
    lastFrame = 0;
    if (reducedMotion) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      if (!document.hidden) requestFrame();
    } else {
      requestFrame();
    }
  };

  stateObserver = new MutationObserver(() => {
    target = stateTargets[document.body.dataset.signal] || stateTargets.off;
    if (ready && reducedMotion && !document.hidden) requestFrame();
  });
  stateObserver.observe(document.body, { attributes: true, attributeFilter: ["data-signal"] });

  init().catch(fallback);
}

startEnvironment();
