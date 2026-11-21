// ─────────────────────────────────────────────────────────────────────────────
//  Surface launch: launch pad on a rotating Earth, a two-stage heavy-lift
//  booster sized to the payload, gravity-turn ascent guidance to low orbit,
//  stage separation, and the pad / booster / sky visuals.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { G, G0 } from './data.js';
import * as PH from './physics.js';
import { mat } from './shipModels.js';
import { makeExhaust } from './effects.js';

export const PAD_BODY = 'sol:Earth';
const SIDEREAL = 86400;               // matches the planet mesh spin
export const ORBIT_ALT = 250e3;

// pad position & velocity on the rotating planet
export function padState(ship, t) {
  const b = PH.bodyById(ship.pad.body);
  const bs = PH.bodyState(b, t);
  const w = 2 * Math.PI / SIDEREAL;
  const th = ship.pad.lon + w * t;
  const up = [Math.cos(th), 0, -Math.sin(th)];
  const R = b.radius + 3 + (ship.pad.h || 0);
  const r = PH.mul(up, R);
  return { b, up, p: PH.add(bs.p, r), v: PH.add(bs.v, [w * r[2], 0, -w * r[0]]) };
}

// Two-stage booster scaled to the payload (≈ 9.8 km/s of Δv: orbit plus gravity losses, with margin)
export function makeBooster(ship) {
  const m0 = PH.shipMass({ ...ship, booster: null });
  const s1 = 14 * m0, s2 = 6 * m0;   // kerosene first stage + hydrolox upper stage, ≈ 9.8 km/s
  return {
    stage: 1,
    s1fuel: s1 * 0.92, s1dry: s1 * 0.08, s2fuel: s2 * 0.92, s2dry: s2 * 0.08,
    F1: 1.45 * G0 * (m0 + s1 + s2), ve1: 3300,
    F2: 1.0 * G0 * (m0 + s2), ve2: 4300,
  };
}
export function boosterMass(b) {
  if (!b) return 0;
  return (b.stage === 1 ? b.s1dry + b.s1fuel : 0) + b.s2dry + b.s2fuel;
}

export function placeOnPad(ship, t) {
  ship.sys = 'sol';
  // launch in the local morning: put the pad ~35° before noon on the sunlit side
  const eb = PH.bodyById(PAD_BODY), es = PH.bodyState(eb, t);
  const sun = PH.norm(PH.mul(es.p, -1));
  const thSun = Math.atan2(-sun[2], sun[0]);
  ship.pad = { body: PAD_BODY, lon: thSun - 0.6 - 2 * Math.PI / SIDEREAL * t };
  ship.booster = null;
  ship.booster = makeBooster(ship);
  const ps = padState(ship, t);
  ship.p = ps.p; ship.u = PH.uOfVel(ps.v);
  ship.q = quatFromTo([0, 0, 1], ps.up);
  ship.status = 'landed'; ship.orbiting = null; ship.throttle = 0; ship.warpOn = false;
  ship.ap.mode = 'off'; ship.ap.plan = null; ship.ap.asc = null;
}

export function quatFromTo(a, b) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...a).normalize(), new THREE.Vector3(...b).normalize());
  return q.toArray();
}

// orbit elements around the pad body
export function orbitOf(ship, t) {
  const b = PH.bodyById(ship.pad ? ship.pad.body : PAD_BODY);
  const bs = PH.bodyState(b, t);
  const mu = G * b.mass;
  const r = PH.sub(ship.p, bs.p), v = PH.sub(PH.velOfU(ship.u), bs.v);
  const R = PH.len(r), V2 = PH.dot(v, v);
  const a = 1 / (2 / R - V2 / mu);
  const h = PH.len(PH.cross(r, v));
  const e = Math.sqrt(Math.max(0, 1 - h * h / (mu * a)));
  return { b, r, v, R, alt: R - b.radius, ap: a > 0 ? a * (1 + e) - b.radius : Infinity, pe: a * (1 - e) - b.radius, vr: PH.dot(v, PH.mul(r, 1 / R)), up: PH.mul(r, 1 / R) };
}

