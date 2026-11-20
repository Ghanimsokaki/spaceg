// ─────────────────────────────────────────────────────────────────────────────
//  STELLAR DRIVE WORKS — interstellar flight & starship-company simulator
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { C, G, AU, LY, YEAR, DAY, ENGINES, CONFIGS, SYSTEMS, SYS_BY_ID, CONTRACTS, START_CREDITS, DEFAULT_PARTS } from './data.js';
import * as PH from './physics.js';
import { buildShip } from './shipModels.js';
import { Universe, LensShader } from './universe.js';
import { UI } from './ui.js';
import { Combat, starFlux } from './combat.js';
import { storage } from './storage.js';

// ── renderer & scenes ────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1e13);
const hemi = new THREE.HemisphereLight(0x8fa6d0, 0x15151c, 0.3);
scene.add(hemi); hemi.layers.enable(1);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
sun.layers.enable(1); sun.shadow.camera.layers.enable(1);
const fill = new THREE.DirectionalLight(0x6f8fc0, 0.25);
scene.add(fill); fill.layers.enable(1);

const universe = new Universe(scene);
const combat = new Combat(scene);

// Image-based lighting: a dim studio-in-space environment so metals and foils read correctly
function makeEnvironment() {
  const es = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.015,0.017,0.022), vec3(0.20,0.23,0.30), smoothstep(-0.6, 0.9, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  es.add(sky);
  const panel = (w, h, pos, col, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); es.add(m); };
  panel(30, 30, [30, 30, 25], 0xffffff, 6);
  panel(60, 8, [-35, 10, -20], 0x9fc4ff, 1.6);
  panel(40, 6, [0, -30, 30], 0xffb070, 0.8);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.03);
  pm.dispose();
  return rt.texture;
}
const envTex = makeEnvironment();
scene.environment = envTex;

// hangar scene for the company HQ
const hangar = new THREE.Scene();
hangar.background = new THREE.Color(0x05080f);
hangar.fog = new THREE.Fog(0x05080f, 900, 3400);
hangar.environment = envTex;
{
  hangar.add(new THREE.HemisphereLight(0x9fb4d8, 0x0b0d12, 0.6));
  const k = new THREE.DirectionalLight(0xffffff, 2.6); k.position.set(300, 400, 260); k.castShadow = true;
  k.shadow.mapSize.set(2048, 2048); k.shadow.camera.left = k.shadow.camera.bottom = -400; k.shadow.camera.right = k.shadow.camera.top = 400; k.shadow.camera.far = 2000;
  hangar.add(k);
  const rim = new THREE.DirectionalLight(0x5fd8ff, 1.0); rim.position.set(-400, 260, -300); hangar.add(rim);
  const grid = new THREE.PolarGridHelper(1400, 24, 14, 96, 0x12283c, 0x0b1726); grid.position.y = -299; hangar.add(grid);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1400, 96), new THREE.MeshStandardMaterial({ color: 0x080c14, metalness: 0.1, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -300; floor.receiveShadow = true; hangar.add(floor);
}
const hangarCam = new THREE.PerspectiveCamera(40, 1, 1, 10000);

// post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = new ShaderPass(LensShader);
composer.addPass(lensPass);
// the player's ship lives on layer 1 and is drawn after lensing so it is never distorted
const shipCam = camera.clone();
shipCam.layers.set(1);
const shipPass = new RenderPass(scene, shipCam);
shipPass.clear = false; shipPass.clearDepth = true;
composer.addPass(shipPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const hComposer = new EffectComposer(renderer);
hComposer.addPass(new RenderPass(hangar, hangarCam));
const hBloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85);
hComposer.addPass(hBloom);
hComposer.addPass(new OutputPass());

// ── game state ───────────────────────────────────────────────────────────────
const SAVE_KEYS = { career: 'sdw-save-v1', sandbox: 'sdw-sandbox-v1' };
let G_ = null; // game state
function freshGame(name, sandbox = false) {
  return {
    company: name || 'Stellar Drive Works', credits: sandbox ? 1e12 : START_CREDITS, rep: sandbox ? 999 : 0, t: 0, sandbox,
    unlocked: sandbox ? Object.keys(ENGINES) : ['chem'], fleet: [], activeId: null, done: {}, records: { maxBeta: 0 }, kills: 0, killsBase: 0,
    settings: { relOptics: true, bloom: true, invincible: false, infiniteFuel: false },
  };
}
const keyOf = (g) => SAVE_KEYS[g && g.sandbox ? 'sandbox' : 'career'];
// autosave: IndexedDB (localStorage fallback); writes are coalesced so a burst of saves costs one write
let saving = false, saveAgain = false, lastSaved = 0;
function save() {
  if (!G_) return;
  if (saving) { saveAgain = true; return; }
  saving = true;
  storage.set(keyOf(G_), G_).then(() => { lastSaved = Date.now(); }).finally(() => { saving = false; if (saveAgain) { saveAgain = false; save(); } });
}
const load = (mode = 'career') => storage.get(SAVE_KEYS[mode]);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

const activeShip = () => G_ && G_.fleet.find(s => s.id === G_.activeId);

function placeAtShipyard(ship) {
  const sys = SYS_BY_ID.sol;
  const yard = sys.byName.Shipyard;
  const st = PH.bodyState(yard, G_.t);
  ship.sys = 'sol';
  const off = [600 + Math.random() * 300, 120, 900];
  ship.p = PH.add(st.p, off);
  ship.u = PH.uOfVel(st.v);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  ship.q = q.toArray();
  ship.status = 'docked'; ship.orbiting = yard.id; ship.throttle = 0;
  ship.ap.mode = 'off'; ship.ap.plan = null;
}

// ── active ship visuals ──────────────────────────────────────────────────────
let view = null, viewKey = '';
const shipRoot = new THREE.Group();
scene.add(shipRoot);
function ensureView(ship) {
  const parts = PH.partsFor(ship);
  const key = ship.id + ship.engine + parts.join(',');
  if (key === viewKey) return;
  if (!viewKey.startsWith(ship.id)) combat.clear();
  if (view) shipRoot.remove(view.root);
  view = buildShip(ship.engine, ship.config, parts);
  shipRoot.add(view.root);
  view.root.traverse(o => o.layers.set(1));
  viewKey = key;
  cam.dist = view.camDist;
  const r = view.radius * 1.3;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 4 * r + 2000 });
  sun.shadow.camera.updateProjectionMatrix();
}
let hangarView = null, hangarKey = '';
function setHangarModel(engine, parts) {
  if (typeof parts === 'string') parts = DEFAULT_PARTS[parts];
  const key = engine + '|' + parts.join(',');
  if (key === hangarKey) return;
  const keepDist = hangarView && hangarKey.split('|')[0] === engine;
  if (hangarView) hangar.remove(hangarView.root);
  hangarView = buildShip(engine, PH.specOf(engine, parts).config, parts);
  hangarView.root.rotation.x = 0;
  hangar.add(hangarView.root);
  hangarKey = key;
  // frame the whole ship (solid parts only; effect volumes are huge and invisible)
  const box = new THREE.Box3(), tmpB = new THREE.Box3();
  hangarView.root.updateMatrixWorld(true);
  hangarView.root.traverse(o => {
    if (!o.isMesh || o.material.isShaderMaterial || o.material.blending === THREE.AdditiveBlending) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmpB.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmpB);
  });
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  hangarView.root.position.copy(c).negate();
  const want = Math.max(size.x, size.y, size.z) * (window.innerWidth > 900 ? 2.3 : 1.6) + 40;
  if (!keepDist || hcam.dist < want * 0.6 || hcam.dist > want * 1.8) hcam.dist = want;
}

