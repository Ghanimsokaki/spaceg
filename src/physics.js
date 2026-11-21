// ─────────────────────────────────────────────────────────────────────────────
//  Physics: relativistic rocket integration, n-body-on-rails gravity,
//  engine models (incl. AMED three-phase logic), Lambert transfers, autopilot.
//  Ship state uses *proper velocity* u = γv so |v| can never exceed c.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { C, G, AU, LY, RHO_ISM, ENGINES, CONFIGS, SYSTEMS, SYS_BY_ID, PARTS, DEFAULT_PARTS, MAX_PARTS } from './data.js';

// ── tiny vector helpers on [x,y,z] arrays ────────────────────────────────────
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const gammaOfU = (u) => Math.sqrt(1 + dot(u, u) / (C * C));
export const velOfU = (u) => mul(u, 1 / gammaOfU(u));
export const uOfVel = (v) => { const b2 = Math.min(dot(v, v) / (C * C), 1 - 1e-15); return mul(v, 1 / Math.sqrt(1 - b2)); };

// ── bodies ───────────────────────────────────────────────────────────────────
for (const s of SYSTEMS) { s.byName = Object.fromEntries(s.bodies.map(b => [b.name, b])); }
export function bodyById(id) {
  const [sid, name] = id.split(':');
  const s = SYS_BY_ID[sid];
  return s ? s.byName[name] : null;
}

export function bodyState(b, t) {
  if (b.type === 'star' || b.type === 'blackhole') return { p: [0, 0, 0], v: [0, 0, 0] };
  const par = b.parent ? bodyState(b.sys.byName[b.parent], t) : { p: [0, 0, 0], v: [0, 0, 0] };
  const w = 2 * Math.PI / b.period;
  const th = b.phase + w * t;
  const c = Math.cos(th), s = Math.sin(th);
  return {
    p: [par.p[0] + b.a * c, par.p[1], par.p[2] - b.a * s],
    v: [par.v[0] - b.a * w * s, par.v[1], par.v[2] - b.a * w * c],
  };
}

export function systemState(sys, t) {
  return sys.bodies.map(b => ({ b, ...bodyState(b, t) }));
}

export function hillRadius(b) {
  if (!b.a) return Infinity;
  const central = b.parent ? b.sys.byName[b.parent] : b.sys.star;
  if (!b.mass) return 0;
  return b.a * Math.cbrt(b.mass / (3 * central.mass));
}

export function gravityAt(p, states, exclude = null) {
  let ax = 0, ay = 0, az = 0;
  for (const s of states) {
    if (!s.b.mass || s.b === exclude) continue;
    const dx = s.p[0] - p[0], dy = s.p[1] - p[1], dz = s.p[2] - p[2];
    const r2 = dx * dx + dy * dy + dz * dz;
    const r = Math.sqrt(r2);
    const rr = Math.max(r, s.b.radius * 0.5 || 1);
    const k = G * s.b.mass / (rr * rr * r || 1);
    ax += dx * k; ay += dy * k; az += dz * k;
  }
  return [ax, ay, az];
}

// Global position of a body / ship (metres from Sol)
export const globalPos = (sys, p) => add(sys.pos, p);

// ── ship construction ────────────────────────────────────────────────────────
// A ship = a drive section + an ordered stack of parts. Everything physical
// (dry mass, propellant capacity, thrust, shield rating, crew, class, cost)
// is derived from that design by shipSpec().
export function partsFor(ship) {
  return Array.isArray(ship.parts) ? ship.parts : DEFAULT_PARTS[ship.config] || DEFAULT_PARTS.probe;
}
export function specOf(engine, parts) {
  const E = ENGINES[engine];
  let payload = 0, crew = 0, tanks = 0, cargo = 0, shields = 0, rads = 0, partCost = 0;
  let solarMW = 0, reactorMW = 15, storeMJ = 300, solars = 0, straps = 0;
  const weapons = [];
  for (const k of parts) {
    const p = PARTS[k]; if (!p) continue;
    if (p.tank) { tanks++; partCost += E.cost * 0.06; continue; }
    if (p.engine) { straps++; continue; }
    payload += p.mass; crew += p.crew; partCost += p.cost;
    if (k === 'cargo') cargo++;
    if (k === 'shield') shields++;
    if (k === 'radiator') rads++;
    if (p.power) { solarMW += p.power.solar || 0; reactorMW += p.power.reactor || 0; storeMJ += p.power.store || 0; if (p.power.solar) solars++; }
    if (p.weapon) weapons.push(p.weapon);
  }
  const cluster = 1 + 0.5 * Math.min(straps, 4);            // strap-ons are half-size drives
  const extraFuel = E.fuel * 0.25 * tanks;
  const fuelCap = E.fuel * cluster + extraFuel;
  const tankDry = extraFuel * 0.06 + (E.staged ? 0 : E.dry * 0.5 * Math.min(straps, 4));
  let rated = E.rated;
  for (let i = 0; i < shields; i++) rated = Math.min(0.995, rated + (1 - rated) * 0.15);
  const config = parts.includes('colony') ? 'ark' : parts.includes('hab') ? 'explorer' : 'probe';
  return {
    engine, parts, payload: payload + tankDry, crew, fuelCap, rated, config,
    dry: (E.staged ? E.stage2.dry : E.dry) + payload + tankDry,
    thrustMul: cluster * (1 + 0.08 * Math.min(rads, 3)) * (engine === 'ion' ? 1 + 0.2 * Math.min(solars, 4) : 1), cargo: Math.min(cargo, 4),
    straps: Math.min(straps, 4), cluster,
    warp: E.warp || (parts.includes('warpring') ? { maxC: 1000, perLy: 0.002, minAU: 20, cap: 20 } : null),
    solarMW, reactorMW, storeMJ, weapons,
    cost: E.cost + partCost,
  };
}
export function shipSpec(ship) {
  const parts = partsFor(ship);
  const key = ship.engine + '|' + parts.join(',');
  if (ship._specKey !== key || !ship._spec) {
    Object.defineProperty(ship, '_spec', { value: specOf(ship.engine, parts), writable: true, configurable: true, enumerable: false });
    Object.defineProperty(ship, '_specKey', { value: key, writable: true, configurable: true, enumerable: false });
  }
  return ship._spec;
}
export function warpSpec(ship) { return shipSpec(ship).warp; }
export function warpKey(ship) { return ENGINES[ship.engine].warp ? 'fuel2' : 'exotic'; }