// Closed-loop ascent: after a short vertical climb, each step picks the climb angle
// that holds a target vertical speed against (gravity − centrifugal), so the
// ship pitches over by itself as horizontal speed builds, and levels off into a
// circular orbit at ORBIT_ALT.
export function ascentGuidance(ship, t) {
  const o = orbitOf(ship, t);
  const up = o.up;
  const mu = G * o.b.mass;
  const vr = o.vr;
  const vh = PH.sub(o.v, PH.mul(up, vr));
  const vhL = PH.len(vh);
  let east = PH.cross([0, 1, 0], up);
  east = PH.len(east) < 1e-6 ? [1, 0, 0] : PH.norm(east);
  const hor = vhL > 50 ? PH.mul(vh, 1 / vhL) : east;
  const ap = ship.ap;
  const b = ship.booster;
  const m = PH.shipMass(ship);
  const F = b ? (b.stage === 1 ? b.F1 : b.F2) : PH.rocketParams(ship).F;
  const aT = F / m;
  const vCirc = Math.sqrt(mu / o.R);
  let dir, label;
  if (o.alt < 1200 && vr < 120) { dir = up; label = 'LIFTOFF · VERTICAL CLIMB'; }
  else {
    const vrT = Math.max(-80, Math.min(600, (ORBIT_ALT - o.alt) / 40));
    const gEff = mu / (o.R * o.R) - vhL * vhL / o.R;
    const aUp = (vrT - vr) / 8 + gEff;
    const sUp = Math.max(-0.3, Math.min(1, aUp / Math.max(aT, 1e-6)));
    dir = PH.add(PH.mul(up, sUp), PH.mul(hor, Math.sqrt(Math.max(0, 1 - sUp * sUp))));
    label = vhL < vCirc * 0.6 ? 'GRAVITY TURN' : 'INSERTION BURN';
  }
  if (b && b[(b.stage === 1 ? 's1' : 's2') + 'fuel'] <= 0) label = `STAGE ${b.stage} BURNOUT · PRESS STAGE`;
  ap.ascLabel = label;
  const done = vhL >= vCirc * 0.998 && o.pe >= ORBIT_ALT * 0.75;
  return { dir: PH.norm(dir), thr: done ? 0 : 1, done, orbit: o };
}

// thrust from the booster's active stage (returns null if no booster)
export function boosterOutput(ship, dtau) {
  const b = ship.booster;
  if (!b) return null;
  const out = { F: 0, drag: [0, 0, 0], phase: 'S' + b.stage, pulse: false, ram: false, sail: false, sep: null };
  const thr = ship.throttle;
  if (thr <= 0) return out;
  const F = (b.stage === 1 ? b.F1 : b.F2) * thr, ve = b.stage === 1 ? b.ve1 : b.ve2;
  const key = b.stage === 1 ? 's1fuel' : 's2fuel';
  let dm = F / ve * dtau, f = F;
  if (dm > b[key]) { f = F * b[key] / dm; dm = b[key]; }
  b[key] -= dm;
  out.F = f;
  // burnout: engines go quiet; the pilot decides when to separate (STAGE / Space / G)
  if (b[key] <= 0 && !b['out' + b.stage]) { b['out' + b.stage] = true; out.burnout = b.stage; }
  return out;
}

// Pilot-commanded staging. Returns 1 (stage 1 dropped), 2 (booster jettisoned) or 0.
export function stageBooster(ship) {
  const b = ship.booster;
  if (!b) return 0;
  if (b.stage === 1) { b.stage = 2; return 1; }
  ship.booster = null;
  return 2;
}

// ── visuals ──────────────────────────────────────────────────────────────────
export function buildBoosterView(view) {
  // find the aft end of the ship model (solid parts only)
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  view.root.updateMatrixWorld(true);
  view.root.traverse(o => {
    if (!o.isMesh || o.material.isShaderMaterial || o.material.blending === THREE.AdditiveBlending || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp);
  });
  const size = box.getSize(new THREE.Vector3());
  const rb = Math.max(3.5, Math.min(70, Math.max(size.x, size.y) * 0.28));
  const z0 = box.min.z;
  const g = new THREE.Group();
  const stage = (len, zTop, bells) => {
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, len, 48).rotateX(Math.PI / 2), mat('hull', [4, 6]));
    body.position.z = zTop - len / 2; s.add(body);
    for (const f of [0.12, 0.5, 0.88]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(rb * 1.01, rb * 1.01, rb * 0.25, 48).rotateX(Math.PI / 2), mat(f === 0.5 ? 'accent' : 'darkMetal')); band.position.z = zTop - len * f; s.add(band); }
    const plumes = [];
    for (let i = 0; i < bells; i++) {
      const a = i / bells * Math.PI * 2, rr = bells > 1 ? rb * 0.55 : 0;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.22, rb * 0.4, rb * 0.8, 24, 1, true).rotateX(Math.PI / 2), mat('nozzle'));
      bell.position.set(Math.cos(a) * rr, Math.sin(a) * rr, zTop - len - rb * 0.4); s.add(bell);
      const ex = makeExhaust({ length: rb * 14, r0: rb * 0.38, r1: rb * 1.6, core: '#fff4dc', edge: '#ff8a2a', diamonds: 1 });
      ex.position.set(Math.cos(a) * rr, Math.sin(a) * rr, zTop - len - rb * 0.8); s.add(ex); plumes.push(ex);
    }
    s.traverse(o => { if (o.isMesh && !o.material.isShaderMaterial) { o.castShadow = o.receiveShadow = true; } });
    return { s, plumes, len };
  };
  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(size.x, size.y) * 0.12 + 1, rb, rb * 1.2, 32).rotateX(Math.PI / 2), mat('darkMetal'));
  adapter.position.z = z0 - rb * 0.6;
  const st2 = stage(rb * 4, z0 - rb * 1.2, 1);
  const st1 = stage(rb * 9, z0 - rb * 1.2 - rb * 4 - rb * 1.2, 7);
  // grid fins + legs on stage 1
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(rb * 0.08, rb * 0.8, rb * 1.2), mat('darkMetal'));
    fin.position.set(Math.cos(a) * rb * 1.25, Math.sin(a) * rb * 1.25, z0 - rb * 1.2 - rb * 4 - rb * 2); fin.rotation.z = a; st1.s.add(fin);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(rb * 0.12, rb * 0.2, rb * 3), mat('graphite'));
    leg.position.set(Math.cos(a + 0.78) * rb * 1.05, Math.sin(a + 0.78) * rb * 1.05, z0 - rb * 1.2 - rb * 4 - rb * 1.2 - rb * 8); leg.rotation.z = a + 0.78; st1.s.add(leg);
  }
  const inter = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, rb * 1.2, 32).rotateX(Math.PI / 2), mat('hullDark', [2, 1]));
  inter.position.z = z0 - rb * 1.2 - rb * 4 - rb * 0.6; st1.s.add(inter);
  g.add(adapter, st2.s, st1.s);
  g.traverse(o => o.layers.set(1));
  // distance from the ship's origin down to the stage-1 engine bells
  const bottom = -(z0 - rb * 1.2 - rb * 4 - rb * 1.2 - rb * 9 - rb * 0.8);
  return { group: g, st1, st2, adapter, drift: [], rb, totalLen: rb * 16.6, bottom };
}