// ── camera ───────────────────────────────────────────────────────────────────
const cam = { yaw: 2.4, pitch: 0.28, dist: 300, mode: 'chase', zoom: 1 };
const hcam = { yaw: 0.9, pitch: 0.25, dist: 500, spin: true };
let dragging = false, lastX = 0, lastY = 0, dragTarget = 'space';
// one pointer drags the camera; two pointers pinch-zoom (touchscreens)
const ptrs = new Map();
let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; dragTarget = ui.hqOpen ? 'hangar' : 'space'; }
  else { dragging = false; const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  canvas.setPointerCapture(e.pointerId);
});
const ptrUp = (e) => { ptrs.delete(e.pointerId); if (ptrs.size === 0) dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
canvas.addEventListener('pointerup', ptrUp);
canvas.addEventListener('pointercancel', ptrUp);
canvas.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0 && d > 0) {
      const f = pinch0 / d;
      if (ui.hqOpen) hcam.dist = Math.max(80, Math.min(6000, hcam.dist * f));
      else cam.zoom = Math.max(0.25, Math.min(40, cam.zoom * f));
    }
    pinch0 = d; return;
  }
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  const c = dragTarget === 'hangar' ? hcam : cam;
  c.yaw -= dx * 0.006; c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + dy * 0.005));
  if (c === hcam) hcam.spin = false;
});
canvas.addEventListener('wheel', (e) => {
  const c = ui.hqOpen ? hcam : cam;
  const f = Math.exp(e.deltaY * 0.0012);
  if (c === cam) cam.zoom = Math.max(0.25, Math.min(40, cam.zoom * f)); else c.dist = Math.max(80, Math.min(3000, c.dist * f));
  e.preventDefault();
}, { passive: false });

