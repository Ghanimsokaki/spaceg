// ─────────────────────────────────────────────────────────────────────────────
//  Procedural starship models. Forward = +Z, engines at −Z. Units: metres.
//  Static parts are merged per material (few draw calls); animated parts
//  (habitat rings, pusher plates, iris door, stages) stay separate.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hullTextures, foilTextures, radiatorTextures, solarTexture, hexTexture } from './textures.js';
import { makeExhaust, makePulseSystem, makeField, makeCore } from './effects.js';

// ── materials ────────────────────────────────────────────────────────────────
const matCache = new Map();
function texRep(t, rep) { if (!t) return t; const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; return c; }

export function mat(name, rep = [1, 1]) {
  const key = name + ':' + rep.join('x');
  if (matCache.has(key)) return matCache.get(key);
  let m;
  const S = (o) => new THREE.MeshStandardMaterial(o);
  switch (name) {
    case 'hull': { const t = hullTextures('light', { base: [206, 209, 214], seed: 3 }); m = S({ color: 0xffffff, map: texRep(t.map, rep), roughnessMap: texRep(t.roughnessMap, rep), bumpMap: texRep(t.bumpMap, rep), bumpScale: 1.2, metalness: 0.25, roughness: 0.85 }); break; }
    case 'hullDark': { const t = hullTextures('dark', { base: [72, 76, 84], seed: 7, dark: true }); m = S({ color: 0xffffff, map: texRep(t.map, rep), roughnessMap: texRep(t.roughnessMap, rep), bumpMap: texRep(t.bumpMap, rep), bumpScale: 1.2, metalness: 0.55, roughness: 0.8 }); break; }
    case 'accent': { const t = hullTextures('accent', { base: [214, 118, 43], seed: 11, decals: false }); m = S({ color: 0xffffff, map: texRep(t.map, rep), roughnessMap: texRep(t.roughnessMap, rep), metalness: 0.2, roughness: 0.7 }); break; }
    case 'graphite': { const t = hullTextures('graphite', { base: [38, 40, 44], seed: 5, dark: true, decals: false }); m = S({ color: 0xffffff, map: texRep(t.map, rep), bumpMap: texRep(t.bumpMap, rep), bumpScale: 1.5, metalness: 0.6, roughness: 0.55 }); break; }
    case 'metal': m = S({ color: 0xa3a9b1, metalness: 0.9, roughness: 0.32 }); break;
    case 'darkMetal': m = S({ color: 0x3b3f45, metalness: 0.8, roughness: 0.42 }); break;
    case 'tungsten': m = S({ color: 0x7b7f86, metalness: 0.95, roughness: 0.36 }); break;
    case 'nozzle': m = S({ color: 0x2c2b2a, metalness: 0.85, roughness: 0.45, side: THREE.DoubleSide }); break;
    case 'gold': { const f = foilTextures(); m = S({ color: 0xffffff, map: texRep(f.map, rep), bumpMap: texRep(f.bumpMap, rep), bumpScale: 2, metalness: 1, roughness: 0.32 }); break; }
    case 'silverFoil': { const f = foilTextures(); m = S({ color: 0xe8ecf5, bumpMap: texRep(f.bumpMap, rep), bumpScale: 2, metalness: 1, roughness: 0.28 }); break; }
    case 'copper': m = S({ color: 0xc8793f, metalness: 1, roughness: 0.26 }); break;
    case 'rubber': m = S({ color: 0x2b2b2d, metalness: 0.1, roughness: 0.9 }); break;
    case 'boron': m = S({ color: 0x34302d, metalness: 0.2, roughness: 0.85 }); break;
    case 'frost': m = S({ color: 0xeef4fb, metalness: 0.1, roughness: 0.75, emissive: 0x0a1a2a, emissiveIntensity: 0.4 }); break;
    case 'lithium': m = S({ color: 0xc9ccd4, metalness: 1, roughness: 0.18 }); break;
    case 'solar': m = S({ map: texRep(solarTexture(), rep), metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }); break;
    case 'mirror': m = S({ map: texRep(hexTexture(), rep), color: 0xd8e2ee, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }); break;
    case 'glowCyan': m = S({ color: 0x002a33, emissive: 0x00e5ff, emissiveIntensity: 1.5 }); break;
    case 'glowBlue': m = S({ color: 0x001033, emissive: 0x3a8bff, emissiveIntensity: 1.8 }); break;
    case 'glowMagenta': m = S({ color: 0x2a0020, emissive: 0xff3fbf, emissiveIntensity: 2.5 }); break;
    case 'glowOrange': m = S({ color: 0x2a1000, emissive: 0xff8a2a, emissiveIntensity: 2.5 }); break;
    case 'glowGreen': m = S({ color: 0x0a2010, emissive: 0x7dff9a, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }); break;
    case 'window': m = S({ color: 0x111111, emissive: 0xffd8a0, emissiveIntensity: 1.3 }); break;
    case 'navRed': m = new THREE.MeshBasicMaterial({ color: 0xff2020 }); break;
    case 'navGreen': m = new THREE.MeshBasicMaterial({ color: 0x20ff40 }); break;
    case 'navWhite': m = new THREE.MeshBasicMaterial({ color: 0xffffff }); break;
    default: m = S({ color: 0xff00ff });
  }
  m.name = name;
  if (m.isMeshStandardMaterial) m.envMapIntensity = name === 'mirror' ? 1.4 : name === 'gold' || name === 'silverFoil' || name === 'copper' || name === 'lithium' ? 1.1 : 0.7;
  matCache.set(key, m);
  return m;
}

// ── geometry helpers (all oriented so the "axis" is +Z) ──────────────────────
const tmpM = new THREE.Matrix4();
function zGeo(geo) { geo.rotateX(Math.PI / 2); return geo; }

class Builder {
  constructor() { this.group = new THREE.Group(); this.buckets = new Map(); }
  // static (merged) geometry
  put(geo, m) {
    if (!this.buckets.has(m)) this.buckets.set(m, []);
    const g = geo.index ? geo : geo; // all built-ins are indexed
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    this.buckets.get(m).push(g);
    return g;
  }
  finalize(parent = this.group) {
    for (const [m, geos] of this.buckets) {
      const merged = mergeGeometries(geos.map(g => g.index ? g : g), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = mesh.receiveShadow = !(m.isMeshBasicMaterial);
      parent.add(mesh);
    }
    this.buckets.clear();
    return parent;
  }
  cyl(rTop, rBot, h, z, m, { seg = 32, open = false, x = 0, y = 0 } = {}) {
    const g = zGeo(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)); g.translate(x, y, z); return this.put(g, m);
  }
  lathe(pts, m, { seg = 48, z = 0, x = 0, y = 0 } = {}) {
    const g = zGeo(new THREE.LatheGeometry(pts.map(([r, zz]) => new THREE.Vector2(r, zz)), seg)); g.translate(x, y, z); return this.put(g, m);
  }
  torus(R, r, z, m, { seg = 64, tseg = 16, x = 0, y = 0, arc = Math.PI * 2 } = {}) {
    const g = new THREE.TorusGeometry(R, r, tseg, seg, arc); g.translate(x, y, z); return this.put(g, m);
  }
  box(w, h, d, x, y, z, m, rotZ = 0, rotX = 0, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX); if (rotY) g.rotateY(rotY); if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z); return this.put(g, m);
  }
  sphere(r, x, y, z, m, seg = 32, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)); g.scale(sx, sy, sz); g.translate(x, y, z); return this.put(g, m);
  }
  strut(a, b, r, m, seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A); const L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    tmpM.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM); return this.put(g, m);
  }
  // capsule tank along Z
  tank(r, len, x, y, z, m, seg = 32) {
    this.cyl(r, r, len, z, m, { seg, x, y });
    const cap = new THREE.SphereGeometry(r, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2);
    const c1 = cap.clone(); c1.rotateX(Math.PI / 2); c1.translate(x, y, z + len / 2); this.put(c1, m);
    const c2 = cap.clone(); c2.rotateX(-Math.PI / 2); c2.translate(x, y, z - len / 2); this.put(c2, m);
  }
  // square truss between z0 and z1
  truss(z0, z1, half, rod, m, bays = 8, sides = 4) {
    const pts = [];
    for (let s = 0; s < sides; s++) { const a = s / sides * Math.PI * 2 + Math.PI / sides; pts.push([Math.cos(a) * half, Math.sin(a) * half]); }
    for (let s = 0; s < sides; s++) this.strut([pts[s][0], pts[s][1], z0], [pts[s][0], pts[s][1], z1], rod, m, 6);
    const bl = (z1 - z0) / bays;
    for (let i = 0; i <= bays; i++) {
      const z = z0 + i * bl;
      for (let s = 0; s < sides; s++) {
        const p = pts[s], q = pts[(s + 1) % sides];
        this.strut([p[0], p[1], z], [q[0], q[1], z], rod * 0.7, m, 5);
        if (i < bays) this.strut([p[0], p[1], z], [q[0], q[1], z + bl], rod * 0.5, m, 5);
      }
    }
  }
  ring(R, n, fn) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; fn(Math.cos(a) * R, Math.sin(a) * R, a, i); } }
}