export function designProblems(engine, parts) {
  const E = ENGINES[engine], out = [];
  const straps = parts.filter(k => k === 'strapon').length;
  if (straps === 1) out.push('Strap-on engines must be balanced: fit 2, 3 or 4.');
  if (straps > 4) out.push('At most 4 strap-on engines.');
  if (parts.filter(k => k === 'warpring').length > 1) out.push('One warp ring is enough.');
  if (E.staged && straps) out.push('Daedalus is a two-stage design and cannot take strap-ons.');
  if (!parts.filter(k => !PARTS[k].engine && k !== 'warpring').length) out.push('Add at least one module — a probe needs a Science bus or Command module.');
  if (!parts.some(k => k === 'cmd' || k === 'science' || k === 'hab' || k === 'colony')) out.push('Needs a Command module, Science bus, Habitat ring or Colony module to control the ship.');
  if (parts.length > MAX_PARTS) out.push(`At most ${MAX_PARTS} modules.`);
  for (const k of new Set(parts)) { const p = PARTS[k]; if (p.needs && !E.configs.includes(p.needs)) out.push(`${E.name} cannot carry a ${p.name}.`); }
  return out;
}

let shipSerial = 1;
export function newShip(engineKey, configKey, name, parts = null) {
  const E = ENGINES[engineKey];
  const ship = {
    id: 'S' + Date.now().toString(36) + (shipSerial++),
    name, engine: engineKey, config: configKey,
    parts: parts ? parts.slice() : DEFAULT_PARTS[configKey].slice(),
    sys: 'sol', p: [0, 0, 0], u: [0, 0, 0],
    q: [0, 0, 0, 1],
    fuel: 0, fuel2: E.stage2 ? E.stage2.fuel : (E.fuel2 || 0),
    stage: 1, tau: 0, hull: 1, throttle: 0,
    magsail: false, ram: true, warpOn: false, warpC: 50,
    status: 'docked', orbiting: null, maxBeta: 0, trips: 0,
    ap: { mode: 'off', target: null, cruise: 0.5 },
    built: 0,
  };
  const sp = shipSpec(ship);
  ship.config = sp.config;
  ship.fuel = sp.fuelCap;
  ship.exotic = sp.warp && !E.warp ? sp.warp.cap : 0;
  ship.ap.cruise = Math.min(sp.rated * 0.97, 0.99);
  return ship;
}

export function shipMass(ship) {
  const E = ENGINES[ship.engine], sp = shipSpec(ship);
  if (E.staged) return sp.dry + ship.fuel2 + (ship.stage === 1 ? E.dry + ship.fuel : 0);
  const f2 = ship.engine === 'amed' ? ship.fuel2 : 0;
  return sp.dry + ship.fuel + f2;
}
export function shipDryMass(ship) { return shipSpec(ship).dry; }
export function fuelCapacity(ship) { return shipSpec(ship).fuelCap; }
export function fuelFraction(ship) {
  const E = ENGINES[ship.engine], cap = shipSpec(ship).fuelCap;
  if (E.staged) return (ship.fuel + ship.fuel2) / (cap + E.stage2.fuel);
  return ship.fuel / cap;
}

// Rapidity available from rocket propellant (Δφ = ve/c · ln(m0/m1))
export function rapidityAvailable(ship) {
  const E = ENGINES[ship.engine], dry = shipSpec(ship).dry;
  if (E.staged) {
    const s2 = E.stage2;
    let phi = 0;
    if (ship.stage === 1) {
      const m0 = dry + ship.fuel2 + E.dry + ship.fuel;
      phi += (E.ve / C) * Math.log(m0 / (m0 - ship.fuel));
    }
    const m0b = dry + ship.fuel2;
    phi += (s2.ve / C) * Math.log(m0b / dry);
    return phi;
  }
  const m = shipMass(ship);
  return (E.ve / C) * Math.log(m / (m - ship.fuel));
}
export const deltaVofRapidity = (phi) => C * Math.tanh(phi);

export function rocketParams(ship) {
  const E = ENGINES[ship.engine];
  const mul = shipSpec(ship).thrustMul;
  if (E.staged && ship.stage === 2) return { F: E.stage2.thrust * mul, ve: E.stage2.ve, fuelKey: 'fuel2' };
  return { F: E.thrust * mul, ve: E.ve, fuelKey: 'fuel' };
}