// ── input ────────────────────────────────────────────────────────────────────
const keys = new Set();
const WARPS = [1, 5, 10, 50, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 3e7, 1e8, 1e9];
let warpIdx = 0, paused = false;
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  const ship = activeShip();
  if (k === 'h') { ui.toggleHQ(); return; }
  if (k === 'escape') { if (ui.hqOpen) ui.toggleHQ(false); else if (ui.mapOpen) ui.toggleMap(false); else if (ui.helpOpen) ui.toggleHelp(false); return; }
  if (ui.hqOpen || !ship) return;
  if (k === '.' || k === '>') setWarp(warpIdx + 1);
  if (k === ',' || k === '<') setWarp(warpIdx - 1);
  if (k === '/') setWarp(0);
  if (k === 'z') { ship.throttle = 1; cancelAP(ship, true); }
  if (k === 'x') { ship.throttle = 0; cancelAP(ship, true); }
  if (k === 'b') ship.magsail = !ship.magsail;
  if (k === 'r') ship.ram = !ship.ram;
  if (k === 'g') stageNow(ship);
  if (k === 'v') toggleWarpDrive(ship);
  if (k === '[') ship.warpC = Math.max(1, Math.round(ship.warpC / 1.5));
  if (k === ']') ship.warpC = Math.min(ENGINES[ship.engine].warp ? ENGINES[ship.engine].warp.maxC : 1, Math.round(ship.warpC * 1.5 + 1));
  if (k === 't') ui.cycleTarget(1);
  if (k === 'n') ui.toggleNav();
  if (k === 'm') ui.toggleMap();
  if (k === 'c') cycleCamera();
  if (k === 'y') { const d = combat.cycleLock(); if (d) ui.toast('Target lock: drone ' + d.id); }
  if (k === 'j') { ship.fwd = fwdOf(ship); combat.spawn(ship, 3); ui.toast('3 target drones launched ahead of you'); }
  if (k === 'p') { paused = !paused; ui.toast(paused ? 'Paused' : 'Resumed'); }
  if (k === 'f1' || k === '?') { ui.toggleHelp(); e.preventDefault(); }
  if (k >= '1' && k <= '7') setAP(ship, ['off', 'prograde', 'retrograde', 'target', 'approach', 'flyby', 'off'][+k - 1]);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function setWarp(i) {
  warpIdx = Math.max(0, Math.min(WARPS.length - 1, i));
}
function cycleCamera() {
  const modes = ['chase', 'orbit', 'cockpit', 'cinematic'];
  cam.mode = modes[(modes.indexOf(cam.mode) + 1) % modes.length];
  ui.toast('Camera: ' + cam.mode);
}
function cancelAP(ship, quiet) { if (ship.ap.mode !== 'off') { ship.ap.mode = 'off'; ship.ap.plan = null; if (!quiet) ui.toast('Autopilot off'); } }
function stageNow(ship) {
  const E = ENGINES[ship.engine];
  if (E.staged && ship.stage === 1) { ship.stage = 2; ship.fuel = 0; ui.toast('Stage 1 separated'); }
}
function toggleWarpDrive(ship) {
  const E = ENGINES[ship.engine];
  if (!E.warp) { ui.toast('This ship has no warp ring'); return; }
  if (ship.warpOn) { ship.warpOn = false; ui.toast('Warp bubble collapsed'); return; }
  const near = nearestStarDist(ship);
  if (near < E.warp.minAU * AU) { ui.toast(`Too deep in a gravity well: ${(near / AU).toFixed(1)} AU from a star (need ${E.warp.minAU} AU)`, 'warn'); return; }
  if (ship.fuel2 <= 0) { ui.toast('No exotic matter left', 'warn'); return; }
  ship.warpOn = true; ship.status = 'flying'; ship.orbiting = null;
  ui.toast(`Warp bubble formed · ${ship.warpC}c`);
}
function nearestStarDist(ship) {
  const g = PH.shipGlobal(ship);
  let best = Infinity;
  for (const s of SYSTEMS) { best = Math.min(best, PH.len(PH.sub(g, s.pos))); }
  return best;
}
export function setAP(ship, mode) {
  const ap = ship.ap;
  if ((mode === 'target' || mode === 'approach' || mode === 'flyby') && !ap.target) { ui.toast('Select a target first (T or the Nav list)', 'warn'); return; }
  ap.mode = mode; ap.plan = null; ap.phaseLabel = '';
  if (mode === 'approach') {
    const tb = PH.bodyById(ap.target);
    ap.plan = PH.planTransfer(ship, tb, G_.t, null);
    if (ap.plan.kind === 'lambert') {
      const wait = ap.plan.tDep - G_.t;
      ui.toast(`Transfer plotted: Δv ${(ap.plan.dv / 1000).toFixed(1)} km/s · ${wait > 3600 ? `launch window in ${UI.fmtTime(wait)} · ` : ''}flight ${UI.fmtTime(ap.plan.T)}${ap.plan.short ? ' — WARNING: not enough Δv' : ''}`, ap.plan.short ? 'warn' : '');
    }
    else ui.toast('Direct-approach guidance engaged');
    if (ship.status === 'docked' || ship.status === 'orbit') ship.status = 'flying';
  }
  if (mode === 'flyby' && ship.status !== 'flying') ship.status = 'flying';
  if (mode !== 'off') ui.toast('Autopilot: ' + mode.toUpperCase());
}

// ── manual flight control ────────────────────────────────────────────────────
const qTmp = new THREE.Quaternion(), qShip = new THREE.Quaternion(), vTmp = new THREE.Vector3();
const touch = { pitch: 0, yaw: 0, roll: 0 };
function manualControl(ship, rdt) {
  let pitch = touch.pitch, yaw = touch.yaw, roll = touch.roll;
  if (keys.has('w')) pitch -= 1; if (keys.has('s')) pitch += 1;
  if (keys.has('a')) yaw += 1; if (keys.has('d')) yaw -= 1;
  if (keys.has('q')) roll -= 1; if (keys.has('e')) roll += 1;
  const any = pitch || yaw || roll;
  if (any) {
    if (['prograde', 'retrograde', 'target'].includes(ship.ap.mode)) cancelAP(ship, true);
    qShip.fromArray(ship.q);
    const rate = 0.7 * rdt;
    qTmp.setFromEuler(new THREE.Euler(pitch * rate, yaw * rate, roll * rate));
    qShip.multiply(qTmp).normalize();
    ship.q = qShip.toArray();
    if (ship.status === 'docked') ship.status = 'flying';
  }
  if (keys.has('shift')) { ship.throttle = Math.min(1, ship.throttle + rdt * 0.6); if (ship.ap.mode === 'approach' || ship.ap.mode === 'flyby') cancelAP(ship); }
  if (keys.has('control')) { ship.throttle = Math.max(0, ship.throttle - rdt * 0.6); if (ship.ap.mode === 'approach' || ship.ap.mode === 'flyby') cancelAP(ship); }
}

// rotate ship toward direction d at limited rate (rad per step)
function steerTo(ship, d, maxAng) {
  qShip.fromArray(ship.q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qShip);
  const want = new THREE.Vector3(d[0], d[1], d[2]).normalize();
  const ang = fwd.angleTo(want);
  if (ang < 1e-5) return 0;
  const target = new THREE.Quaternion().setFromUnitVectors(fwd, want).multiply(qShip);
  qShip.slerp(target, Math.min(1, maxAng / ang));
  ship.q = qShip.normalize().toArray();
  return Math.max(0, ang - maxAng);
}
const fwdOf = (ship) => { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(qShip.fromArray(ship.q)); return [v.x, v.y, v.z]; };