// rotating habitat ring with spokes, windows, modules
function habitatRing(R, tube, spokes, hubR, hubLen, opts = {}) {
  const b = new Builder();
  b.torus(R, tube, 0, mat('hull', [24, 1]), { seg: 128, tseg: 20 });
  b.torus(R + tube * 0.98, tube * 0.09, 0, mat('window'), { seg: 160, tseg: 6 });
  b.torus(R, tube * 0.12, tube * 0.96, mat('window'), { seg: 160, tseg: 6 });
  b.torus(R, tube * 0.12, -tube * 0.96, mat('accent', [8, 1]), { seg: 160, tseg: 6 });
  b.cyl(hubR, hubR, hubLen, 0, mat('hullDark', [2, 1]), { seg: 32 });
  b.torus(hubR * 1.02, hubR * 0.08, hubLen * 0.5, mat('metal'));
  b.torus(hubR * 1.02, hubR * 0.08, -hubLen * 0.5, mat('metal'));
  b.ring(1, spokes, (cx, cy, a) => {
    b.strut([cx * hubR, cy * hubR, 0], [cx * (R - tube * 0.8), cy * (R - tube * 0.8), 0], tube * 0.28, mat('metal'), 10);
    b.cyl(tube * 0.42, tube * 0.42, tube * 1.2, 0, mat('hullDark'), { x: cx * (R * 0.55), y: cy * (R * 0.55), seg: 12 }); // elevator car
  });
  // bulky modules along the ring
  b.ring(R, spokes * 2, (x, y, a) => {
    const g = new THREE.BoxGeometry(tube * 1.5, tube * 0.7, tube * 1.7);
    g.rotateZ(a); g.translate(x, y, 0); b.put(g, mat('hull', [1, 1]));
  });
  if (opts.domes) b.ring(R, spokes, (x, y, a) => {
    const g = new THREE.SphereGeometry(tube * 1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateZ(a - Math.PI / 2); g.translate(x * 1.0, y * 1.0, 0);
    // place on outer surface
    g.translate(Math.cos(a) * tube * 0.6, Math.sin(a) * tube * 0.6, 0);
    b.put(g, mat('glowGreen'));
  });
  const g = b.finalize();
  return g;
}

function navLights(b, pts) {
  const lights = [];
  for (const [x, y, z, kind] of pts) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat(kind));
    m.position.set(x, y, z); lights.push(m);
  }
  return lights;
}

function radiatorMaterial() {
  const t = radiatorTextures();
  return new THREE.MeshStandardMaterial({ envMapIntensity: 0.5, map: t.map, bumpMap: t.bumpMap, bumpScale: 1, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide });
}