// Ram-scoop thrust (Bussard/AMED): mass flux γρAv heated by fusion energy fraction ε
export function ramThrust(E, beta, amOk = true) {
  const v = beta * C, g = 1 / Math.sqrt(1 - beta * beta);
  const eps = E.key === 'amed' ? (amOk ? E.ram.eps : E.ram.eps * 0.35) : E.ram.eps;
  const F = g * RHO_ISM * E.ram.area * v * (Math.sqrt(v * v + 2 * eps * C * C) - v);
  return Math.min(F, E.thrust * 2.2);
}
export function magsailDrag(E, beta) {
  const v = beta * C, g2 = 1 / (1 - beta * beta);
  return RHO_ISM * E.magsail.area * v * v * g2;
}

export const flipBeta = (E) => E.key === 'amed' ? 0.10 : 0.012;

// Proper braking acceleration available at speed β (used for stop-distance profiles)
function brakeAccel(ship, beta, m) {
  const E = ENGINES[ship.engine];
  let a = 0;
  const rp = rocketParams(ship);
  const hasFuel = ship[rp.fuelKey] > 0 && !E.flybyOnly;
  // ram-sail ships ride the magnetic parachute down to flipBeta, then flip and burn
  const rocketOk = hasFuel && (!E.magsail || beta <= flipBeta(E));
  if (rocketOk) a = rp.F / m;
  if (E.magsail) a += magsailDrag(E, beta) / m;
  return a;
}

// Distance needed to come to rest from β (relativistic, numeric, log-spaced).
// Ram-sail ships are integrated in two segments split at the flip speed so the
// sail-only part is never smeared into the flip-and-burn part.
function brakeSegment(ship, m, bHi, bLo, N) {
  let d = 0;
  const r = Math.pow(bLo / bHi, 1 / N);
  let b = bHi;
  for (let i = 0; i < N; i++) {
    const b2 = b * r;
    const bm = Math.sqrt(b * b2);
    const a = brakeAccel(ship, bm, m);
    if (a <= 0) return Infinity;
    const g = 1 / Math.sqrt(1 - bm * bm);
    d += (bm * C) * g * g * g * ((b - b2) * C) / a;
    b = b2;
  }
  return d;
}
export function stopDistance(ship, beta) {
  if (beta <= 0) return 0;
  const E = ENGINES[ship.engine];
  const m = shipMass(ship);
  const bmin = 1e-5;
  const b0 = Math.max(beta, 1e-6);
  let d = 0;
  if (b0 > bmin) {
    const fb = E.magsail ? flipBeta(E) * 0.999 : 0;
    if (fb && b0 > fb) {
      d += brakeSegment(ship, m, b0, fb, 28);
      d += brakeSegment(ship, m, fb, bmin, 30);
    } else d += brakeSegment(ship, m, b0, bmin, 36);
  }
  const a0 = brakeAccel(ship, bmin, m);
  if (a0 <= 0) return Infinity;
  d += (bmin * C) * (bmin * C) / (2 * a0);
  return d;
}

// ── Lambert solver (universal variables) ─────────────────────────────────────
function stumpC(z) { if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z; if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / (-z); return 0.5; }
function stumpS(z) {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6;
}
export function lambert(r1, r2, dt, mu) {
  const R1 = len(r1), R2 = len(r2);
  let cth = dot(r1, r2) / (R1 * R2);
  cth = Math.max(-1, Math.min(1, cth));
  let th = Math.acos(cth);
  if (cross(r1, r2)[1] < 0) th = 2 * Math.PI - th; // prograde about +Y
  if (Math.abs(Math.sin(th)) < 1e-6) th += 1e-4;
  const A = Math.sin(th) * Math.sqrt(R1 * R2 / (1 - Math.cos(th)));
  const y = (z) => R1 + R2 + A * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const F = (z) => { const yy = y(z); if (yy < 0) return -Infinity; return Math.pow(yy / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yy) - Math.sqrt(mu) * dt; };
  let lo = -60, hi = 4 * Math.PI * Math.PI - 1e-5;
  if (A > 0) { let k = 0; while (y(lo) < 0 && k++ < 200) lo += 0.3; }
  if (!(F(hi) > 0)) return null;
  if (F(lo) > 0) { let k = 0; while (F(lo) > 0 && k++ < 60) lo -= 50; if (F(lo) > 0) return null; }
  for (let i = 0; i < 70; i++) { const mid = 0.5 * (lo + hi); if (F(mid) > 0) hi = mid; else lo = mid; }
  const z = 0.5 * (lo + hi), yy = y(z);
  if (!(yy > 0)) return null;
  const f = 1 - yy / R1, g = A * Math.sqrt(yy / mu), gd = 1 - yy / R2;
  const v1 = mul(sub(r2, mul(r1, f)), 1 / g);
  const v2 = mul(sub(mul(r2, gd), r1), 1 / g);
  if (!isFinite(v1[0]) || !isFinite(v2[0])) return null;
  return { v1, v2 };
}

// ── target geometry helpers ──────────────────────────────────────────────────
export function targetArrivalRadius(b) {
  if (b.type === 'station') return 3000;
  if (b.type === 'blackhole') return 60 * b.radius;
  if (b.type === 'star' || b.type === 'star2') return Math.max(b.radius * 20, 0.05 * AU);
  return b.radius * 4 + 2e5;
}