// ── simulation ───────────────────────────────────────────────────────────────
let lastFx = { firing: false, throttle: 0, phase: '', pulse: false, ram: false, sail: false };
let warpLimitedBy = '';
let accelNow = 0;

function simulate(ship, realDt) {
  const want = WARPS[warpIdx] * realDt;
  const sys = SYS_BY_ID[ship.sys];
  const states = PH.systemState(sys, G_.t);
  const v = PH.velOfU(ship.u);
  const sp = PH.len(v);
  // ── substep size limits
  let dtMax = Infinity; warpLimitedBy = '';
  for (const s of states) {
    if (!s.b.mass && s.b.type !== 'station') continue;
    const r = Math.max(PH.len(PH.sub(s.p, ship.p)), s.b.radius || 1);
    if (s.b.mass) {
      const tdyn = Math.sqrt(r * r * r / (G * s.b.mass));
      const lim = 0.012 * tdyn;
      if (lim < dtMax) { dtMax = lim; warpLimitedBy = 'gravity of ' + s.b.name; }
    }
    const vrel = PH.len(PH.sub(v, s.v)) + 1;
    const clr = (r - (s.b.radius || 0)) / vrel * 0.08;
    if (clr < dtMax && !ship.warpOn) { dtMax = Math.max(clr, 0.01); warpLimitedBy = 'proximity to ' + s.b.name; }
  }
  const m = PH.shipMass(ship);
  const rp = PH.rocketParams(ship);
  if (ship.throttle > 0 || ship.ap.mode === 'approach' || ship.ap.mode === 'flyby') {
    const a = Math.max(rp.F / m, 1e-6);
    const lim = 0.02 * (sp + 3000) / a;
    if (lim < dtMax) { dtMax = Math.max(lim, 0.05); warpLimitedBy = 'thrust'; }
  }
  if (ship.ap.target && (ship.ap.mode === 'approach' || ship.ap.mode === 'flyby')) {
    const tb = PH.bodyById(ship.ap.target);
    const rel = PH.relToBody(ship, tb, G_.t);
    const d = PH.len(rel.r) - PH.targetArrivalRadius(tb);
    const vr = PH.len(PH.sub(v, tb.sys === sys ? rel.vb : [0, 0, 0])) + 1;
    const lim = Math.max(Math.abs(d) / vr * 0.02, 0.05);
    if (lim < dtMax) { dtMax = lim; warpLimitedBy = 'arrival at ' + tb.name; }
  }
  if (ship.warpOn) {
    const near = nearestStarDist(ship) - ENGINES[ship.engine].warp.minAU * AU;
    const lim = Math.max(near / (ship.warpC * C) * 0.25, 1);
    if (lim < dtMax) { dtMax = lim; warpLimitedBy = 'warp drop-out'; }
  }
  dtMax = Math.max(dtMax, 0.002);
  const maxSteps = 500;
  let n = Math.ceil(want / dtMax);
  let total = want;
  if (n > maxSteps) { n = maxSteps; total = dtMax * maxSteps; } else warpLimitedBy = '';
  const dt = total / Math.max(n, 1);
  G_.effWarp = total / Math.max(realDt, 1e-6);
  let fxAcc = null;
  for (let i = 0; i < n; i++) {
    const fx = stepShip(ship, dt, realDt / n);
    if (!fxAcc || fx.firing) fxAcc = fx;
    if (ship.status === 'destroyed') break;
  }
  if (fxAcc) lastFx = fxAcc;
}