// ── payload modules ──────────────────────────────────────────────────────────
function payloadModule(config, z, s, parts) {
  const g = new THREE.Group();
  const b = new Builder();
  if (config === 'probe') {
    b.box(5 * s, 5 * s, 6 * s, 0, 0, z + 3 * s, mat('gold'));
    b.lathe([[0.2, 0], [3.5, 1.4], [3.6, 1.5]].map(([r, zz]) => [r * s, zz * s]), mat('metal'), { z: z + 6 * s });
    b.strut([0, 0, z + 6 * s], [0, 0, z + 9 * s], 0.15 * s, mat('metal'));
    b.strut([2.5 * s, 0, z + 2 * s], [9 * s, 0, z + 2 * s], 0.08 * s, mat('metal'));
  } else if (config === 'explorer') {
    b.cyl(6 * s, 6 * s, 16 * s, z + 8 * s, mat('hull', [3, 1]));
    b.lathe([[6, 0], [5.5, 2], [3, 4.5], [1.6, 5]].map(([r, zz]) => [r * s, zz * s]), mat('hull', [3, 1]), { z: z + 16 * s });
    b.torus(6.05 * s, 0.25 * s, z + 13 * s, mat('window'), { seg: 64, tseg: 6 });
    if (s >= 0.55) {
      const ring = habitatRing(24 * s, 2.8 * s, 4, 6.2 * s, 6 * s);
      ring.position.z = z + 6 * s;
      g.add(ring);
      parts.rings.push({ obj: ring, dir: 1 });
    } else {
      b.ring(6.2 * s, 4, (x, y, a) => b.box(3 * s, 0.15 * s, 9 * s, x * 1.6, y * 1.6, z + 6 * s, mat('solar'), a + Math.PI / 2));
      b.ring(6.2 * s, 4, (x, y) => b.strut([x * 0.9, y * 0.9, z + 6 * s], [x * 1.15, y * 1.15, z + 6 * s], 0.15 * s, mat('metal')));
    }
  } else if (config === 'ark') {
    b.cyl(9 * s, 9 * s, 50 * s, z + 25 * s, mat('hull', [4, 3]));
    b.lathe([[9, 0], [8, 3], [4, 7], [2, 8]].map(([r, zz]) => [r * s, zz * s]), mat('hull', [3, 1]), { z: z + 50 * s });
    b.ring(16 * s, 6, (x, y) => b.tank(5 * s, 18 * s, x, y, z + 25 * s, mat('hullDark', [2, 2])));
    const r1 = habitatRing(60 * s, 5 * s, 6, 9.4 * s, 8 * s, { domes: true }); r1.position.z = z + 10 * s;
    const r2 = habitatRing(60 * s, 5 * s, 6, 9.4 * s, 8 * s, { domes: true }); r2.position.z = z + 40 * s;
    g.add(r1, r2);
    parts.rings.push({ obj: r1, dir: 1 }, { obj: r2, dir: -1 });
  }
  b.finalize(g);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENGINE-SPECIFIC SHIPS
// ─────────────────────────────────────────────────────────────────────────────
function baseParts() { return { rings: [], plumes: [], pulses: null, fields: [], lights: [], radMats: [], plate: null, iris: [], stage1: null, cores: [], glowMats: [] }; }

function buildChem(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  // engine bells
  const bell = [[0.75, 0], [0.9, -0.8], [1.4, -2.4], [1.9, -4.4], [2.2, -6.2]];
  const pos = [[0, 2.4], [2.08, -1.2], [-2.08, -1.2]];
  for (const [x, y] of pos) {
    b.lathe(bell, mat('nozzle'), { x, y, z: -21, seg: 40 });
    b.torus(2.2, 0.08, -27.2, mat('metal'), { x, y, seg: 40, tseg: 6 });
    b.cyl(0.9, 0.7, 2.4, -19.8, mat('darkMetal'), { x, y, seg: 16 });
    const ex = makeExhaust({ length: 55, r0: 2.0, r1: 7.5, core: '#fff4dc', edge: '#ff7a1a', diamonds: 1.2 });
    ex.position.set(x, y, -27.3); root.add(ex); P.plumes.push(ex);
  }
  b.cyl(4.6, 4.2, 4, -18, mat('darkMetal'));
  b.cyl(4.5, 4.5, 38, 1, mat('hull', [4, 4]));
  b.cyl(4.53, 4.53, 1.4, 12, mat('accent', [4, 0.2]));
  b.cyl(4.53, 4.53, 0.5, -10, mat('accent', [4, 0.1]));
  b.cyl(4.6, 4.6, 1.2, 20.6, mat('darkMetal'));
  b.cyl(4.5, 4.5, 8, 25, mat('hull', [4, 1]));
  b.lathe([[4.5, 0], [4.3, 3], [3.6, 6.5], [2.4, 9.5], [1.0, 11.6], [0.2, 12.2]], mat('hull', [4, 1]), { z: 29 });
  b.ring(4.55, 10, (x, y, a) => { if (Math.abs(Math.sin(a)) < 0.6) b.box(0.9, 0.5, 0.05, x, y, 33, mat('window'), a + Math.PI / 2); });
  // grid fins + RCS
  b.ring(4.6, 4, (x, y, a) => {
    b.box(0.25, 3.2, 3.4, x * 1.32, y * 1.32, 26, mat('darkMetal'), a);
    b.box(0.8, 0.8, 0.8, x * 1.02, y * 1.02, 30.5, mat('darkMetal'));
    b.box(0.6, 0.6, 0.6, x * 1.02, y * 1.02, -14, mat('darkMetal'));
    // folded landing legs
    b.box(0.6, 1.2, 18, x * 1.08, y * 1.08, -11, mat('graphite', [1, 3]), a);
    b.box(2.2, 2.2, 0.4, x * 1.08, y * 1.08, -20.5, mat('darkMetal'), a);
  });
  b.finalize(root);
  root.add(payloadModule(config, 41, 0.42, P));
  P.lights = navLights(b, [[4.7, 0, 22, 'navGreen'], [-4.7, 0, 22, 'navRed'], [0, 0, 41.5, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 80, radius: 40, camDist: 110 };
}

function buildNTR(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  b.lathe([[0.9, 0], [1.1, -1], [2.0, -3.5], [3.0, -6.5], [3.6, -9]], mat('nozzle'), { z: -32, seg: 48 });
  b.torus(3.6, 0.12, -41, mat('metal'));
  b.cyl(2.3, 2.3, 7, -28.5, mat('darkMetal'));
  b.ring(2.35, 8, (x, y) => b.cyl(0.18, 0.18, 7, -28.5, mat('copper'), { x, y, seg: 8 }));
  b.lathe([[2.4, 0], [6.5, 2.2], [6.5, 2.8], [2.4, 3.0]], mat('boron'), { z: -25.5 });
  b.truss(-22, 14, 2.4, 0.18, mat('metal'), 10);
  b.cyl(1.2, 1.2, 36, -4, mat('darkMetal'), { seg: 12 });
  b.ring(6.2, 3, (x, y, a) => {
    b.tank(3.8, 22, x, y, -4, mat('gold', [2, 3]));
    b.strut([x * 0.3, y * 0.3, -10], [x, y, -10], 0.25, mat('metal'));
    b.strut([x * 0.3, y * 0.3, 2], [x, y, 2], 0.25, mat('metal'));
    b.torus(3.85, 0.12, -14, mat('metal'), { x, y, seg: 40, tseg: 6 });
    b.torus(3.85, 0.12, 6, mat('metal'), { x, y, seg: 40, tseg: 6 });
  });
  const rm = radiatorMaterial(); P.radMats.push(rm);
  b.box(14, 0.25, 12, 9.5, 0, -18, rm); b.box(14, 0.25, 12, -9.5, 0, -18, rm);
  b.cyl(3.6, 3.6, 12, 20, mat('hull', [3, 1]));
  b.cyl(3.65, 3.65, 0.8, 22, mat('accent', [3, 0.1]));
  b.lathe([[3.6, 0], [3.0, 2.5], [1.4, 4], [1.4, 5.5]], mat('hull', [3, 1]), { z: 26 });
  b.ring(3.65, 8, (x, y, a) => b.box(0.7, 0.4, 0.05, x, y, 24, mat('window'), a + Math.PI / 2));
  b.lathe([[0.2, 0], [3.0, 1.0], [3.1, 1.1]], mat('metal'), { x: 4, y: 3, z: 16 });
  b.strut([3.5, 2, 16], [4, 3, 16.2], 0.12, mat('metal'));
  b.finalize(root);
  const ex = makeExhaust({ length: 70, r0: 3.4, r1: 7, core: '#eef8ff', edge: '#79c4ff', fall: 1.4 });
  ex.position.z = -41.2; root.add(ex); P.plumes.push(ex);
  root.add(payloadModule(config, 31.5, 0.45, P));
  P.lights = navLights(b, [[3.7, 0, 20, 'navGreen'], [-3.7, 0, 20, 'navRed'], [0, 0, -21, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 85, radius: 40, camDist: 120 };
}

function buildIon(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  b.cyl(3.6, 3.6, 18, 1, mat('gold', [3, 2]), { seg: 8 });
  b.cyl(3.7, 3.7, 0.6, 10, mat('hull', [3, 0.1]), { seg: 8 });
  b.cyl(3.7, 3.7, 0.6, -8, mat('hull', [3, 0.1]), { seg: 8 });
  b.ring(3.2, 4, (x, y) => b.sphere(1.9, x * 1.15, y * 1.15, -7, mat('silverFoil')));
  b.cyl(4.6, 4.6, 0.8, -9.6, mat('darkMetal'));
  const grid = [[0, 0]]; for (let i = 0; i < 6; i++) grid.push([Math.cos(i / 6 * Math.PI * 2) * 2.7, Math.sin(i / 6 * Math.PI * 2) * 2.7]);
  for (const [x, y] of grid) {
    b.cyl(1.15, 1.15, 1.6, -10.8, mat('darkMetal'), { x, y, seg: 24 });
    b.cyl(1.0, 1.0, 0.1, -11.65, mat('glowBlue'), { x, y, seg: 24 });
    const ex = makeExhaust({ length: 40, r0: 0.95, r1: 2.8, core: '#e8f0ff', edge: '#2f6bff', fall: 1.1 });
    ex.position.set(x, y, -11.7); root.add(ex); P.plumes.push(ex);
  }
  // solar wings
  for (const side of [1, -1]) {
    b.box(6, 0.4, 0.4, side * 6.6, 0, 1, mat('metal'));
    for (let i = 0; i < 5; i++) {
      const x = side * (10 + i * 8.6);
      b.box(8, 0.12, 13, x, 0, 1, mat('solar', [0.5, 1]));
      b.box(8.2, 0.2, 0.25, x, 0, 7.6, mat('metal'));
      b.box(8.2, 0.2, 0.25, x, 0, -5.6, mat('metal'));
    }
  }
  b.lathe([[0.2, 0], [3.2, 1.3], [3.3, 1.4]], mat('metal'), { z: 10.4 });
  b.strut([0, 0, 10.4], [0, 0, 13], 0.1, mat('metal'));
  b.finalize(root);
  root.add(payloadModule(config, 14, 0.4, P));
  P.lights = navLights(b, [[side(1), 0, 1, 'navGreen'], [side(-1), 0, 1, 'navRed']]);
  function side(s) { return s * 53; }
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 40, radius: 55, camDist: 120 };
}

function buildOrion(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  // moving pusher-plate assembly
  const plate = new THREE.Group(); const pb = new Builder();
  pb.lathe([[0.7, -1.2], [8, -1.0], [16, -0.6], [20, 0], [20.3, 0.6], [19, 1.4], [8, 1.6], [0.7, 1.6], [0.7, -1.2]], mat('graphite', [3, 3]), { z: -31, seg: 72 });
  pb.torus(20.2, 0.5, -30.6, mat('darkMetal'), { seg: 96 });
  pb.torus(11.5, 2.4, -27.8, mat('rubber'), { seg: 64, tseg: 20 });
  pb.torus(15.5, 2.0, -27.8, mat('rubber'), { seg: 64, tseg: 20 });
  pb.ring(9, 6, (x, y) => pb.cyl(0.6, 0.6, 8, -25, mat('metal'), { x, y, seg: 12 }));
  pb.finalize(plate); root.add(plate); P.plate = plate;
  b.ring(9, 6, (x, y) => b.cyl(1.05, 1.05, 10, -16.5, mat('darkMetal'), { x, y, seg: 16 }));
  b.cyl(9.5, 9.5, 1.5, -21, mat('darkMetal', [1, 1]), { seg: 48 });
  // pulse-unit magazine
  b.cyl(1.0, 1.0, 26, -9, mat('darkMetal'), { seg: 16 });
  const mag = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10); mag.rotateX(Math.PI / 2);
  for (let ring = 0; ring < 3; ring++) {
    const R = 3 + ring * 1.8, n = 10 + ring * 6;
    for (let k = 0; k < n; k++) for (let zz = 0; zz < 6; zz++) {
      const a = k / n * Math.PI * 2 + ring * 0.2;
      const g = mag.clone(); g.translate(Math.cos(a) * R, Math.sin(a) * R, -19 + zz * 1.3); b.put(g, mat('accent', [0.2, 0.2]));
    }
  }
  b.ring(10, 12, (x, y) => b.strut([x * 0.95, y * 0.95, -20], [x * 0.95, y * 0.95, -11], 0.25, mat('metal')));
  b.cyl(10, 10, 26, 2, mat('hull', [6, 3]), { seg: 48 });
  b.cyl(10.06, 10.06, 2.2, 10, mat('accent', [6, 0.3]), { seg: 48 });
  b.cyl(10.2, 10.2, 0.8, -11, mat('darkMetal'), { seg: 48 });
  b.cyl(10.2, 10.2, 0.8, 15, mat('darkMetal'), { seg: 48 });
  b.lathe([[10, 0], [9.6, 2], [7, 5], [6.2, 6]], mat('hull', [6, 1]), { z: 15 });
  b.cyl(6.2, 6.2, 8, 25, mat('hullDark', [3, 1]));
  b.lathe([[6.2, 0], [5.6, 2.5], [3.5, 5], [1.2, 6], [0, 6.2]], mat('hull', [3, 1]), { z: 29 });
  b.ring(6.25, 14, (x, y, a) => b.box(0.9, 0.45, 0.05, x, y, 27, mat('window'), a + Math.PI / 2));
  b.ring(10.1, 4, (x, y, a) => { b.box(1.4, 1.4, 1.4, x, y, 12.5, mat('darkMetal')); b.box(0.2, 7, 4.5, x * 1.35, y * 1.35, -2, mat('darkMetal'), a); });
  b.lathe([[0.2, 0], [3.0, 1.0], [3.1, 1.1]], mat('metal'), { x: 0, y: 7.5, z: 22 });
  b.finalize(root);
  root.add(payloadModule(config, 35, 0.6, P));
  P.pulses = makePulseSystem({ z: -62, scale: 26, color: '#fff1cc' });
  root.add(P.pulses);
  P.lights = navLights(b, [[10.3, 0, 2, 'navGreen'], [-10.3, 0, 2, 'navRed'], [0, 0, 35.3, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 70, radius: 40, camDist: 120, pulseInterval: 0.9 };
}

function buildDaedalus(config) {
  const P = baseParts(), root = new THREE.Group();
  // ── stage 1 ──
  const s1 = new THREE.Group(); const b1 = new Builder();
  const hemi = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI / 2; hemi.push([50 * Math.cos(a), -95 + 50 * Math.sin(a)]); }
  b1.lathe(hemi.map(([r, z]) => [Math.max(r, 0.01), z]), mat('hull', [10, 5]), { seg: 96 });
  const inner = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI / 2; inner.push([48.8 * Math.cos(a), -94.5 + 48.8 * Math.sin(a)]); }
  b1.torus(50.2, 1.6, -95, mat('copper'), { seg: 128, tseg: 12 });
  b1.torus(43, 0.9, -70, mat('copper'), { seg: 128, tseg: 8 });
  b1.torus(30, 0.9, -55.5, mat('copper'), { seg: 96, tseg: 8 });
  b1.cyl(8, 8, 40, -28, mat('hull', [3, 3]));
  b1.ring(36, 6, (x, y, a) => {
    b1.sphere(17, x, y, -28, mat('hull', [3, 2]), 40);
    b1.torus(17.1, 0.3, -28, mat('darkMetal'), { x, y, seg: 64, tseg: 6 });
    b1.strut([x * 0.2, y * 0.2, -28], [x * 0.55, y * 0.55, -28], 0.8, mat('metal'));
    b1.strut([x * 0.2, y * 0.2, -45], [x * 0.75, y * 0.75, -42], 0.8, mat('metal'));
    b1.strut([x * 0.6, y * 0.6, -45], [x * 0.95, y * 0.95, -56], 1.0, mat('metal'));
  });
  b1.ring(9, 4, (x, y) => b1.cyl(0.8, 0.8, 18, -50, mat('darkMetal'), { x, y, seg: 10 }));
  b1.truss(-8, 0, 6, 0.4, mat('metal'), 2, 6);
  b1.finalize(s1);
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x110818, emissive: 0xa070ff, emissiveIntensity: 0, side: THREE.BackSide, metalness: 0.4, roughness: 0.6 });
  const innerMesh = new THREE.Mesh(zGeo(new THREE.LatheGeometry(inner.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.01), z)), 96)), innerMat);
  s1.add(innerMesh); P.glowMats.push(innerMat);
  const ex1 = makeExhaust({ length: 420, r0: 34, r1: 52, core: '#f4ecff', edge: '#9b5cff', fall: 1.3 });
  ex1.position.z = -72; s1.add(ex1); P.plumes.push(ex1);
  root.add(s1); P.stage1 = s1;
  // ── stage 2 ──
  const b = new Builder();
  const h2 = []; for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI / 2; h2.push([20 * Math.cos(a), 2 + 20 * Math.sin(a)]); }
  b.lathe(h2.map(([r, z]) => [Math.max(r, 0.01), z]), mat('hull', [5, 2]), { seg: 72 });
  b.torus(20.1, 0.8, 2, mat('copper'), { seg: 96 });
  b.cyl(4, 4, 44, 44, mat('hull', [2, 4]));
  b.ring(14, 4, (x, y) => { b.sphere(8, x, y, 32, mat('hull', [2, 1]), 32); b.strut([x * 0.3, y * 0.3, 32], [x * 0.6, y * 0.6, 32], 0.4, mat('metal')); });
  b.cyl(7, 7, 14, 70, mat('gold', [3, 2]));
  b.ring(7.4, 18, (x, y, a) => b.lathe([[0.9, 0], [0.9, 2], [0.1, 4]], mat('hull'), { x, y, z: 64 + (Math.round(a * 3) % 2) * 6, seg: 12 }));
  b.cyl(1.2, 1.2, 8, 81, mat('metal'));
  b.cyl(16, 16, 0.6, 85, mat('tungsten'), { seg: 64 });
  b.torus(16, 0.35, 85, mat('metal'), { seg: 96 });
  b.lathe([[0.2, 0], [4, 1.4], [4.1, 1.5]], mat('metal'), { x: 9, y: 0, z: 76 });
  b.finalize(root);
  const ex2 = makeExhaust({ length: 160, r0: 13, r1: 22, core: '#f4ecff', edge: '#9b5cff', fall: 1.3 });
  ex2.position.z = 6; ex2.userData.stage2 = true; root.add(ex2); P.plumes2 = [ex2];
  P.lights = navLights(b, [[16.4, 0, 85, 'navGreen'], [-16.4, 0, 85, 'navRed']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 190, radius: 110, camDist: 280 };
}