// Relative position of a body from a ship (handles cross-system targets)
export function relToBody(ship, b, t) {
  const st = bodyState(b, t);
  const ss = SYS_BY_ID[ship.sys];
  if (b.sys === ss) return { r: sub(st.p, ship.p), vb: st.v };
  const off = sub(b.sys.pos, ss.pos);
  return { r: add(off, sub(st.p, ship.p)), vb: st.v };
}

// ── engine output ────────────────────────────────────────────────────────────
// Returns forward proper thrust (N), lab-frame drag vector, fuel use and a phase label.
export function engineOutput(ship, dtau, beta, vhat, fwd) {
  const E = ENGINES[ship.engine];
  const out = { F: 0, drag: [0, 0, 0], phase: '', pulse: false, ram: false, sail: false, forge: 0 };
  const thr = ship.throttle;
  const align = dot(fwd, vhat);
  const m = shipMass(ship);

  // magnetic sail / parachute
  if (E.magsail && ship.magsail && beta > 0.002) {
    const D = magsailDrag(E, beta);
    out.drag = mul(vhat, -D);
    out.sail = true;
  }

  const rp = rocketParams(ship);
  const rocket = () => {
    if (thr <= 0 || ship[rp.fuelKey] <= 0) return;
    let F = rp.F * thr;
    let dm = F / rp.ve * dtau;
    if (dm > ship[rp.fuelKey]) { F *= ship[rp.fuelKey] / dm; dm = ship[rp.fuelKey]; }
    ship[rp.fuelKey] -= dm;
    out.F = F;
  };

  switch (E.key) {
    case 'amed': {
      const ramOk = ship.ram && beta >= E.ram.minBeta && align > 0.7;
      if (thr > 0 && ramOk) {
        const amOk = ship.fuel2 > 0;
        out.F = ramThrust(E, beta, amOk) * thr * shipSpec(ship).cluster;
        ship.fuel2 = Math.max(0, ship.fuel2 - E.ram.amRate * thr * dtau);
        out.ram = true;
        out.phase = 'P2';
      } else if (thr > 0 && ship.fuel > 0) {
        rocket();
        out.pulse = true;
        out.phase = (beta > 0.003 && align < -0.3) ? 'P3B' : 'P1';
      }
      if (out.sail) out.phase = out.F > 0 ? out.phase : 'P3A';
      // pellet forge: harvest deuterium from scooped hydrogen
      if ((out.ram || out.sail) && beta > 0.05) {
        const g = 1 / Math.sqrt(1 - beta * beta);
        const mdot = g * RHO_ISM * E.ram.area * beta * C;
        const add_ = mdot * E.ram.forge * dtau;
        ship.fuel = Math.min(shipSpec(ship).fuelCap, ship.fuel + add_);
        out.forge = mdot * E.ram.forge;
      }
      break;
    }
    case 'bussard': {
      const ramOk = ship.ram && beta >= E.ram.minBeta && align > 0.7;
      if (thr > 0 && ramOk) { out.F = ramThrust(E, beta) * thr * shipSpec(ship).cluster; out.ram = true; out.phase = 'RAM'; }
      else if (thr > 0) { rocket(); out.phase = out.F > 0 ? 'BOOST' : ''; }
      if (out.sail && !out.F) out.phase = 'SAIL';
      break;
    }
    case 'daedalus': {
      rocket();
      if (ship.stage === 1 && ship.fuel <= 0) { ship.stage = 2; out.staged = true; }
      out.phase = ship.stage === 1 ? 'S1' : 'S2';
      break;
    }
    default:
      rocket();
      if (E.pulse) out.pulse = out.F > 0;
  }
  out.mass = m;
  return out;
}

// ── autopilot ────────────────────────────────────────────────────────────────
// Modes: off | prograde | retrograde | target | approach | flyby | warp
// Transfer from somewhere inside a body's SOI down to a parking orbit around it
function planInside(ship, target, t, dvAvail) {
  const mu = G * target.mass;
  const ts = bodyState(target, t);
  const r1 = sub(ship.p, ts.p), v0 = sub(velOfU(ship.u), ts.v);
  const R1 = len(r1), Ra = targetArrivalRadius(target) * 0.85;
  const tH = Math.PI * Math.sqrt(Math.pow((R1 + Ra) / 2, 3) / mu);
  const up = [0, 1, 0];
  const acc = rocketParams(ship).F / shipMass(ship);
  let best = null;
  for (const deg of [140, 160, 175, 190, 205, 220]) {
    const r2 = mul(rotateAbout(norm(r1), up, deg * Math.PI / 180), Ra);
    for (let i = 0; i <= 18; i++) {
      const T = tH * Math.pow(10, -0.5 + 0.8 * i / 18);
      const sol = lambert(r1, r2, T, mu);
      if (!sol) continue;
      const vc = mul(norm(cross(up, r2)), Math.sqrt(mu / Ra));
      const dv1 = len(sub(sol.v1, v0)), dv2 = len(sub(sol.v2, vc));
      if (dv1 / acc > 0.3 * T) continue;
      const dv = dv1 + dv2;
      if (!best || dv < best.dv) best = { T, dv, r2 };
    }
  }
  if (!best) return null;
  return { kind: 'lambert', tDep: t, tArr: t + best.T, T: best.T, dv: best.dv, centralId: target.id, legTarget: null, arrRel: best.r2, short: best.dv > dvAvail };
}