function stepShip(ship, dt, realDtPart) {
  const sys = SYS_BY_ID[ship.sys];
  const t = G_.t;
  const states = PH.systemState(sys, t);
  const E = ENGINES[ship.engine];
  const g = PH.gravityAt(ship.p, states);
  let v = PH.velOfU(ship.u);
  let sp = PH.len(v);
  const beta = sp / C;
  const gam = PH.gammaOfU(ship.u);
  const vhat = sp > 1e-9 ? PH.mul(v, 1 / sp) : fwdOf(ship);

  // docked: ride along with the shipyard
  if (ship.status === 'docked' && ship.throttle === 0 && ship.ap.mode === 'off') {
    const yard = SYS_BY_ID.sol.byName.Shipyard;
    const st0 = PH.bodyState(yard, t), st1 = PH.bodyState(yard, t + dt);
    ship.p = PH.add(ship.p, PH.sub(st1.p, st0.p));
    ship.u = PH.uOfVel(st1.v);
    G_.t += dt; ship.tau += dt;
    return { firing: false, throttle: 0 };
  }

  // ── autopilot
  const ap = ship.ap;
  let apOut = null;
  if (ap.mode !== 'off') {
    const env = {};
    const tb = ap.target ? PH.bodyById(ap.target) : null;
    if (tb && (ap.mode === 'approach' || ap.mode === 'flyby')) {
      const tState = tb.sys === sys ? states.find(s => s.b === tb) : null;
      let central = null;
      if (ap.plan && ap.plan.kind === 'lambert') central = PH.bodyById(ap.plan.centralId);
      // departure sphere of influence: a planet/moon we are inside whose SOI does not contain the target
      let dep = null;
      for (const s of states) {
        if (s.b.type !== 'planet' && s.b.type !== 'moon') continue;
        if (s.b === central || s.b === tb) continue;
        const r = PH.len(PH.sub(ship.p, s.p));
        const soi = PH.hillRadius(s.b) * 0.5;
        if (r > soi) continue;
        const tOut = !tState || PH.len(PH.sub(tState.p, s.p)) > soi;
        if (tOut && (!dep || r < dep.r)) dep = { b: s.b, v: s.v, p: s.p, r, inSOI: true, g: PH.gravityAt(ship.p, [s]) };
      }
      env.nearestMassive = dep;
      if (central) {
        const cs = states.find(s => s.b === central);
        env.gNonCentral = PH.sub(g, cs ? PH.gravityAt(ship.p, [cs]) : [0, 0, 0]);
      } else if (tState) {
        env.gNonCentral = PH.sub(g, PH.gravityAt(tState.p, states, tb));
      } else env.gNonCentral = g;
      if (dep) env.gNonCentral = PH.sub(env.gNonCentral, dep.g);
    }
    // collision avoidance: push away from any non-target body we are on course to hit
    const vS = PH.velOfU(ship.u);
    for (const s of states) {
      if (!s.b.radius || s.b.type === 'station' || s.b === tb) continue;
      const rel = PH.sub(ship.p, s.p); const d = PH.len(rel);
      const R = s.b.radius * (s.b.type === 'blackhole' ? 6 : 1.15);
      if (d > R * 12) continue;
      const rh = PH.mul(rel, 1 / d);
      const vr = PH.sub(vS, s.v);
      const closing = -PH.dot(vr, rh);
      if (closing <= 0) continue;
      const vl = PH.len(vr) || 1;
      const bImp = PH.len(PH.cross(rel, vr)) / vl;
      const tti = (d - R) / closing;
      if (bImp < R * 1.4 && tti < 2 * DAY) {
        const tang = PH.sub(PH.mul(vr, 1 / vl), PH.mul(rh, -closing / vl));
        const tl = PH.len(tang);
        const side = tl > 1e-6 ? PH.mul(tang, 1 / tl) : rh;
        env.avoid = PH.add(env.avoid || [0, 0, 0], PH.add(PH.mul(rh, 1.2), PH.mul(side, 0.8)));
      }
    }
    apOut = PH.autopilot(ship, t, states, dt, env);
    if (apOut) {
      const maxAng = Math.max(0.9 * realDtPart, Math.min(Math.PI, 0.9 * dt));
      let rem = 0;
      if (apOut.dir) rem = steerTo(ship, apOut.dir, maxAng);
      if (apOut.thr !== null && apOut.thr !== undefined) ship.throttle = rem < 0.12 ? apOut.thr : 0;
      if (E.magsail) ship.magsail = !!apOut.sail;
      if (apOut.warp && !ship.warpOn && rem < 0.02) {
        if (nearestStarDist(ship) > E.warp.minAU * AU * 1.05) { ship.warpC = E.warp.maxC; ship.warpOn = true; ui.toast(`Warp engaged toward ${tb.sys.name}`); }
        else { ship.throttle = 1; } // climb out of the well first
      }
      if (ap.mode === 'approach' && !apOut.warp && ship.warpOn) ship.warpOn = false;
    }
  }

  const fwd = fwdOf(ship);
  const dtau = dt / gam;
  const thrBefore = ship.throttle;
  const out = PH.engineOutput(ship, dtau, beta, vhat, fwd);
  if (out.staged) ui.toast('Stage 1 burnout — separation confirmed. Stage 2 ignition.');
  const mNow = PH.shipMass(ship);
  // proper-velocity update: du/dt = (F∥ + F⊥/γ)/m + drag/m + γg
  let du = [0, 0, 0];
  if (out.F > 0) {
    const fpar = PH.dot(fwd, vhat);
    const par = PH.mul(vhat, out.F * fpar);
    const perp = PH.mul(PH.sub(fwd, PH.mul(vhat, fpar)), out.F / gam);
    du = PH.add(du, PH.mul(PH.add(par, perp), 1 / mNow));
  }
  if (out.sail) du = PH.add(du, PH.mul(out.drag, 1 / mNow));
  if (!ship.warpOn) du = PH.add(du, PH.mul(g, gam));
  ship.u = PH.add(ship.u, PH.mul(du, dt));
  // stop magsail from reversing the ship
  if (out.sail && PH.dot(ship.u, vhat) < 0 && out.F === 0) ship.u = PH.mul(vhat, 1e-3);
  accelNow = (out.F + (out.sail ? PH.len(out.drag) : 0)) / mNow;

  v = PH.velOfU(ship.u);
  if (ship.warpOn) {
    const w = ship.warpC * C;
    ship.p = PH.add(ship.p, PH.mul(fwd, w * dt));
    ship.fuel2 = Math.max(0, ship.fuel2 - E.warp.perLy * w * dt / LY);
    ship.tau += dt;
    if (ship.fuel2 <= 0) { ship.warpOn = false; ui.toast('Exotic matter exhausted — dropped out of warp', 'warn'); }
    if (nearestStarDist(ship) < E.warp.minAU * AU) { ship.warpOn = false; ui.toast('Dropped out of warp at the edge of a gravity well'); }
  } else {
    ship.p = PH.add(ship.p, PH.mul(v, dt));
    ship.tau += dt / PH.gammaOfU(ship.u);
  }
  G_.t += dt;

  if (out.F > 0 || ship.throttle > 0) { if (ship.status !== 'flying') { ship.status = 'flying'; ship.orbiting = null; } }

  // ── hull erosion above shield rating
  const b2 = PH.len(v) / C;
  ship.maxBeta = Math.max(ship.maxBeta, b2);
  const rated = PH.shipSpec(ship).rated;
  const godMode = G_.sandbox && G_.settings.invincible;
  if (b2 > rated && !ship.warpOn && !godMode) {
    const over = b2 / rated - 1;
    ship.hull -= over * 4 * dt / YEAR;
    if (!ship._hullWarned && ship.hull < 0.6) { ship._hullWarned = true; ui.toast('Hull erosion critical — interstellar dust exceeding shield rating!', 'warn'); }
    if (ship.hull <= 0) { destroyShip(ship, 'shredded by interstellar dust at ' + (b2 * 100).toFixed(1) + '% c'); return out; }
  }

  // ── collisions
  if (!ship.warpOn && !godMode) for (const s of states) {
    if (!s.b.radius || s.b.type === 'station') continue;
    const r = PH.len(PH.sub(ship.p, s.p));
    if (r < s.b.radius * (s.b.type === 'blackhole' ? 1.5 : 1.0)) {
      destroyShip(ship, s.b.type === 'blackhole' ? `crossed the event horizon of ${s.b.name}` : s.b.type.startsWith('star') ? `vaporised in the photosphere of ${s.b.name}` : `impacted ${s.b.name}`);
      return out;
    }
  }

  // ── arrival / orbit insertion
  if (ap.mode === 'approach' && ap.target) {
    const tb = PH.bodyById(ap.target);
    if (tb.sys === SYS_BY_ID[ship.sys]) {
      const ts = PH.bodyState(tb, G_.t);
      const r = PH.len(PH.sub(ship.p, ts.p));
      const Ra = PH.targetArrivalRadius(tb);
      const urel = PH.len(PH.sub(PH.velOfU(ship.u), ts.v));
      const vesc = tb.mass ? Math.sqrt(2 * G * tb.mass / Math.max(r, 1)) : 0;
      const thresh = tb.type === 'station' ? 25 : Math.max(1.5 * vesc, 3000);
      if (r < Ra && urel < thresh) {
        if (tb.type === 'station') {
          ship.status = 'docked'; ship.orbiting = tb.id; ship.u = PH.uOfVel(ts.v); ship.throttle = 0; ap.mode = 'off'; ap.plan = null;
          onDocked(ship);
        } else {
          const res = PH.insertOrbit(ship, tb, G_.t, states);
          if (res.ok) {
            ship.status = 'orbit'; ship.orbiting = tb.id; ship.throttle = 0; ap.mode = 'off'; ap.plan = null;
            ui.toast(`Orbit achieved around ${tb.name} (insertion Δv ${(res.dv / 1000).toFixed(2)} km/s)`, 'good');
            onArrived(ship, tb);
          }
        }
      }
    }
  }

  // ── flyby & speed contracts
  checkContracts(ship);

  // ── rebase to nearest star system
  if (PH.rebase(ship)) {
    const s = SYS_BY_ID[ship.sys];
    ui.toast(`Entering the ${s.name} system`, 'good');
  }
  return { firing: out.F > 0, throttle: ship.throttle, phase: out.phase, pulse: out.pulse, ram: out.ram, sail: out.sail, stage: ship.stage, forge: out.forge };
}

