// ─────────────────────────────────────────────────────────────────────────────
//  Procedural textures: hull panelling, MLI gold foil, radiators, solar cells,
//  planets (3D-noise sampled on the sphere so there are no seams), Milky Way.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

// ── seeded RNG + 3D simplex noise ────────────────────────────────────────────
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
export function makeNoise(seed = 1) {
  const r = rng(seed * 9973 + 7);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const F3 = 1 / 3, G3 = 1 / 6;
  function noise3(x, y, z) {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const g = (idx, xx, yy, zz) => { const gg = grad3[idx]; return gg[0] * xx + gg[1] * yy + gg[2] * zz; };
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * g(pm12[ii + perm[jj + perm[kk]]], x0, y0, z0));
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * g(pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1));
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * g(pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2));
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * g(pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3));
    return 32 * (n0 + n1 + n2 + n3);
  }
  function fbm(x, y, z, oct = 5, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  return { noise3, fbm };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Hull panels: colour + roughness + bump, sharing one panel layout ─────────
const hullCache = new Map();
export function hullTextures(key, { base = [200, 204, 210], vary = 14, seed = 3, decals = true, size = 1024, dark = false } = {}) {
  if (hullCache.has(key)) return hullCache.get(key);
  const R = rng(seed);
  const col = canvas(size, size), rough = canvas(size, size), bump = canvas(size, size);
  const cc = col.getContext('2d'), rc = rough.getContext('2d'), bc = bump.getContext('2d');
  cc.fillStyle = `rgb(${base})`; cc.fillRect(0, 0, size, size);
  rc.fillStyle = 'rgb(150,150,150)'; rc.fillRect(0, 0, size, size);
  bc.fillStyle = 'rgb(128,128,128)'; bc.fillRect(0, 0, size, size);

  // recursive panel subdivision
  const panels = [];
  function split(x, y, w, h, d) {
    if (d > 4 || (d > 1 && R() < 0.25) || w < 40 || h < 40) { panels.push([x, y, w, h]); return; }
    if (w > h ? R() < 0.8 : R() < 0.2) { const s = Math.round(w * (0.3 + R() * 0.4) / 8) * 8; split(x, y, s, h, d + 1); split(x + s, y, w - s, h, d + 1); }
    else { const s = Math.round(h * (0.3 + R() * 0.4) / 8) * 8; split(x, y, w, s, d + 1); split(x, y + s, w, h - s, d + 1); }
  }
  const cell = size / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) split(i * cell, j * cell, cell, cell, 0);

  for (const [x, y, w, h] of panels) {
    const v = (R() - 0.5) * vary;
    cc.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v + (R() - 0.5) * 3})`;
    cc.fillRect(x + 1, y + 1, w - 2, h - 2);
    const rv = 110 + R() * 90;
    rc.fillStyle = `rgb(${rv},${rv},${rv})`; rc.fillRect(x + 1, y + 1, w - 2, h - 2);
    // subtle grime gradient
    const gr = cc.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, `rgba(0,0,0,${dark ? 0.12 : 0.06})`);
    cc.fillStyle = gr; cc.fillRect(x + 1, y + 1, w - 2, h - 2);
    // seams
    cc.strokeStyle = dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,44,52,0.45)'; cc.lineWidth = 2; cc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    bc.strokeStyle = 'rgb(40,40,40)'; bc.lineWidth = 3; bc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    rc.strokeStyle = 'rgb(230,230,230)'; rc.lineWidth = 2; rc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // rivets
    if (R() < 0.45) {
      cc.fillStyle = dark ? 'rgba(160,165,175,0.35)' : 'rgba(90,95,105,0.5)';
      bc.fillStyle = 'rgb(200,200,200)';
      const step = 12;
      for (let k = x + 6; k < x + w - 4; k += step) { cc.fillRect(k, y + 4, 2, 2); cc.fillRect(k, y + h - 6, 2, 2); bc.fillRect(k, y + 4, 2, 2); bc.fillRect(k, y + h - 6, 2, 2); }
    }
    // access hatches / vents
    if (R() < 0.08 && w > 60 && h > 60) {
      const hx = x + w * 0.25, hy = y + h * 0.25, hw = w * 0.5, hh = h * 0.5;
      cc.strokeStyle = 'rgba(30,30,35,0.6)'; cc.lineWidth = 1.5; cc.strokeRect(hx, hy, hw, hh);
      bc.strokeStyle = 'rgb(70,70,70)'; bc.lineWidth = 2; bc.strokeRect(hx, hy, hw, hh);
      for (let k = 0; k < 5; k++) { cc.fillStyle = 'rgba(20,20,25,0.5)'; cc.fillRect(hx + 6, hy + 6 + k * (hh - 12) / 5, hw - 12, 3); }
    }
  }
  if (decals) {
    // hazard stripes + stencil text
    for (let n = 0; n < 3; n++) {
      const x = R() * size * 0.8, y = R() * size * 0.9, w = 60 + R() * 120;
      cc.save(); cc.beginPath(); cc.rect(x, y, w, 14); cc.clip();
      for (let k = -20; k < w + 20; k += 16) { cc.fillStyle = '#e8a317'; cc.beginPath(); cc.moveTo(x + k, y); cc.lineTo(x + k + 8, y); cc.lineTo(x + k - 6, y + 14); cc.lineTo(x + k - 14, y + 14); cc.fill(); }
      cc.restore();
    }
    cc.font = 'bold 18px monospace';
    cc.fillStyle = dark ? 'rgba(220,225,235,0.55)' : 'rgba(30,34,42,0.55)';
    const words = ['NO STEP', 'PYRO', 'H₂ VENT', 'EVA HANDHOLD', 'RCS', 'DOCK ▸', 'LOX', 'SDW-' + (100 + seed), 'CAUTION RAD'];
    for (let n = 0; n < 8; n++) cc.fillText(words[Math.floor(R() * words.length)], R() * size * 0.85, 20 + R() * size * 0.95);
  }
  const res = { map: tex(col), roughnessMap: tex(rough, { srgb: false }), bumpMap: tex(bump, { srgb: false }) };
  hullCache.set(key, res);
  return res;
}

// ── crinkled multi-layer insulation foil ─────────────────────────────────────
let foilCache = null;
export function foilTextures() {
  if (foilCache) return foilCache;
  const size = 512, N = makeNoise(77);
  const col = canvas(size, size), bump = canvas(size, size);
  const cc = col.getContext('2d'), bc = bump.getContext('2d');
  const ci = cc.createImageData(size, size), bi = bc.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const nx = Math.cos(u) * 2, ny = Math.sin(u) * 2, nz = Math.cos(v) * 2, nw = Math.sin(v) * 2;
    let n = N.fbm(nx + nw * 0.7, ny + nz * 0.3, nz + nw, 5, 2.3, 0.55);
    const ridge = 1 - Math.abs(N.noise3(nx * 3, ny * 3 + nw * 2, nz * 3));
    n = n * 0.6 + ridge * 0.6;
    const i = (y * size + x) * 4;
    const b = 0.75 + n * 0.35;
    ci.data[i] = Math.min(255, 230 * b); ci.data[i + 1] = Math.min(255, 170 * b); ci.data[i + 2] = Math.min(255, 60 * b); ci.data[i + 3] = 255;
    const bv = 128 + n * 110; bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = bv; bi.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); bc.putImageData(bi, 0, 0);
  foilCache = { map: tex(col, { repeat: [2, 2] }), bumpMap: tex(bump, { repeat: [2, 2], srgb: false }) };
  return foilCache;
}

// ── radiator panels: ribbed, with a heat gradient emissive map ──────────────
let radCache = null;
export function radiatorTextures() {
  if (radCache) return radCache;
  const w = 256, h = 512;
  const col = canvas(w, h), em = canvas(w, h), bump = canvas(w, h);
  const cc = col.getContext('2d'), ec = em.getContext('2d'), bc = bump.getContext('2d');
  cc.fillStyle = '#2b2e33'; cc.fillRect(0, 0, w, h);
  bc.fillStyle = '#808080'; bc.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) {
    cc.fillStyle = '#3c4047'; cc.fillRect(x, 0, 3, h);
    bc.fillStyle = '#e0e0e0'; bc.fillRect(x, 0, 3, h);
    bc.fillStyle = '#303030'; bc.fillRect(x + 4, 0, 2, h);
  }
  for (let y = 0; y < h; y += 64) { cc.fillStyle = '#1a1c20'; cc.fillRect(0, y, w, 3); bc.fillStyle = '#202020'; bc.fillRect(0, y, w, 3); }
  const g = ec.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, '#ffcf8a'); g.addColorStop(0.25, '#ff7a1a'); g.addColorStop(0.6, '#a0200a'); g.addColorStop(1, '#200000');
  ec.fillStyle = g; ec.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { ec.fillStyle = 'rgba(0,0,0,0.55)'; ec.fillRect(x + 3, 0, 5, h); }
  radCache = { map: tex(col), emissiveMap: tex(em), bumpMap: tex(bump, { srgb: false }) };
  return radCache;
}

let solarCache = null;
export function solarTexture() {
  if (solarCache) return solarCache;
  const s = 512, c = canvas(s, s), x = c.getContext('2d');
  x.fillStyle = '#c9ccd2'; x.fillRect(0, 0, s, s);
  const n = 16, cw = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const g = x.createLinearGradient(i * cw, j * cw, (i + 1) * cw, (j + 1) * cw);
    g.addColorStop(0, '#1b2c6b'); g.addColorStop(1, '#0d1a45');
    x.fillStyle = g; x.fillRect(i * cw + 2, j * cw + 2, cw - 4, cw - 4);
    x.strokeStyle = 'rgba(160,170,200,0.35)'; x.lineWidth = 1;
    for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(i * cw + 2, j * cw + k * cw / 4); x.lineTo((i + 1) * cw - 2, j * cw + k * cw / 4); x.stroke(); }
  }
  solarCache = tex(c, { repeat: [1, 4] });
  return solarCache;
}

// hexagonal mirror tiles for the black-hole gamma reflector
let hexCache = null;
export function hexTexture() {
  if (hexCache) return hexCache;
  const s = 512, c = canvas(s, s), x = c.getContext('2d');
  x.fillStyle = '#1a1d22'; x.fillRect(0, 0, s, s);
  const r = 22, hgt = Math.sqrt(3) * r;
  const R = rng(5);
  for (let row = -1; row < s / hgt + 1; row++) for (let col = -1; col < s / (1.5 * r) + 1; col++) {
    const cx = col * 1.5 * r, cy = row * hgt + (col % 2 ? hgt / 2 : 0);
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; x.lineTo(cx + (r - 1.5) * Math.cos(a), cy + (r - 1.5) * Math.sin(a)); }
    x.closePath();
    const v = 150 + R() * 60;
    x.fillStyle = `rgb(${v * 0.85},${v * 0.9},${v})`; x.fill();
  }
  hexCache = tex(c, { repeat: [6, 3] });
  return hexCache;
}

// soft radial sprite
const glowCache = new Map();
export function glowTexture(stops = [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']], key = 'default') {
  if (glowCache.has(key)) return glowCache.get(key);
  const s = 256, c = canvas(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  glowCache.set(key, t);
  return t;
}

// ── planets ──────────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

const planetCache = new Map();
export function planetTexture(kind, seed = 1, W = 1024) {
  const key = kind + ':' + seed;
  if (planetCache.has(key)) return planetCache.get(key);
  const H = W / 2;
  const N = makeNoise(seed * 31 + kind.length * 7);
  const c = canvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H);
  const night = kind === 'earth' ? canvas(W, H) : null;
  const nimg = night ? night.getContext('2d').createImageData(W, H) : null;
  const clouds = (kind === 'earth' || kind === 'ocean') ? canvas(W, H) : null;
  const cimg = clouds ? clouds.getContext('2d').createImageData(W, H) : null;

  for (let j = 0; j < H; j++) {
    const lat = (0.5 - j / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      let col = [128, 128, 128];
      const idx = (j * W + i) * 4;
      switch (kind) {
        case 'earth': case 'ocean': {
          const n = N.fbm(px * 1.6, py * 1.6, pz * 1.6, 6, 2.1, 0.52);
          const det = N.fbm(px * 8, py * 8, pz * 8, 3);
          const sea = kind === 'earth' ? 0.04 : 0.22;
          const ice = smooth(0.78, 0.86, Math.abs(py) + det * 0.05);
          if (n < sea) {
            const dpt = smooth(sea - 0.35, sea, n);
            col = mix3([6, 22, 64], [24, 84, 140], dpt);
            if (n > sea - 0.03) col = mix3(col, [50, 140, 165], 0.5);
          } else {
            const h = (n - sea) / 0.5;
            const dry = smooth(-0.1, 0.35, N.fbm(px * 3 + 5, py * 3, pz * 3, 3) - Math.abs(py) * 0.2 + 0.15 * (1 - Math.abs(Math.abs(lat) - 0.4) * 3));
            col = mix3([42, 92, 38], [176, 150, 100], dry);
            col = mix3(col, [110, 100, 90], smooth(0.35, 0.7, h));
            col = mix3(col, [240, 240, 245], smooth(0.75, 0.95, h));
            col = mix3(col, col.map(v => v * (0.85 + det * 0.3)), 1);
            if (night && n > sea + 0.01) {
              const city = Math.max(0, N.noise3(px * 40, py * 40, pz * 40)) * smooth(0.2, 0.6, N.fbm(px * 6, py * 6, pz * 6, 3) + 0.4) * (1 - ice);
              const cv = Math.min(255, city * 900);
              nimg.data[idx] = cv; nimg.data[idx + 1] = cv * 0.75; nimg.data[idx + 2] = cv * 0.4;
            }
          }
          col = mix3(col, [235, 240, 248], ice);
          if (clouds) {
            const cn = N.fbm(px * 2.5 + 10, py * 4, pz * 2.5, 6, 2.2, 0.55);
            const sw = N.fbm(px * 1.2, py * 1.2 + 3, pz * 1.2, 2);
            const a = smooth(0.0, 0.45, cn + sw * 0.3) * 0.95;
            cimg.data[idx] = cimg.data[idx + 1] = cimg.data[idx + 2] = 255; cimg.data[idx + 3] = a * 255;
          }
          break;
        }
        case 'mars': case 'desert': {
          const n = N.fbm(px * 2, py * 2, pz * 2, 6);
          const d = N.fbm(px * 9, py * 9, pz * 9, 3);
          col = kind === 'mars' ? mix3([120, 50, 25], [205, 110, 60], smooth(-0.3, 0.4, n)) : mix3([140, 100, 60], [225, 190, 130], smooth(-0.3, 0.4, n));
          col = mix3(col, [70, 40, 30], smooth(0.25, 0.6, -n) * 0.6);
          col = col.map(v => v * (0.85 + d * 0.3));
          col = mix3(col, [245, 240, 235], smooth(0.86, 0.92, Math.abs(py) + d * 0.04));
          break;
        }
        case 'moon': case 'mercury': case 'ceres': {
          const n = N.fbm(px * 2, py * 2, pz * 2, 5);
          let cr = 0;
          for (let o = 0; o < 3; o++) { const v = N.noise3(px * (6 + o * 9), py * (6 + o * 9), pz * (6 + o * 9)); cr += Math.pow(Math.max(0, v), 6) * 4 / (o + 1); }
          const mare = kind === 'moon' ? smooth(0.05, 0.25, N.fbm(px * 1.3 + 4, py * 1.3, pz * 1.3, 3)) : 0;
          const base = kind === 'mercury' ? [150, 140, 130] : kind === 'ceres' ? [120, 116, 112] : [165, 165, 165];
          col = base.map(v => v * (0.75 + n * 0.35 + cr * 0.4));
          col = mix3(col, [70, 70, 75], mare * 0.7);
          break;
        }
        case 'venus': case 'titan': {
          const n = N.fbm(px * 1.5, py * 5, pz * 1.5, 5);
          const sw = N.fbm(px * 3 + n, py * 3, pz * 3, 4);
          col = kind === 'venus' ? mix3([200, 160, 90], [245, 225, 175], smooth(-0.4, 0.5, n + sw * 0.4)) : mix3([170, 110, 40], [220, 160, 70], smooth(-0.4, 0.5, n + sw * 0.3));
          break;
        }
        case 'jupiter': case 'saturn': case 'gasgiant': {
          const warp = N.fbm(px * 2, py * 2, pz * 2, 4) * 0.25;
          const turb = N.fbm(px * 6, py * 14, pz * 6, 4) * 0.12;
          const band = Math.sin((py + warp * 0.3 + turb) * (kind === 'saturn' ? 18 : 24)) * 0.5 + 0.5;
          const band2 = Math.sin((py + warp * 0.2) * 7 + 1) * 0.5 + 0.5;
          if (kind === 'jupiter') {
            col = mix3([150, 95, 60], [235, 220, 195], band);
            col = mix3(col, [190, 130, 85], band2 * 0.4);
            // Great Red Spot
            const sx = px - Math.cos(-0.4) * Math.cos(-0.38), sy = py + 0.37, sz = pz - Math.sin(-0.38) * Math.cos(-0.4);
            const sd = Math.sqrt(sx * sx * 1.0 + sy * sy * 4 + sz * sz);
            col = mix3(col, [190, 80, 50], smooth(0.18, 0.08, sd));
          } else if (kind === 'saturn') {
            col = mix3([190, 160, 110], [240, 225, 185], band);
            col = mix3(col, [210, 185, 140], band2 * 0.3);
          } else {
            col = mix3([110, 80, 60], [210, 190, 160], band);
            col = mix3(col, [80, 100, 140], band2 * 0.35);
          }
          break;
        }
        case 'uranus': case 'neptune': {
          const n = N.fbm(px * 2, py * 9, pz * 2, 4);
          col = kind === 'uranus' ? mix3([150, 205, 215], [185, 230, 235], smooth(-0.3, 0.4, n)) : mix3([40, 80, 190], [80, 130, 230], smooth(-0.3, 0.4, n));
          if (kind === 'neptune') {
            const sd = Math.hypot(px - 0.6, (py + 0.35) * 2, pz - 0.7);
            col = mix3(col, [20, 35, 110], smooth(0.25, 0.12, sd));
            col = mix3(col, [230, 240, 255], smooth(0.62, 0.7, N.noise3(px * 5, py * 20, pz * 5)) * 0.6);
          }
          break;
        }
        case 'lava': {
          const n = N.fbm(px * 3, py * 3, pz * 3, 5);
          const cr = 1 - Math.abs(N.noise3(px * 7, py * 7, pz * 7));
          col = mix3([30, 25, 25], [60, 50, 45], smooth(-0.3, 0.5, n));
          col = mix3(col, [255, 120, 30], smooth(0.9, 0.98, cr) * 0.9);
          break;
        }
        case 'ice': {
          const n = N.fbm(px * 2.5, py * 2.5, pz * 2.5, 5);
          const cr = 1 - Math.abs(N.noise3(px * 9, py * 9, pz * 9));
          col = mix3([170, 195, 215], [240, 248, 255], smooth(-0.3, 0.5, n));
          col = mix3(col, [120, 150, 180], smooth(0.92, 0.99, cr) * 0.7);
          break;
        }
      }
      img.data[idx] = col[0]; img.data[idx + 1] = col[1]; img.data[idx + 2] = col[2]; img.data[idx + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const res = { map: tex(c) };
  if (night) { night.getContext('2d').putImageData(nimg, 0, 0); res.night = tex(night); }
  if (clouds) { clouds.getContext('2d').putImageData(cimg, 0, 0); res.clouds = tex(clouds); }
  planetCache.set(key, res);
  return res;
}

export function ringTexture() {
  const w = 1024, c = canvas(w, 4), x = c.getContext('2d');
  const N = makeNoise(9);
  for (let i = 0; i < w; i++) {
    const t = i / w;
    let a = 0.55 + N.noise3(t * 40, 0.5, 0.2) * 0.25 + N.noise3(t * 160, 1.5, 0.1) * 0.15;
    if (t > 0.62 && t < 0.67) a *= 0.08; // Cassini division
    if (t < 0.08) a *= t / 0.08;
    if (t > 0.94) a *= (1 - t) / 0.06;
    const v = 200 + N.noise3(t * 80, 3, 3) * 40;
    x.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},${Math.max(0, Math.min(1, a))})`;
    x.fillRect(i, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Milky Way equirect (galactic longitude/latitude) ────────────────────────
export function milkyWayTexture() {
  const W = 1024, H = 512;
  const c = canvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H);
  const N = makeNoise(2024);
  for (let j = 0; j < H; j++) {
    const b = (0.5 - j / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const l = (i / W) * Math.PI * 2;
      const px = Math.cos(b) * Math.cos(l), py = Math.cos(b) * Math.sin(l), pz = Math.sin(b);
      const ld = Math.min(l, Math.PI * 2 - l); // angular distance from galactic centre in longitude
      const width = 0.10 + 0.10 * Math.exp(-ld * ld * 1.2);
      let band = Math.exp(-(b * b) / (width * width));
      const bulge = Math.exp(-(ld * ld) / 0.25 - (b * b) / 0.05) * 1.6;
      const n = N.fbm(px * 4, py * 4, pz * 4, 6, 2.1, 0.55);
      const dust = smooth(0.0, 0.35, N.fbm(px * 6 + 3, py * 6, pz * 10, 5)) * Math.exp(-(b * b) / (0.03 + 0.001));
      let I = (band * (0.55 + n * 0.5) + bulge) * (1 - dust * 0.8);
      I += Math.max(0, N.fbm(px * 2 + 9, py * 2, pz * 2, 3)) * 0.05;
      I = Math.max(0, I);
      const warm = Math.min(1, bulge * 0.8);
      const r = I * (150 + warm * 80), g = I * (150 + warm * 40), bl = I * (175 - warm * 40);
      const idx = (j * W + i) * 4;
      img.data[idx] = Math.min(255, r); img.data[idx + 1] = Math.min(255, g); img.data[idx + 2] = Math.min(255, bl); img.data[idx + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// blackbody approx (K → linear-ish RGB 0..1)
export function tempColor(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const cl = (v) => Math.max(0, Math.min(255, v)) / 255;
  return [cl(r), cl(g), cl(b)];
}