export function updateBoosterView(bv, ship, rdt, t) {
  const b = ship.booster;
  const firing = ship.throttle > 0 && b;
  bv.st1.plumes.forEach(p => p.userData.set(firing && b.stage === 1 ? 0.6 + ship.throttle * 0.6 : 0, t));
  bv.st2.plumes.forEach(p => p.userData.set(firing && b.stage === 2 ? 0.5 + ship.throttle * 0.6 : 0, t));
  // separated stages tumble away in the ship frame
  for (const d of bv.drift) {
    d.t += rdt;
    d.obj.position.z = d.z0 - d.t * d.t * 3 - d.t * 6;
    d.obj.rotation.x += rdt * 0.05; d.obj.rotation.y += rdt * 0.03;
    d.obj.children.forEach(c => { if (c.userData.set) c.userData.set(0, t); });
    if (d.t > 25) d.obj.visible = false;
  }
}
export function separate(bv, which) {
  const obj = which === 1 ? bv.st1.s : bv.st2.s;
  bv.drift.push({ obj, t: 0, z0: obj.position.z });
  if (which === 2) bv.adapter.visible = false;
}

export function buildPad() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(90, 100, 6, 48), new THREE.MeshStandardMaterial({ color: 0x8d8f93, roughness: 0.95 }));
  deck.position.y = -3; g.add(deck);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 64), new THREE.MeshStandardMaterial({ color: 0x5f6a4e, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -5.5; g.add(ground);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 220), new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.9 }));
  trench.position.set(0, -3.2, 60); g.add(trench);
  const tower = new THREE.Group();
  const H = 160;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb33a2a, metalness: 0.4, roughness: 0.6 });
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, H, 1.4), steel); leg.position.set(x, H / 2, z); tower.add(leg); }
  for (let y = 8; y < H; y += 10) { const r = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.8, 13.4), steel); r.position.y = y; tower.add(r); }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 50), steel); arm.position.set(0, H * 0.8, -26); tower.add(arm);
  tower.position.set(0, 0, -80); g.add(tower);
  for (const [x, z] of [[150, 40], [-160, -30], [40, 190]]) { const tank = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 12), new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.5 })); tank.position.set(x, 10, z); g.add(tank); }
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

// atmosphere sky dome (drawn just after the Milky Way, dims stars by day)
export function buildSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uUp: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uD: { value: 0 }, uCol: { value: new THREE.Color(0.35, 0.6, 1.0) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uUp; uniform vec3 uSun; uniform float uD; uniform vec3 uCol; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = dot(d, normalize(uUp)); float day = smoothstep(-0.12, 0.25, dot(normalize(uUp), normalize(uSun)));
        float sunGlow = pow(max(dot(d, normalize(uSun)), 0.0), 64.0);
        vec3 zen = uCol * vec3(0.18, 0.32, 0.62), hor = mix(uCol, vec3(1.0), 0.3) * 0.75;
        vec3 c = mix(hor, zen, smoothstep(-0.05, 0.6, h)) * day + vec3(1.0, 0.85, 0.6) * sunGlow * day * 1.5;
        c = mix(c, vec3(0.9, 0.45, 0.2), (1.0 - abs(dot(normalize(uUp), normalize(uSun)) * 2.0 - 0.1)) * 0.0);
        float a = uD * clamp(day * 1.1, 0.0, 1.0) * smoothstep(-0.35, 0.05, h);
        gl_FragColor = vec4(c, a);
      }`,
    // drawn in the opaque pass right after the Milky Way (so planets & ships draw over it), alpha-blended
    transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false, depthTest: false, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9e3, 48, 24), m);
  mesh.renderOrder = -9.5; mesh.frustumCulled = false;
  return mesh;
}