function destroyShip(ship, why) {
  ship.status = 'destroyed';
  ship.throttle = 0;
  ui.toast(`${ship.name} lost — ${why}.`, 'bad');
  ui.showLoss(ship, why);
  G_.fleet = G_.fleet.filter(s => s !== ship);
  G_.activeId = G_.fleet[0] ? G_.fleet[0].id : null;
  save();
}

function onDocked(ship) {
  ship.flags = {};
  ui.toast(`${ship.name} docked at the orbital shipyard. Refuel & repair from HQ (H).`, 'good');
  save();
}

function contractSatisfied(c, ship) {
  ship.config = PH.shipSpec(ship).config;
  if (!c.config) return true;
  if (c.config === 'probe') return true;
  if (c.config === 'explorer') return ship.config === 'explorer' || ship.config === 'ark';
  return ship.config === c.config;
}
function completeContract(c, ship) {
  G_.done[c.id] = (G_.done[c.id] || 0) + 1;
  let reward = c.repeat ? c.reward * Math.pow(0.85, G_.done[c.id] - 1) : c.reward;
  if (c.repeat) reward *= 1 + 0.25 * PH.shipSpec(ship).cargo;
  G_.credits += reward; G_.rep += c.rep;
  ui.contractToast(c, reward, ship);
  save();
}
function onArrived(ship, body) {
  ship.flags = ship.flags || {};
  for (const c of CONTRACTS) {
    if (c.kind !== 'orbit' || c.target !== body.id) continue;
    if (!c.repeat && G_.done[c.id]) continue;
    if (c.repeat && ship.flags[c.id]) continue;
    if (!contractSatisfied(c, ship)) { ui.toast(`“${c.title}” needs a ${CONFIGS[c.config].name} configuration`, 'warn'); continue; }
    ship.flags[c.id] = true;
    completeContract(c, ship);
  }
  save();
}
function checkContracts(ship) {
  const beta = PH.len(PH.velOfU(ship.u)) / C;
  G_.records.maxBeta = Math.max(G_.records.maxBeta, beta);
  for (const c of CONTRACTS) {
    if (G_.done[c.id]) continue;
    if (c.kind === 'speed' && beta >= c.beta && !ship.warpOn) completeContract(c, ship);
    if (c.kind === 'flyby') {
      const tb = PH.bodyById(c.target);
      if (tb.sys.id !== ship.sys) continue;
      const r = PH.len(PH.sub(ship.p, PH.bodyState(tb, G_.t).p));
      if (r < c.radius) completeContract(c, ship);
    }
  }
}