export function planTransfer(ship, target, t, states) {
  // choose central body for Lambert: target's parent if target is moon/station, else star
  const sys = SYS_BY_ID[ship.sys];
  if (target.sys !== sys) return { kind: 'direct' };
  const phi = rapidityAvailable(ship);
  const dvAvail = deltaVofRapidity(phi);
  const rel = relToBody(ship, target, t);
  const dist = len(rel.r);
  if (target.type === 'station') return { kind: 'direct' };
  if (dvAvail > 4e5 || ENGINES[ship.engine].ram) return { kind: 'direct' };
  // already inside the target's sphere of influence (e.g. Moon → Earth): transfer around the target itself
  if (target.mass && target.type !== 'star' && target.type !== 'blackhole' && dist < hillRadius(target) * 0.9) {
    if (dist < targetArrivalRadius(target) * 3) return { kind: 'direct' };
    return planInside(ship, target, t, dvAvail) || { kind: 'direct' };
  }
  if (dist < 2e8 && target.type !== 'moon') return { kind: 'direct' };

  let central = target.parent ? sys.byName[target.parent] : sys.star;
  // if target is a moon and we're not inside its parent's sphere of influence, go to the parent first
  if (target.parent && target.type === 'moon') {
    const pr = relToBody(ship, central, t);
    if (len(pr.r) > hillRadius(central) * 0.6) { target = central; central = sys.star; }
  }
  const cs = bodyState(central, t);
  const r1 = sub(ship.p, cs.p);
  const v0 = sub(velOfU(ship.u), cs.v);
  const mu = G * central.mass;
  // departure planet (patched conic): are we inside a planet's sphere of influence?
  let dep = null;
  for (const b of sys.bodies) {
    if ((b.type !== 'planet' && b.type !== 'moon') || b === central || b === target) continue;
    const bs = bodyState(b, t);
    const r = len(sub(ship.p, bs.p));
    if (r < hillRadius(b) * 0.5) dep = { b, r, v: bs.v };
  }
  const R2 = target.a;
  const R1 = len(r1);
  const tH = Math.PI * Math.sqrt(Math.pow((R1 + R2) / 2, 3) / mu);
  const m = shipMass(ship);
  const acc = rocketParams(ship).F / m;
  const Ra = targetArrivalRadius(target);
  // porkchop scan: departure delay (only when parked at a planet) × time of flight
  let synodic = 0;
  if (dep && dep.b.type === 'planet' && target.period && !target.parent) {
    synodic = Math.min(1 / Math.abs(1 / dep.b.period - 1 / target.period), 3.2e7 * 3);
  }
  const nD = synodic ? 36 : 1, nT = synodic ? 24 : 48;
  const vrelDep = dep ? len(sub(velOfU(ship.u), dep.v)) : 0;
  const cands = [];
  let best = null;
  for (let k = 0; k < nD; k++) {
    const td = synodic * k / nD;
    const t0 = t + td;
    const c0 = td ? bodyState(central, t0) : cs;
    let rr1 = r1, depV = dep ? dep.v : null;
    if (td) { const ds = bodyState(dep.b, t0); rr1 = add(sub(ds.p, c0.p), sub(ship.p, bodyState(dep.b, t).p)); depV = ds.v; }
    for (let i = 0; i <= nT; i++) {
      const T = tH * Math.pow(10, -1.6 + 2.0 * i / nT);
      const tb = bodyState(target, t0 + T), ct = bodyState(central, t0 + T);
      const sol = lambert(rr1, sub(tb.p, ct.p), T, mu);
      if (!sol) continue;
      let dv1;
      if (dep) {
        const vinf = len(sub(add(sol.v1, c0.v), depV));
        dv1 = Math.max(0, Math.sqrt(vinf * vinf + 2 * G * dep.b.mass / dep.r) - vrelDep) * 1.12;
      } else dv1 = len(sub(sol.v1, v0));
      const vinf2 = len(sub(sol.v2, sub(tb.v, ct.v)));
      const dv2 = target.mass ? Math.max(0, Math.sqrt(vinf2 * vinf2 + 2 * G * target.mass / Ra) - Math.sqrt(G * target.mass / Ra)) : vinf2;
      const dv = dv1 + dv2;
      if (dv1 / acc > 0.3 * T) continue;
      const c = { T, td, dv, dv1, dv2 };
      cands.push(c);
      if (!best || dv < best.dv) best = c;
    }
  }
  // generous ships go now on fast transfers; frugal ones wait for the cheapest window
  if (!best) return { kind: 'direct' };
  const byTime = (a, b) => (a.td + a.T) - (b.td + b.T);
  let bestFast = cands.filter(c => c.dv <= 0.45 * dvAvail).sort(byTime)[0]
    || cands.filter(c => c.dv <= 0.85 * dvAvail && c.dv <= 1.3 * best.dv).sort(byTime)[0];
  const pick = bestFast || best;
  if (!pick) return { kind: 'direct' };
  return { kind: 'lambert', tDep: t + pick.td, tArr: t + pick.td + pick.T, T: pick.T, dv: pick.dv, centralId: central.id, legTarget: target.id, short: pick.dv > dvAvail };
}