function buildBussard(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  const coils = [[210, 64], [182, 44], [158, 26]];
  for (const [z, R] of coils) {
    b.torus(R, 2.6, z, mat('copper'), { seg: 128, tseg: 16 });
    b.torus(R - 2.2, 0.6, z, mat('glowCyan'), { seg: 128, tseg: 8 });
    b.ring(R, 8, (x, y) => b.strut([x, y, z], [x * 0.05, y * 0.05, 140], 0.9, mat('metal')));
  }
  b.ring(1, 8, (cx, cy) => { for (let i = 0; i < coils.length - 1; i++) b.strut([cx * coils[i][1], cy * coils[i][1], coils[i][0]], [cx * coils[i + 1][1], cy * coils[i + 1][1], coils[i + 1][0]], 0.7, mat('metal')); });
  b.truss(-140, 142, 3.5, 0.3, mat('metal'), 28);
  b.cyl(2, 2, 282, 1, mat('darkMetal'), { seg: 12 });
  b.cyl(8, 8, 36, 82, mat('hull', [3, 4]));
  b.cyl(8.05, 8.05, 2, 92, mat('accent', [3, 0.3]));
  b.lathe([[8, 0], [6, 4], [3, 6]], mat('hull', [3, 1]), { z: 100 });
  b.ring(8.06, 16, (x, y, a) => b.box(1, 0.5, 0.05, x, y, 96, mat('window'), a + Math.PI / 2));
  b.cyl(12, 12, 3, 58, mat('boron'), { seg: 48 });
  b.torus(20, 7, -80, mat('hullDark', [12, 2]), { seg: 96, tseg: 32 });
  b.ring(20, 18, (x, y, a) => { const g = new THREE.TorusGeometry(7.6, 0.6, 8, 32); g.rotateY(Math.PI / 2); g.rotateZ(a); g.translate(x, y, -80); b.put(g, mat('copper')); });
  b.ring(14, 6, (x, y) => b.strut([x * 0.2, y * 0.2, -80], [x * 0.95, y * 0.95, -80], 0.8, mat('metal')));
  const rm = radiatorMaterial(); P.radMats.push(rm);
  b.ring(1, 4, (cx, cy, a) => { const g = new THREE.BoxGeometry(38, 0.4, 60); g.translate(26, 0, 0); g.rotateZ(a + Math.PI / 4); g.translate(0, 0, -30); b.put(g, rm); });
  for (const [z, R] of [[-120, 10], [-132, 15], [-144, 21]]) { b.torus(R, 1.4, z, mat('copper'), { seg: 96 }); b.ring(R, 6, (x, y) => b.strut([x, y, z], [x * 0.3, y * 0.3, -114], 0.6, mat('metal'))); }
  b.finalize(root);
  root.add(payloadModule(config, 106, 0.8, P));
  const ex = makeExhaust({ length: 320, r0: 9, r1: 34, core: '#eafff7', edge: '#22d3a6', fall: 1.2 });
  ex.position.z = -146; root.add(ex); P.plumes.push(ex);
  const f = makeField({ rFar: 1800, rNear: 64, length: 2600, color: '#3ff0ff' }); f.position.z = 210; root.add(f); P.fields.push({ obj: f, kind: 'ram' });
  const fs = makeField({ rFar: 4200, rNear: 64, length: 3200, color: '#b06bff', flow: 0.25 }); fs.position.z = 210; root.add(fs); P.fields.push({ obj: fs, kind: 'sail' });
  P.lights = navLights(b, [[64, 0, 210, 'navGreen'], [-64, 0, 210, 'navRed'], [0, 0, -146, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 360, radius: 200, camDist: 460 };
}

// ── AMED — built from the dossier's master cutaway ───────────────────────────
function buildAMED(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();

  // 1 · Forward YBCO superconducting ramscoop funnel
  const coils = [[206, 72], [192, 60], [178, 49], [164, 39], [151, 30], [140, 22]];
  coils.forEach(([z, R], i) => {
    b.torus(R, 2.4 - i * 0.12, z, mat('copper'), { seg: 160, tseg: 16 });
    b.torus(R - 2.0, 0.55, z, mat('glowCyan'), { seg: 160, tseg: 8 });
    b.torus(R + 1.6, 0.35, z + 1.2, mat('darkMetal'), { seg: 160, tseg: 6 });
    // cryostat housings on each coil
    b.ring(R, 6, (x, y, a) => b.box(4.2, 4.2, 3.2, x, y, z, mat('hullDark', [0.3, 0.3]), a));
  });
  b.ring(1, 12, (cx, cy) => { for (let i = 0; i < coils.length - 1; i++) b.strut([cx * coils[i][1], cy * coils[i][1], coils[i][0]], [cx * coils[i + 1][1], cy * coils[i + 1][1], coils[i + 1][0]], 0.55, mat('metal')); });
  b.ring(1, 6, (cx, cy) => b.strut([cx * 22, cy * 22, 140], [cx * 9, cy * 9, 116], 1.0, mat('metal')));
  // intake throat and speed-magnet compression coils
  b.cyl(12, 9, 24, 126, mat('hullDark', [3, 2]));
  b.cyl(8.5, 8.5, 76, 76, mat('hull', [3, 8]));
  for (let i = 0; i < 12; i++) {
    const z = 42 + i * 6.2;
    if (Math.abs(z - 88) < 6 || Math.abs(z - 52) < 6) continue;
    b.torus(9.4, 1.0, z, mat('copper'), { seg: 48, tseg: 10 });
    b.torus(9.4, 0.3, z + 1.1, mat('glowCyan'), { seg: 48, tseg: 6 });
  }

  // 2 · Dual counter-rotating 0.8 g centrifuge habitats
  const ringA = habitatRing(56, 5.6, 6, 11, 9, { domes: config === 'ark' });
  ringA.position.z = 88; root.add(ringA);
  const ringB = habitatRing(56, 5.6, 6, 11, 9, { domes: config === 'ark' });
  ringB.position.z = 52; root.add(ringB);
  P.rings.push({ obj: ringA, dir: 1 }, { obj: ringB, dir: -1 });
  b.cyl(13, 13, 3, 70, mat('darkMetal'), { seg: 48 }); // counter-rotation bearing
  b.torus(13, 0.6, 70, mat('accent', [4, 1]), { seg: 64 });

  // 3 · Central spine with conduits
  b.cyl(4.6, 4.6, 236, 20, mat('hullDark', [2, 16]));
  b.ring(6.2, 6, (x, y) => b.cyl(0.7, 0.7, 150, -20, mat('metal'), { x, y, seg: 8 }));

  // 4 · Deuterium / Lithium-6 pellet forge
  b.cyl(14, 14, 36, -18, mat('hullDark', [4, 3]), { seg: 8 });
  b.cyl(14.3, 14.3, 1.4, -1, mat('accent', [4, 0.2]), { seg: 8 });
  b.ring(17, 4, (x, y, a) => {
    b.box(8, 8, 26, x, y, -18, mat('hull', [1, 2]), a);
    b.box(1.2, 4, 0.2, x * 1.25, y * 1.25, -10, mat('glowOrange'), a);
    b.box(1.2, 4, 0.2, x * 1.25, y * 1.25, -18, mat('glowOrange'), a);
    b.box(1.2, 4, 0.2, x * 1.25, y * 1.25, -26, mat('glowOrange'), a);
  });
  b.ring(20, 4, (x, y, a) => { const xx = Math.cos(a + Math.PI / 4) * 20, yy = Math.sin(a + Math.PI / 4) * 20; b.tank(4.4, 24, xx, yy, -18, mat('gold', [2, 2])); b.strut([xx * 0.6, yy * 0.6, -18], [xx * 0.85, yy * 0.85, -18], 0.6, mat('metal')); });

  // 5 · Cryogenic Penning antimatter traps
  b.ring(10, 4, (x, y) => {
    b.tank(3.8, 13, x, y, -58, mat('frost'));
    for (const dz of [-4.5, 0, 4.5]) b.torus(3.95, 0.32, -58 + dz, mat('glowBlue'), { x, y, seg: 40, tseg: 6 });
    b.strut([x * 0.45, y * 0.45, -52], [x * 0.8, y * 0.8, -52], 0.5, mat('metal'));
    b.strut([x * 0.45, y * 0.45, -64], [x * 0.8, y * 0.8, -64], 0.5, mat('metal'));
  });
  b.torus(10, 0.5, -48, mat('metal'), { seg: 48 });
  b.torus(10, 0.5, -68, mat('metal'), { seg: 48 });

  // 6 · Layered radiation shield bulkhead (boron carbide · tungsten · water-ice)
  b.lathe([[4.6, -3], [22, -2], [23, 0], [22, 2], [4.6, 3]], mat('boron'), { z: -78, seg: 64 });
  b.torus(22.5, 1.2, -78, mat('tungsten'), { seg: 96 });
  b.cyl(18, 18, 4, -83, mat('frost'), { seg: 48 });

  // 7 · Glowing thermal radiator wings
  const rm = radiatorMaterial(); P.radMats.push(rm);
  b.ring(1, 4, (cx, cy, a) => {
    const g = new THREE.BoxGeometry(40, 0.5, 34); g.translate(28, 0, 0); g.rotateZ(a + Math.PI / 4); g.translate(0, 0, -104); b.put(g, rm);
    const ed = new THREE.BoxGeometry(40, 1.1, 1.1); ed.translate(28, 0, 17); ed.rotateZ(a + Math.PI / 4); ed.translate(0, 0, -104); b.put(ed, mat('darkMetal'));
    const ed2 = ed.clone(); ed2.translate(0, 0, -34); b.put(ed2, mat('darkMetal'));
  });
  b.cyl(9, 9, 34, -104, mat('hullDark', [3, 3]), { seg: 24 });

  // 8 · Aft bulkhead + liquid-lithium shock absorbers
  b.cyl(23, 23, 2.5, -122, mat('darkMetal'), { seg: 64 });
  b.torus(23, 0.8, -122, mat('accent', [6, 1]), { seg: 96 });
  b.ring(17, 6, (x, y) => b.cyl(1.7, 1.7, 14, -130, mat('darkMetal'), { x, y, seg: 16 }));
  b.finalize(root);

  // moving plate assembly: plate + lithium jackets + inner pistons + iris door
  const plate = new THREE.Group(); const pb = new Builder();
  pb.lathe([[5.2, -2.2], [20, -2.0], [38, -1.2], [46, 0], [46.3, 0.8], [44, 1.8], [20, 2.4], [5.2, 2.4], [5.2, -2.2]], mat('graphite', [6, 6]), { z: -148, seg: 96 });
  pb.torus(46.2, 0.9, -147.6, mat('tungsten'), { seg: 128 });
  pb.torus(5.2, 0.6, -150, mat('tungsten'), { seg: 48 });
  pb.torus(21, 3.2, -143, mat('lithium'), { seg: 96, tseg: 20 });
  pb.torus(31, 2.4, -144, mat('lithium'), { seg: 96, tseg: 20 });
  pb.ring(17, 6, (x, y) => pb.cyl(1.05, 1.05, 12, -139, mat('metal'), { x, y, seg: 12 }));
  pb.finalize(plate);
  // iris detonation door: 8 sliding tungsten-rhenium blades
  for (let i = 0; i < 8; i++) {
    const shape = new THREE.Shape();
    const a0 = -Math.PI / 8 - 0.04, a1 = Math.PI / 8 + 0.04;
    shape.moveTo(0, 0); shape.absarc(0, 0, 5.4, a0, a1, false); shape.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -0.6);
    const blade = new THREE.Mesh(g, mat('tungsten'));
    blade.rotation.z = i / 8 * Math.PI * 2;
    blade.position.z = -148;
    blade.userData.dir = new THREE.Vector3(Math.cos(blade.rotation.z), Math.sin(blade.rotation.z), 0);
    blade.castShadow = true;
    plate.add(blade); P.iris.push(blade);
  }
  root.add(plate); P.plate = plate;

  root.add(payloadModule(config === 'ark' ? 'ark-amed' : 'none', 0, 1, P));
  if (config === 'ark' || config === 'explorer') {
    const cb = new Builder();
    cb.ring(13, 6, (x, y) => cb.tank(3.4, 14, x, y, 112, mat(config === 'ark' ? 'hull' : 'hullDark', [1, 1])));
    cb.finalize(root);
  }
  // fields & exhaust
  const fRam = makeField({ rFar: 1100, rNear: 72, length: 2200, color: '#2fe6ff', flow: 0.8 }); fRam.position.z = 206; root.add(fRam); P.fields.push({ obj: fRam, kind: 'ram' });
  const fSail = makeField({ rFar: 6000, rNear: 72, length: 3600, color: '#b06bff', flow: 0.2 }); fSail.position.z = 206; root.add(fSail); P.fields.push({ obj: fSail, kind: 'sail' });
  const ex = makeExhaust({ length: 380, r0: 7, r1: 40, core: '#e0fbff', edge: '#00c8ff', fall: 1.15 });
  ex.position.z = -150; root.add(ex); P.plumes.push(ex); P.ramPlume = ex;
  P.pulses = makePulseSystem({ z: -182, scale: 34, color: '#cfeaff' });
  root.add(P.pulses);
  P.lights = navLights(b, [[72, 0, 206, 'navGreen'], [-72, 0, 206, 'navRed'], [0, 62, 88, 'navWhite'], [0, -62, 52, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 360, radius: 200, camDist: 470, pulseInterval: 0.32 };
}

function buildAntimatter(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  b.lathe([[0.1, 6], [5, 5], [15, 0], [15, -1], [4.5, -1]], mat('tungsten'), { z: 134, seg: 64 });
  b.cyl(6, 6, 22, 120, mat('hull', [3, 2]));
  b.ring(6.05, 12, (x, y, a) => b.box(0.8, 0.4, 0.05, x, y, 124, mat('window'), a + Math.PI / 2));
  b.truss(-70, 108, 3, 0.28, mat('metal'), 24);
  b.cyl(1.6, 1.6, 178, 19, mat('darkMetal'), { seg: 10 });
  b.torus(15, 3.2, 12, mat('frost'), { seg: 96, tseg: 24 });
  b.ring(15, 12, (x, y, a) => { const g = new THREE.TorusGeometry(3.45, 0.25, 6, 24); g.rotateY(Math.PI / 2); g.rotateZ(a); g.translate(x, y, 12); b.put(g, mat('glowMagenta')); });
  b.ring(4, 4, (x, y) => b.strut([x, y, 12], [x * 3.2, y * 3.2, 12], 0.6, mat('metal')));
  b.ring(15, 4, (x, y, a) => { const xx = Math.cos(a + Math.PI / 4) * 15, yy = Math.sin(a + Math.PI / 4) * 15; b.sphere(7, xx, yy, -22, mat('gold', [2, 1]), 32); b.strut([xx * 0.2, yy * 0.2, -22], [xx * 0.6, yy * 0.6, -22], 0.5, mat('metal')); });
  const rm = radiatorMaterial(); P.radMats.push(rm);
  for (const s of [1, -1]) { b.box(26, 0.3, 90, s * 18, 0, 30, rm); b.strut([s * 3, 0, 75], [s * 31, 0, 75], 0.35, mat('metal')); b.strut([s * 3, 0, -15], [s * 31, 0, -15], 0.35, mat('metal')); }
  b.sphere(4.2, 0, 0, -74, mat('tungsten'), 32);
  const nz = [[-80, 6], [-90, 10], [-100, 14], [-110, 18], [-120, 22]];
  for (const [z, R] of nz) { b.torus(R, 1.2, z, mat('copper'), { seg: 96 }); b.torus(R - 1.2, 0.35, z, mat('glowMagenta'), { seg: 96, tseg: 6 }); }
  b.ring(1, 6, (cx, cy) => { for (let i = 0; i < nz.length - 1; i++) b.strut([cx * nz[i][1], cy * nz[i][1], nz[i][0]], [cx * nz[i + 1][1], cy * nz[i + 1][1], nz[i + 1][0]], 0.5, mat('metal')); b.strut([cx * 6, cy * 6, -80], [cx * 3, cy * 3, -70], 0.6, mat('metal')); });
  b.finalize(root);
  root.add(payloadModule(config, 140, 0.8, P));
  const ex = makeExhaust({ length: 520, r0: 5, r1: 28, core: '#fff0fb', edge: '#ff3fbf', fall: 1.05 });
  ex.position.z = -78; root.add(ex); P.plumes.push(ex);
  const core = makeCore('#ffb0ec', 18); core.position.z = -74; root.add(core); P.cores.push(core);
  P.lights = navLights(b, [[31, 0, 30, 'navGreen'], [-31, 0, 30, 'navRed'], [0, 0, 141, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 280, radius: 140, camDist: 360 };
}

function buildBlackHole(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  const f = 46, R = 140;
  const prof = []; for (let i = 0; i <= 40; i++) { const r = 4 + (R - 4) * (i / 40); prof.push([r, -r * r / (4 * f)]); }
  b.lathe(prof, mat('mirror', [8, 2]), { seg: 128 });
  b.torus(R, 2.2, -R * R / (4 * f), mat('darkMetal'), { seg: 192, tseg: 12 });
  b.torus(R + 2.5, 0.7, -R * R / (4 * f), mat('accent', [16, 1]), { seg: 192, tseg: 8 });
  // backing ribs on the convex side
  b.ring(1, 16, (cx, cy) => {
    for (let i = 0; i < 8; i++) {
      const r0 = 6 + i * (R - 6) / 8, r1 = 6 + (i + 1) * (R - 6) / 8;
      b.strut([cx * r0, cy * r0, -r0 * r0 / (4 * f) + 2.2], [cx * r1, cy * r1, -r1 * r1 / (4 * f) + 2.2], 1.1, mat('darkMetal'), 6);
    }
  });
  for (const rr of [40, 80, 115]) b.torus(rr, 0.8, -rr * rr / (4 * f) + 2.2, mat('darkMetal'), { seg: 128, tseg: 6 });
  // field projector booms holding the hole at the focus
  b.ring(1, 3, (cx, cy) => { b.strut([cx * 60, cy * 60, -60 * 60 / (4 * f) - 0.5], [cx * 5, cy * 5, -f], 0.9, mat('tungsten')); });
  b.torus(5, 0.5, -f, mat('glowCyan'), { seg: 48 });
  b.ring(1, 3, (cx, cy, a) => { const c = Math.cos(a + Math.PI / 3), s = Math.sin(a + Math.PI / 3); b.strut([c * 8, s * 8, -1], [c * 2, s * 2, -f + 3], 0.4, mat('copper')); });
  // spine, feed-mass tanks, radiators, crew
  b.cyl(7, 7, 220, 112, mat('hullDark', [3, 12]));
  b.truss(0, 220, 11, 0.5, mat('metal'), 16, 6);
  b.ring(19, 6, (x, y) => { b.tank(8, 110, x, y, 110, mat('hull', [3, 8])); b.torus(8.1, 0.4, 70, mat('accent', [3, 1]), { x, y, seg: 40, tseg: 6 }); b.torus(8.1, 0.4, 150, mat('accent', [3, 1]), { x, y, seg: 40, tseg: 6 }); });
  const rm = radiatorMaterial(); P.radMats.push(rm);
  b.ring(1, 3, (cx, cy, a) => { const g = new THREE.BoxGeometry(70, 0.6, 80); g.translate(62, 0, 0); g.rotateZ(a + Math.PI / 3); g.translate(0, 0, 40); b.put(g, rm); });
  b.sphere(15, 0, 0, 236, mat('hull', [4, 2]), 48);
  b.torus(15.05, 0.4, 236, mat('window'), { seg: 96, tseg: 6 });
  b.cyl(4, 4, 10, 254, mat('darkMetal'));
  b.finalize(root);
  root.add(payloadModule(config, 258, 1.0, P));
  const core = makeCore('#ffffff', 60); core.position.z = -f; root.add(core); P.cores.push(core);
  const bh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  bh.position.z = -f; root.add(bh);
  const ex = makeExhaust({ length: 1400, r0: 60, r1: 78, core: '#ffffff', edge: '#a9d8ff', fall: 0.9 });
  ex.position.z = -R * R / (4 * f) + 10; root.add(ex); P.plumes.push(ex);
  P.lights = navLights(b, [[R + 3, 0, -R * R / (4 * f), 'navGreen'], [-R - 3, 0, -R * R / (4 * f), 'navRed'], [0, 0, 263, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 380, radius: 260, camDist: 620 };
}

function buildWarp(config) {
  const P = baseParts(), root = new THREE.Group(), b = new Builder();
  const prof = []; for (let i = 0; i <= 30; i++) { const t = i / 30; const z = -70 + 160 * t; const r = 14 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) + 0.2; prof.push([Math.max(r, 0.2), z]); }
  b.lathe(prof, mat('hull', [6, 8]), { seg: 64 });
  b.cyl(14.2, 14.2, 3, 10, mat('accent', [6, 0.3]), { seg: 64 });
  b.ring(13, 12, (x, y, a) => { if (y > 0) b.box(1.2, 0.5, 0.05, x * 0.98, y * 0.98, 58, mat('window'), a + Math.PI / 2); });
  for (const [z, R] of [[8, 72], [-36, 56]]) {
    b.torus(R, 4.2, z, mat('darkMetal'), { seg: 160, tseg: 24 });
    b.torus(R, 0.9, z + 4, mat('metal'), { seg: 160, tseg: 8 });
    b.ring(1, 4, (cx, cy, a) => { const c = Math.cos(a + Math.PI / 4), s = Math.sin(a + Math.PI / 4); b.box(R - 12, 2.2, 8, c * (R / 2 + 6), s * (R / 2 + 6), z, mat('hull', [2, 1]), a + Math.PI / 4); });
  }
  b.ring(8, 2, (x, y) => { b.lathe([[1.2, 0], [1.6, -2], [3.2, -7]], mat('nozzle'), { x, y: 0, z: -66, seg: 32 }); });
  b.finalize(root);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x000814, emissive: 0x5b9bff, emissiveIntensity: 0.4 });
  for (const [z, R] of [[8, 72], [-36, 56]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R - 4.0, 1.2, 12, 160), glowMat); t.position.z = z; root.add(t); }
  P.glowMats.push(glowMat);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); vP=position; gl_Position=projectionMatrix*mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uI; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <logdepthbuf_pars_fragment>
      void main(){
      #include <logdepthbuf_fragment>
      float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))),3.0); float w = 0.5+0.5*sin(vP.z*0.08 - uTime*6.0); vec3 c = mix(vec3(0.3,0.5,1.0), vec3(0.9,0.6,1.0), w); float a = f*uI*(0.6+0.4*w); gl_FragColor = vec4(c*a, a);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  bubble.scale.set(1, 1, 1.4); bubble.visible = false; root.add(bubble); P.bubble = bubble;
  for (const x of [8, -8]) { const ex = makeExhaust({ length: 110, r0: 3, r1: 9, core: '#ffffff', edge: '#7aa8ff' }); ex.position.set(x, 0, -73); root.add(ex); P.plumes.push(ex); }
  root.add(payloadModule(config === 'probe' ? 'probe' : 'none', 90, 0.8, P));
  P.lights = navLights(b, [[76, 0, 8, 'navGreen'], [-76, 0, 8, 'navRed'], [0, 0, 91, 'navWhite']]);
  P.lights.forEach(l => root.add(l));
  return { root, parts: P, length: 170, radius: 120, camDist: 300 };
}