// ── camera placement ─────────────────────────────────────────────────────────
const camQ = new THREE.Quaternion();
let cineT = 0;
function updateCamera(ship, rdt) {
  qShip.fromArray(ship.q);
  const D = cam.dist * cam.zoom;
  const off = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(D);
  if (cam.mode === 'chase') {
    camQ.slerp(qShip, Math.min(1, rdt * 3));
    off.applyQuaternion(camQ);
    camera.position.copy(off);
    camera.up.set(0, 1, 0).applyQuaternion(camQ);
    camera.lookAt(0, 0, 0);
  } else if (cam.mode === 'orbit') {
    camera.position.copy(off); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
  } else if (cam.mode === 'cockpit') {
    const bow = new THREE.Vector3(0, view.radius * 0.08, view.length * 0.55).applyQuaternion(qShip);
    camera.position.copy(bow);
    camera.up.set(0, 1, 0).applyQuaternion(qShip);
    const look = new THREE.Vector3(Math.sin(cam.yaw - 2.4) * 0.6, cam.pitch * 0.5, 1).normalize().applyQuaternion(qShip);
    camera.lookAt(bow.clone().add(look.multiplyScalar(1000)));
  } else {
    cineT += rdt * 0.06;
    const o = new THREE.Vector3(Math.sin(cineT) * 1.2, 0.25 + Math.sin(cineT * 0.7) * 0.2, Math.cos(cineT * 0.9) * 0.9).normalize().multiplyScalar(D * 1.3).applyQuaternion(qShip);
    camera.position.copy(o); camera.up.set(0, 1, 0).applyQuaternion(qShip); camera.lookAt(0, 0, 0);
  }
  shipRoot.quaternion.copy(qShip);
  // key light follows the star direction; shadow camera around the ship
  sun.target.position.set(0, 0, 0);
  const ld = sun.position.clone().normalize();
  sun.position.copy(ld.multiplyScalar(view.radius * 2 + 400));
  fill.position.copy(camera.position).add(new THREE.Vector3(0, 200, 0));
}

// ── main loop ────────────────────────────────────────────────────────────────
let lastT = performance.now();
let saveTimer = 0;
const ui = new UI({
  get game() { return G_; },
  activeShip, setAP, setWarp: (i) => setWarp(i), get warpIdx() { return warpIdx; }, WARPS,
  get effWarp() { return G_ ? G_.effWarp : 1; }, get warpLimitedBy() { return warpLimitedBy; },
  get fx() { return lastFx; }, get accel() { return accelNow; },
  newGame: (name, sandbox = false) => {
    G_ = freshGame(name, sandbox);
    const s = sandbox ? PH.newShip('amed', 'probe', 'Sandbox AMED', ['laser', 'missiles', 'solar', 'hab', 'cmd']) : PH.newShip('chem', 'probe', 'Kestrel I', ['science']);
    G_.fleet.push(s); G_.activeId = s.id; placeAtShipyard(s); combat.clear(); save(); return G_;
  },
  loadGame: async (mode = 'career') => { G_ = await load(mode); combat.clear(); if (G_) { G_.fleet.forEach(s => { s.ap.plan = null; s.ap._vd = null; if (!Array.isArray(s.parts)) s.parts = PH.partsFor(s).slice(); s.config = PH.shipSpec(s).config; }); } return G_; },
  hasSave: async (mode = 'career') => !!(await load(mode)),
  deleteSave: () => storage.del(keyOf(G_)),
  get saveInfo() { return { backend: storage.backend, lastSaved }; },
  combat,
  teleport: (id) => { const s = activeShip(); if (s) teleport(s, PH.bodyById(id)); },
  spawnDrones: (n) => { const s = activeShip(); if (s) { s.fwd = fwdOf(s); combat.spawn(s, n); ui.toast(`${n} target drones launched ahead of you`); } },
  cycleLock: () => { const d = combat.cycleLock(); if (d) ui.toast('Target lock: drone ' + d.id); },
  setFire: (on) => { fireButton = on; },
  setTouch: (p, y, r) => { touch.pitch = p; touch.yaw = y; touch.roll = r; },
  setThrottle: (v) => { const s = activeShip(); if (!s) return; s.throttle = v; if (s.ap.mode === 'approach' || s.ap.mode === 'flyby') { s.ap.mode = 'off'; s.ap.plan = null; } if (v > 0 && s.status === 'docked') s.status = 'flying'; },
  refill: (s) => refill(s),
  save, placeAtShipyard, universe, setHangarModel, hcam,
  flyShip: (id) => { G_.activeId = id; save(); },
  toggleWarpDrive: () => { const s = activeShip(); if (s) toggleWarpDrive(s); },
  stageNow: () => { const s = activeShip(); if (s) stageNow(s); },
  cycleCamera, get camMode() { return cam.mode; },
  togglePause: () => { paused = !paused; }, get paused() { return paused; },
  setBloom: (on) => { bloom.enabled = on; },
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h); hComposer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  hangarCam.aspect = w / h; hangarCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let fireButton = false;
function refill(s) {
  const E = ENGINES[s.engine];
  s.fuel = PH.fuelCapacity(s); s.fuel2 = E.staged ? E.stage2.fuel : (E.fuel2 || 0); s.stage = 1; s.hull = 1; s._hullWarned = false;
  s.missiles = undefined; s.energy = undefined;
}
function teleport(s, b) {
  if (!b) return;
  if (b.type === 'station') { placeAtShipyard(s); ui.toast(`${s.name} docked at the shipyard`); return; }
  const st = PH.bodyState(b, G_.t);
  const R = PH.targetArrivalRadius(b) * 1.5;
  const a = Math.random() * Math.PI * 2;
  const rh = [Math.cos(a), 0, Math.sin(a)];
  const vc = b.mass ? Math.sqrt(G * b.mass / R) : 0;
  const tang = PH.cross([0, 1, 0], rh);
  s.sys = b.sys.id; s.p = PH.add(st.p, PH.mul(rh, R)); s.u = PH.uOfVel(PH.add(st.v, PH.mul(tang, vc)));
  s.status = 'orbit'; s.orbiting = b.id; s.warpOn = false; s.throttle = 0; s.ap.mode = 'off'; s.ap.plan = null; s.ap.target = b.id;
  combat.clear();
  ui.toast(`Teleported into orbit around ${b.name} (${b.sys.name})`, 'good');
}
function onKill() {
  G_.kills = (G_.kills || 0) + 1;
  ui.toast(`Drone destroyed · ${G_.kills} kills`, 'good');
  const c = CONTRACTS.find(x => x.kind === 'kills');
  if (c && G_.kills - (G_.killsBase || 0) >= c.count) { G_.killsBase = G_.kills; completeContract(c, activeShip()); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!G_) { renderIdle(rdt); return; }
  const ship = activeShip();

  if (ui.hqOpen || !ship) {
    renderHangar(rdt);
    ui.updateHQ();
    return;
  }
  if (camera.view && camera.view.enabled) camera.clearViewOffset();
  ensureView(ship);
  const tBefore = G_.t;
  if (!paused && !ui.mapOpen) {
    manualControl(ship, rdt);
    simulate(ship, rdt);
  } else if (ui.mapOpen && !paused) {
    simulate(ship, rdt);
  }
  if (!activeShip()) return;
  if (G_.sandbox && G_.settings.infiniteFuel) { const E = ENGINES[ship.engine]; ship.fuel = PH.fuelCapacity(ship); if (!E.staged && E.fuel2) ship.fuel2 = E.fuel2; }
  ship.velocity = PH.velOfU(ship.u);
  ship.fwd = fwdOf(ship);
  updateCamera(ship, rdt);
  universe.relOptics = G_.settings.relOptics;
  universe.update(ship, G_.t, rdt, camera, sun);
  const cRes = combat.update({
    ship, view, realDt: paused ? 0 : rdt, gameDt: G_.t - tBefore,
    gravity: PH.gravityAt(ship.p, PH.systemState(SYS_BY_ID[ship.sys], G_.t)),
    starFlux: starFlux(ship, G_.t), fire: !paused && (keys.has('f') || fireButton), onKill,
  });
  view.update(rdt, { ...lastFx, firing: lastFx.firing && !paused, warp: ship.warpOn, timeWarp: WARPS[warpIdx], stage: ship.stage, aimWorld: cRes.aimWorld });
  // lensing
  const L = universe.lensing;
  if (L) {
    const p = L.pos.clone().project(camera);
    const inFront = L.pos.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    lensPass.uniforms.uOn.value = inFront ? 1 : 0;
    lensPass.uniforms.uCenter.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    lensPass.uniforms.uThetaE.value = L.thetaE; lensPass.uniforms.uShadow.value = L.shadow;
    lensPass.uniforms.uAspect.value = camera.aspect; lensPass.uniforms.uTanHalf.value = Math.tan(camera.fov * Math.PI / 360);
  } else lensPass.uniforms.uOn.value = 0;
  syncShipCam();
  composer.render();
  ui.updateHUD(ship, camera);
  if (performance.now() - saveTimer > 10000) { saveTimer = performance.now(); save(); }
}

function renderHangar(rdt) {
  if (!hangarView) setHangarModel('amed', 'explorer');
  if (hcam.spin) hcam.yaw += rdt * 0.12;
  const D = hcam.dist;
  hangarCam.position.set(Math.sin(hcam.yaw) * Math.cos(hcam.pitch) * D, Math.sin(hcam.pitch) * D, Math.cos(hcam.yaw) * Math.cos(hcam.pitch) * D);
  const wide = window.innerWidth > 900;
  hangarCam.lookAt(0, 0, 0);
  if (wide) hangarCam.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight);
  else hangarCam.clearViewOffset();
  hangarView.update(rdt, { firing: false, throttle: 0 });
  hangarView.root.rotation.set(0, 0, 0);
  hComposer.render();
}