// Leaving a planet (patched conic). Coast in the parking orbit until the point
// where a prograde burn puts the departure hyperbola's asymptote along the wanted
// excess velocity, burn prograde until the energy is reached, then coast out.
function rotateAbout(v, n, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(n, v), s)), mul(n, dot(n, v) * (1 - c)));
}
function escapePlan(ship, v, dep, vWantGlobal, amax) {
  const mu = G * dep.b.mass;
  const rrel = sub(ship.p, dep.p), r = len(rrel);
  const vrel = sub(v, dep.v), vr = len(vrel);
  const eps = vr * vr / 2 - mu / r;
  let vinf = sub(vWantGlobal, dep.v);
  const vi = len(vinf);
  const ap = ship.ap;
  if (eps >= 0.5 * vi * vi * 0.98) { ap._escBurn = false; return { coast: true, dir: norm(vrel) }; }
  const n = norm(cross(rrel, vrel));
  vinf = sub(vinf, mul(n, dot(vinf, n)));
  const vih = norm(vinf);
  const e = 1 + r * vi * vi / mu;
  const nuInf = Math.acos(-1 / e);
  const rb = rotateAbout(vih, n, -nuInf);         // where the burn should be centred
  const rh = mul(rrel, 1 / r);
  let togo = Math.atan2(dot(cross(rh, rb), n), dot(rh, rb));
  if (togo < 0) togo += Math.PI * 2;
  const dvNeed = Math.max(0, Math.sqrt(vi * vi + 2 * mu / r) - vr);
  const tb = dvNeed / Math.max(amax, 1e-9);
  const omega = vr / r;
  const period = 2 * Math.PI / omega;
  const lead = 0.5 * tb * omega;
  const pro = vr > 1 ? mul(vrel, 1 / vr) : norm(vinf);
  if (tb > 0.25 * period) ap._escBurn = true;    // low-thrust: spiral out continuously
  const start = togo - lead;
  if (!ap._escBurn && (start < 0.06 || start > Math.PI * 2 - 0.02)) ap._escBurn = true;
  if (ap._escBurn) return { coast: false, v: add(dep.v, mul(pro, vr + Math.max(dvNeed, 50) * 2)), burning: true };
  return { coast: true, dir: pro, wait: (start / omega) };
}

// highest speed (m/s) from which the ship can still stop within distance d
function desiredSpeed(ship, d, cap) {
  if (d <= 0) return 0;
  const m = shipMass(ship), c0 = ship.ap._vd;
  if (c0 && Math.abs(c0.d - d) < 0.004 * d && Math.abs(c0.m - m) < 0.01 * m && c0.cap === cap) return c0.v;
  const v = desiredSpeedRaw(ship, d, cap);
  ship.ap._vd = { d, m, cap, v };
  return v;
}
function desiredSpeedRaw(ship, d, cap) {
  let lo = 0, hi = Math.min(cap / C, 0.99999);
  const k = ENGINES[ship.engine].magsail ? 0.8 : 0.85;
  if (stopDistance(ship, hi) <= d * k) return hi * C;
  for (let i = 0; i < 22; i++) { const mid = 0.5 * (lo + hi); if (stopDistance(ship, mid) <= d * k) lo = mid; else hi = mid; }
  return lo * C;
}