const BUILDERS = { chem: buildChem, ntr: buildNTR, ion: buildIon, orion: buildOrion, daedalus: buildDaedalus, bussard: buildBussard, amed: buildAMED, antimatter: buildAntimatter, blackhole: buildBlackHole, warp: buildWarp };

// ─────────────────────────────────────────────────────────────────────────────
export function buildShip(engine, config) {
  const model = BUILDERS[engine](config);
  const { root, parts } = model;
  root.traverse(o => { if (o.isMesh && !o.material.isShaderMaterial && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  let pulseTimer = 0, time = 0, plateOff = 0, plateVel = 0, irisOpen = 0, stageDrift = null;
  let sailI = 0, ramI = 0, heat = 0;

  model.update = (dt, st) => {
    time += dt;
    const thr = st.throttle || 0;
    // habitat rings: ~0.8 g at 56 m radius → ω = sqrt(a/R) ≈ 0.37 rad/s (slowed visually)
    for (const r of parts.rings) r.obj.rotation.z += r.dir * dt * 0.22;
    // nav lights blink
    parts.lights.forEach((l, i) => { l.visible = ((time + i * 0.37) % 1.6) < 0.15 || l.material.name === 'navWhite' && ((time * 0.8 + i) % 2.2) < 0.08; });
    // plumes
    let plumeI = st.firing ? Math.min(1, 0.25 + thr * 0.85) : 0;
    if (st.pulse) plumeI = 0;
    if (engine === 'amed') plumeI = st.phase === 'P2' && st.firing ? 0.2 + thr * 0.35 : 0;
    if (engine === 'daedalus') {
      const s2 = st.stage === 2;
      parts.plumes.forEach(p => p.userData.set(!s2 ? plumeI : 0, time));
      parts.plumes2.forEach(p => p.userData.set(s2 ? plumeI : 0, time));
      parts.glowMats.forEach(m => m.emissiveIntensity = !s2 ? plumeI * 2.5 : 0);
      if (s2 && parts.stage1 && !stageDrift) { stageDrift = { t: 0 }; }
      if (stageDrift) {
        stageDrift.t += dt;
        parts.stage1.position.z = -stageDrift.t * stageDrift.t * 6 - stageDrift.t * 8;
        parts.stage1.rotation.x = stageDrift.t * 0.02; parts.stage1.rotation.z = stageDrift.t * 0.05;
        if (stageDrift.t > 40 || st.timeWarp > 50) parts.stage1.visible = false;
      }
      if (!s2 && parts.stage1) { parts.stage1.visible = true; parts.stage1.position.set(0, 0, 0); parts.stage1.rotation.set(0, 0, 0); stageDrift = null; }
    } else {
      parts.plumes.forEach(p => p.userData.set(plumeI, time));
    }
    // nuclear pulses (Orion, AMED phase 1/3B)
    if (parts.pulses) {
      if (st.pulse && st.firing) {
        pulseTimer -= dt;
        const interval = (model.pulseInterval || 0.6) / Math.max(0.35, thr);
        if (pulseTimer <= 0) { pulseTimer = interval; parts.pulses.userData.trigger(0.7 + thr * 0.5); plateVel += 9 + 6 * thr; irisOpen = 1; }
      }
      parts.pulses.userData.update(dt);
    }
    // AMED phase-2 ram detonations: rapid small flashes at the iris
    if (engine === 'amed' && st.phase === 'P2' && st.firing) {
      pulseTimer -= dt;
      if (pulseTimer <= 0) { pulseTimer = 0.13; parts.pulses.userData.trigger(0.12 + thr * 0.1); plateVel += 2.5; irisOpen = 1; }
    }
    // pusher plate spring-damper
    if (parts.plate) {
      plateVel += (-plateOff * 60 - plateVel * 9) * dt;
      plateOff += plateVel * dt;
      parts.plate.position.z = Math.max(-0.5, plateOff * 0.35);
    }
    if (parts.iris.length) {
      irisOpen = Math.max(0, irisOpen - dt * 5);
      const o = Math.min(1, irisOpen * 1.6);
      for (const bl of parts.iris) bl.position.set(bl.userData.dir.x * o * 5.6, bl.userData.dir.y * o * 5.6, -148);
    }
    // fields
    const wantSail = st.sail ? 1 : 0, wantRam = st.ram && st.firing ? Math.min(1, 0.4 + thr) : 0;
    sailI += (wantSail - sailI) * Math.min(1, dt * 1.5);
    ramI += (wantRam - ramI) * Math.min(1, dt * 2.5);
    for (const f of parts.fields) {
      const i = f.kind === 'ram' ? ramI * 0.3 : sailI * 0.35;
      f.obj.userData.set(i, time, f.kind === 'ram' ? -1 : -0.4);
      if (f.kind === 'sail') f.obj.scale.setScalar(0.2 + sailI * 0.8);
    }
    // radiators heat up with engine use
    const targetHeat = st.firing ? 0.4 + thr * 0.9 : (st.sail ? 0.5 : 0.08);
    heat += (targetHeat - heat) * Math.min(1, dt * 0.6);
    parts.radMats.forEach(m => m.emissiveIntensity = heat * 1.6);
    // cores (BH / antimatter)
    for (const c of parts.cores) {
      const base = engine === 'blackhole' ? 0.55 : 0.15;
      const k = base + (st.firing ? thr : 0) * (1 - base);
      c.material.opacity = k;
      c.scale.setScalar((engine === 'blackhole' ? 60 : 18) * (0.7 + 0.3 * k) * (1 + 0.04 * Math.sin(time * 40)));
    }
    // warp bubble
    if (parts.bubble) {
      parts.bubble.visible = st.warp;
      parts.bubble.material.uniforms.uI.value = st.warp ? 0.8 : 0;
      parts.bubble.material.uniforms.uTime.value = time;
      parts.glowMats.forEach(m => m.emissiveIntensity = st.warp ? 6 + Math.sin(time * 8) : 0.5);
    }
  };
  return model;
}