let idleT = 0;
function renderIdle(rdt) {
  // title screen: slow orbit around an AMED in deep space
  idleT += rdt;
  if (!hangarView) setHangarModel('amed', 'explorer');
  const ghost = { sys: 'sol', p: [AU * 3, AU * 0.4, AU * 2], u: [0, 0, 0], q: [0, 0, 0, 1], velocity: [0, 0, 0], fwd: [0, 0, 1], warpOn: false };
  if (!view || viewKey !== 'title') {
    if (view) shipRoot.remove(view.root);
    view = buildShip('amed', 'explorer'); shipRoot.add(view.root); viewKey = 'title';
    view.root.traverse(o => o.layers.set(1));
    const r = view.radius * 1.3; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 4 * r + 2000 }); sun.shadow.camera.updateProjectionMatrix();
  }
  const D = 760;
  if (window.innerWidth > 800) camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight); else camera.clearViewOffset();
  camera.position.set(Math.sin(idleT * 0.05 + 2) * D, 120 + Math.sin(idleT * 0.1) * 60, Math.cos(idleT * 0.05 + 2) * D);
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
  shipRoot.quaternion.set(0, 0, 0, 1);
  universe.update(ghost, 0, rdt, camera, sun);
  const ld = sun.position.clone().normalize(); sun.position.copy(ld.multiplyScalar(view.radius * 2 + 400));
  view.update(rdt, { firing: true, throttle: 0.8, phase: 'P2', ram: true, pulse: false });
  lensPass.uniforms.uOn.value = 0;
  syncShipCam();
  composer.render();
}
function syncShipCam() {
  shipCam.position.copy(camera.position); shipCam.quaternion.copy(camera.quaternion);
  shipCam.projectionMatrix.copy(camera.projectionMatrix); shipCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  shipCam.updateMatrixWorld();
}

// debug/testing hook
window.__sdw = { combat, teleport: (id) => teleport(activeShip(), PH.bodyById(id)), get game() { return G_; }, ui, PH, setWarp, cam, hcam, unlockAll() { G_.unlocked = Object.keys(ENGINES); G_.credits = 1e5; G_.rep = 99; } };

resize();
requestAnimationFrame(frame);
ui.showIntro();