// Computes desired proper-acceleration vector and whether to deploy the magsail
export function autopilot(ship, t, states, dt, env) {
  const ap = ship.ap;
  const v = velOfU(ship.u);
  const sp = len(v);
  const res = { dir: null, thr: 0, sail: false };
  if (ap.mode === 'off') return null;
  if (ap.mode === 'prograde' || ap.mode === 'retrograde') {
    if (sp > 0.01) res.dir = mul(norm(v), ap.mode === 'prograde' ? 1 : -1);
    res.thr = null; return res;
  }
  const target = ap.target ? bodyById(ap.target) : null;
  if (!target) return null;
  const rel = relToBody(ship, target, t);
  if (ap.mode === 'target') { res.dir = norm(rel.r); res.thr = null; return res; }

  const E = ENGINES[ship.engine];
  const sysCur = SYS_BY_ID[ship.sys];
  const rpNow = rocketParams(ship);
  const amaxNow = (ship[rpNow.fuelKey] > 0 ? rpNow.F : 0) / shipMass(ship);
  const sameSys = target.sys === sysCur;
  const u = sub(v, sameSys ? rel.vb : [0, 0, 0]);
  const dist = len(rel.r);
  const Ra = targetArrivalRadius(target);
  const rhat = mul(rel.r, 1 / (dist || 1));

  // Warp-capable autopilot: hop between systems in the bubble
  if (ap.mode === 'approach' && warpSpec(ship) && (!sameSys || dist > 500 * AU) && ship[warpKey(ship)] > 0) {
    res.dir = rhat; res.thr = 0; res.warp = true; return res;
  }

  let vdes, vdNow = null;
  if (ap.mode === 'flyby') {
    const cap = Math.min(ap.cruise, 0.999) * C;
    vdes = mul(rhat, cap);
  } else {
    // Lambert-guided cruise for low-energy in-system ships
    let usedLambert = false;
    if (ap.plan && ap.plan.kind === 'lambert' && ap.plan.tDep && t < ap.plan.tDep) {
      ap.phaseLabel = 'WINDOW IN ' + Math.ceil((ap.plan.tDep - t) / 86400) + ' D';
      res.thr = 0; res.dir = sp > 1 ? norm(v) : null; return res;
    }
    // parking-orbit transfers: coast the last stretch to periapsis, where the
    // arrival check performs a single orbit-insertion burn (no hovering in the well)
    if (ap.plan && ap.plan.arrRel && t >= ap.plan.tArr - 0.04 * ap.plan.T && t < ap.plan.tArr + 0.5 * ap.plan.T) {
      ap.phaseLabel = 'COASTING TO PERIAPSIS';
      res.thr = 0; res.dir = len(u) > 1 ? norm(mul(u, -1)) : null; return res;
    }
    if (ap.plan && ap.plan.kind === 'lambert' && t < ap.plan.tArr - 0.04 * ap.plan.T) {
      const virt = !!ap.plan.arrRel;            // aiming at a parking-orbit point around the central body
      const leg = virt ? target : bodyById(ap.plan.legTarget);
      const central = bodyById(ap.plan.centralId);
      const lr = relToBody(ship, leg, t);
      const hill = virt ? 0 : Math.max(hillRadius(leg) * 0.5, leg.radius * 60);
      if (len(lr.r) > hill) {
        const cs = bodyState(central, t);
        const ct = bodyState(central, ap.plan.tArr);
        const r2 = virt ? ap.plan.arrRel : sub(bodyState(leg, ap.plan.tArr).p, ct.p);
        const sol = lambert(sub(ship.p, cs.p), r2, ap.plan.tArr - t, G * central.mass);
        if (sol) {
          let vreq = add(sol.v1, cs.v);
          // escaping a departure planet's well: time the burn in the parking orbit
          const dep = env.nearestMassive;
          if (dep && dep.b !== central && dep.b !== leg && dep.inSOI) {
            const esc = escapePlan(ship, v, dep, vreq, amaxNow);
            ap.escaping = true;
            if (esc.coast) { ap.phaseLabel = esc.wait ? 'DEPARTURE BURN IN ' + Math.ceil(esc.wait / 60) + ' MIN' : 'ESCAPING ' + dep.b.name.toUpperCase(); res.thr = 0; res.dir = esc.dir; return res; }
            vreq = esc.v;
          } else ap.escaping = false;
          vdes = sub(vreq, sameSys ? rel.vb : [0, 0, 0]);
          // vdes currently expressed in frame of target; convert back below
          usedLambert = true;
          ap.phaseLabel = ap.escaping ? 'ESCAPE BURN' : 'TRANSFER';
        }
      } else if (!virt && leg !== target) {
        ap.plan = planTransfer(ship, target, t, states); // re-plan for the moon leg
      }
    }
    if (!usedLambert) {
      const d = dist - Ra * 0.6;
      const capFuel = E.ram || E.magsail ? 1 : Math.tanh(Math.max(rapidityAvailable(ship) * 0.5, 0)) ;
      let cap = Math.min(ap.cruise, capFuel, 0.9999) * C;
      if (!E.ram && !E.magsail && !E.flybyOnly) {
        // keep enough propellant to stop: speed such that remaining rapidity covers braking
        const phiNow = Math.atanh(Math.min(len(u) / C, 0.999999));
        const phiLeft = rapidityAvailable(ship);
        cap = Math.min(cap, C * Math.tanh(Math.max(0, (phiLeft + phiNow) * 0.5)));
      }
      cap = Math.max(cap, 50);
      let vd = desiredSpeed(ship, d, cap);
      // inside a planet's sphere of influence, let the ship fall: the speed gained
      // from gravity is removed by one orbit-insertion burn instead of by hovering
      if (target.mass && sameSys && target.type !== 'station' && dist < hillRadius(target) * 0.5) {
        const soi = hillRadius(target) * 0.5;
        const vf2 = 2 * G * target.mass * (1 / Math.max(dist, Ra * 0.9) - 1 / soi);
        if (vf2 > 0) vd = Math.min(Math.sqrt(vd * vd + vf2 * 0.85), cap * 4 + Math.sqrt(vf2));
      }
      vdNow = vd;
      // aim beside a planet (at the parking-orbit radius), never at its centre
      let aimHat = rhat;
      if (target.mass && sameSys && target.type !== 'station' && dist > Ra * 0.5) {
        let perp = sub(u, mul(rhat, dot(u, rhat)));
        if (len(perp) < 1) perp = cross(rhat, [0, 1, 0]);
        if (len(perp) < 1e-6) perp = [1, 0, 0];
        aimHat = norm(add(rel.r, mul(norm(perp), Ra * 0.8)));
      }
      vdes = mul(aimHat, vd);
      ap.phaseLabel = vd < len(u) * 0.98 ? 'BRAKING' : (vd >= cap * 0.99 ? 'CRUISE' : 'ACCELERATING');
      // inside a departure planet's well: climb out on a hyperbola toward the desired asymptote
      const dep = env.nearestMassive;
      if (dep && dep.inSOI) {
        const frame = sameSys ? rel.vb : [0, 0, 0];
        const esc = escapePlan(ship, v, dep, add(vdes, frame), amaxNow);
        if (esc.coast) { ap.phaseLabel = esc.wait ? 'DEPARTURE BURN IN ' + Math.ceil(esc.wait / 60) + ' MIN' : 'ESCAPING ' + dep.b.name.toUpperCase(); res.thr = 0; res.dir = esc.dir; return res; }
        vdes = sub(esc.v, frame);
        ap.phaseLabel = 'ESCAPE BURN';
      }
    }
  }
  // error in velocity → desired acceleration
  const err = sub(vdes, u);
  const errL = len(err);
  const m = shipMass(ship);
  const rp = rocketParams(ship);
  const beta = sp / C;
  let amax = (ship[rp.fuelKey] > 0 ? rp.F : 0) / m;
  if (E.ram && beta >= E.ram.minBeta && ship.ram) amax = Math.max(amax, ramThrust(E, beta) / m);
  if (amax <= 0 && !E.magsail) { res.thr = 0; res.dir = null; return res; }
  const tau = Math.max(dt * 2.5, 2);
  // gravity not modelled by the guidance law gets first call on the thrust budget,
  // the velocity error gets what is left (so a saturated burn never lets the ship fall)
  const gc = env.gNonCentral || [0, 0, 0];
  const gl = len(gc);
  const amaxEff = Math.max(amax, 1e-9);
  const avail = Math.max(amaxEff - gl, amaxEff * 0.15);
  const aE = Math.min(errL / tau, avail);
  let ades = sub(mul(err, aE / (errL || 1)), gc);
  if (env.avoid) ades = add(ades, mul(env.avoid, amaxEff));
  const adl = len(ades) || 1e-12;
  const dead = Math.max(0.3, sp * (E.ram ? 6e-4 : 2e-5));
  if (errL < dead && gl < amaxEff * 0.02 && !env.avoid) { res.thr = 0; res.dir = sp > 1 ? norm(sub(v, sameSys ? rel.vb : [0, 0, 0])) : null; return res; }
  res.dir = mul(ades, 1 / adl);

  // Magnetic-sail braking for AMED/Bussard when decelerating at relativistic speed
  if (E.magsail && beta > 0.02) {
    const braking = dot(res.dir, norm(v)) < -0.6;
    if (braking) {
      res.sail = true;
      const sailA = magsailDrag(E, beta) / m;
      // AMED Phase 3A: ride the parachute down to ~0.10c, keep scoop facing forward
      if (beta > flipBeta(E) || ship[rocketParams(ship).fuelKey] <= 0) { res.dir = norm(v); res.thr = 0; return res; }
    }
  }
  // Ramjets thrust only facing into the flow: in the ram regime stay (nearly) prograde
  // and never spend braking pellets on small sideways corrections
  if (E.ram && ship.ram && beta >= E.ram.minBeta * 0.95) {
    const vh = norm(v);
    const par = dot(err, vh);
    if (par > -dead) {
      const perp = sub(err, mul(vh, par));
      const pl = len(perp);
      const frac = Math.min(0.6, pl / (Math.abs(par) + pl + 1e-9));
      res.dir = norm(add(vh, pl > 0 ? mul(perp, frac / pl) : [0, 0, 0]));
      const ramA = ramThrust(E, beta, ship.fuel2 > 0) / m;
      res.thr = Math.min(1, Math.max(par, pl * 0.5) / tau / Math.max(ramA, 1e-9));
      if (res.thr < 0.01) res.thr = 0;
      return res;
    }
  }
  // Ram-sail ships keep their pellets for Phase 1 (boost to ram ignition) and Phase 3B (final brake)
  if (E.ram && beta > flipBeta(E)) {
    const boosting = beta < E.ram.minBeta && (ap.mode === 'flyby' || (vdNow !== null && vdNow > 1.3 * E.ram.minBeta * C));
    if (!boosting) { res.thr = 0; res.dir = norm(v); return res; }
  }
  if (amax <= 0) { res.thr = 0; return res; }
  res.thr = Math.min(1, adl / amax);
  if (res.thr < 0.002) res.thr = 0;
  return res;
}

// ── orbit insertion helper ───────────────────────────────────────────────────
export function insertOrbit(ship, b, t, states) {
  const st = bodyState(b, t);
  const r = sub(ship.p, st.p);
  const R = len(r);
  const mu = G * b.mass;
  // velocity for circular orbit in plane containing r and +Y-ish
  let h = cross(r, sub(velOfU(ship.u), st.v));
  if (len(h) < 1e-6) h = [0, 1, 0];
  const tdir = norm(cross(norm(h), r));
  const vc = b.mass ? Math.sqrt(mu / R) : 0;
  const vnew = add(st.v, mul(tdir, vc));
  const dv = len(sub(vnew, velOfU(ship.u)));
  // pay for it with propellant (rocket equation)
  const E = ENGINES[ship.engine];
  const rp = rocketParams(ship);
  const m = shipMass(ship);
  const need = m * (1 - Math.exp(-dv / Math.min(rp.ve, C)));
  if (E.flybyOnly) return { ok: false, dv };
  if (need > ship[rp.fuelKey] && dv > 50) return { ok: false, dv };
  ship[rp.fuelKey] = Math.max(0, ship[rp.fuelKey] - need);
  ship.u = uOfVel(vnew);
  return { ok: true, dv };
}

// ── rebasing between star systems ────────────────────────────────────────────
export function rebase(ship) {
  const cur = SYS_BY_ID[ship.sys];
  const g = add(cur.pos, ship.p);
  let best = cur, bestD = len(ship.p);
  for (const s of SYSTEMS) {
    const d = len(sub(g, s.pos));
    if (d < bestD * 0.98) { best = s; bestD = d; }
  }
  if (best !== cur) { ship.p = sub(g, best.pos); ship.sys = best.id; return true; }
  return false;
}

export function shipGlobal(ship) { return add(SYS_BY_ID[ship.sys].pos, ship.p); }

export function hawking(Mbh) {
  const hbar = 1.054571817e-34, kB = 1.380649e-23;
  const T = hbar * C * C * C / (8 * Math.PI * G * Mbh * kB);
  // Crane & Westmoreland (2009) total emitted power, all particle species
  const P = 1.6e17 * Math.pow(6.06e8 / Mbh, 2);
  const rs = 2 * G * Mbh / (C * C);
  return { T, P, rs };
}
