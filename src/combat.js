// ─────────────────────────────────────────────────────────────────────────────
//  Combat: target drones, laser / railgun turrets, homing missiles, ship power.
//  Entities live in ship-relative positions (ship at origin) with absolute
//  system-frame velocities, so ship thrust and gravity are handled correctly.
//  Weapon cooldowns and power run on real time; motion runs on game time.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { WEAPONS, AU, RSUN, SYS_BY_ID } from './data.js';
import * as PH from './physics.js';
import { glowTexture } from './textures.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
let uid = 1;

export class Combat {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.drones = []; this.slugs = []; this.missiles = []; this.fx = [];
    this.cool = {}; this.lockId = null; this.power = 0; this.status = null;
    this.shipId = null;
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.7, roughness: 0.4 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2244, emissiveIntensity: 3 }),
      panel: new THREE.MeshStandardMaterial({ color: 0x1a2a66, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }),
    };
    this.glow = glowTexture();
  }

  // ── entities ───────────────────────────────────────────────────────────────
  _droneMesh() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), this.mats.body); core.scale.set(1, 1, 1.4); g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.6, 6, 24), this.mats.eye); g.add(ring);
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 4), this.mats.panel); p.position.x = s * 10; g.add(p); }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xff3355, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    spr.scale.setScalar(26); g.add(spr);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return g;
  }
  spawn(ship, n = 3) {
    const v = PH.velOfU(ship.u);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize();
      const fwd = V(ship.fwd || [0, 0, 1]);
      dir.add(fwd.multiplyScalar(0.9)).normalize();
      const dist = 2500 + Math.random() * 6000;
      const mesh = this._droneMesh();
      this.group.add(mesh);
      this.drones.push({
        id: uid++, r: dir.multiplyScalar(dist).toArray(),
        v: PH.add(v, [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 60]),
        hp: 100, mesh, t: Math.random() * 10, a: [0, 0, 0], spin: (Math.random() - 0.5) * 2,
      });
    }
  }
  clear() {
    for (const d of this.drones) this.group.remove(d.mesh);
    for (const s of [...this.slugs, ...this.missiles]) this.group.remove(s.mesh);
    for (const f of this.fx) this.group.remove(f.obj);
    this.drones = []; this.slugs = []; this.missiles = []; this.fx = []; this.lockId = null;
  }
  locked() { return this.drones.find(d => d.id === this.lockId) || null; }
  cycleLock() {
    if (!this.drones.length) { this.lockId = null; return null; }
    const sorted = this.drones.slice().sort((a, b) => PH.len(a.r) - PH.len(b.r));
    const i = sorted.findIndex(d => d.id === this.lockId);
    this.lockId = sorted[(i + 1) % sorted.length].id;
    return this.locked();
  }

  _flash(pos, size, color, life = 0.6) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos); this.group.add(s);
    this.fx.push({ obj: s, age: 0, life, size, kind: 'flash' });
  }
  _beam(from, to, color) {
    const d = to.clone().sub(from); const L = d.length();
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 1, 6, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, L);
    this.group.add(m);
    this.fx.push({ obj: m, age: 0, life: 0.14, kind: 'beam' });
  }
  _projMesh(color, len, rad) {
    const geo = new THREE.CylinderGeometry(rad, rad, len, 6); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(rad * 30); m.add(s);
    return m;
  }

  _hit(d, dmg, at, onKill) {
    d.hp -= dmg;
    this._flash(at, 20 + dmg * 0.3, '#ffd0a0', 0.35);
    if (d.hp <= 0) {
      this._flash(V(d.r), 160, '#ffb060', 1.1);
      this._flash(V(d.r), 70, '#ffffff', 0.5);
      this.group.remove(d.mesh);
      this.drones = this.drones.filter(x => x !== d);
      if (this.lockId === d.id) this.lockId = null;
      onKill && onKill();
    }
  }

  // ── per-frame update ───────────────────────────────────────────────────────
  // ctx: { ship, view, gameDt, realDt, gravity, starFlux, fire, onKill }
  update(ctx) {
    const { ship, view, realDt } = ctx;
    const gameDt = Math.min(ctx.gameDt, 5);
    if (this.shipId !== ship.id) { this.shipId = ship.id; this.cool = {}; }
    const sp = PH.shipSpec(ship);
    const vS = PH.velOfU(ship.u);
    const g = ctx.gravity || [0, 0, 0];

    // power & energy
    this.power = sp.reactorMW + sp.solarMW * Math.min(4, ctx.starFlux || 0);
    if (ship.energy === undefined || ship.energy > sp.storeMJ) ship.energy = sp.storeMJ;
    ship.energy = Math.min(sp.storeMJ, ship.energy + this.power * realDt);
    const pods = sp.weapons.filter(w => w === 'missile').length;
    if (ship.missiles === undefined) ship.missiles = pods * WEAPONS.missile.ammo;
    ship.missiles = Math.min(ship.missiles, pods * WEAPONS.missile.ammo);

    // drones: gentle evasive manoeuvring, despawn when far away
    for (const d of this.drones.slice()) {
      d.t -= realDt;
      const rel = PH.sub(d.v, vS);
      if (d.t <= 0) { d.t = 2 + Math.random() * 3; d.a = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8]; }
      let a = d.a;
      if (PH.len(rel) > 220) a = PH.mul(PH.norm(rel), -6);
      d.v = PH.add(d.v, PH.mul(PH.add(g, a), gameDt));
      d.r = PH.add(d.r, PH.mul(PH.sub(d.v, vS), gameDt));
      d.mesh.position.set(d.r[0], d.r[1], d.r[2]);
      d.mesh.rotation.y += d.spin * realDt; d.mesh.rotation.z += d.spin * 0.3 * realDt;
      if (PH.len(d.r) > 3e6) { this.group.remove(d.mesh); this.drones = this.drones.filter(x => x !== d); if (this.lockId === d.id) this.lockId = null; }
    }
    if (!this.locked() && this.drones.length) this.lockId = this.drones.slice().sort((a, b) => PH.len(a.r) - PH.len(b.r))[0].id;
    const tgt = this.locked();
    const aimWorld = tgt ? V(tgt.r) : null;

    // weapons
    const turrets = view ? view.parts.turrets : [];
    const turretsOf = (kind) => turrets.filter(t => t.userData.kind === kind);
    const inst = { laser: 0, railgun: 0, missile: 0 };
    const report = [];
    for (const w of sp.weapons) {
      const W = WEAPONS[w];
      const idx = inst[w]++;
      const key = w + idx;
      this.cool[key] = Math.max(0, (this.cool[key] || 0) - realDt);
      const dist = tgt ? PH.len(tgt.r) : Infinity;
      const ready = this.cool[key] <= 0 && ship.energy >= W.energy && (w !== 'missile' || ship.missiles > 0);
      report.push({ w, ready, inRange: dist <= W.range, cool: this.cool[key] / W.cooldown });
      if (!ctx.fire || !tgt || !ready || dist > W.range) continue;
      this.cool[key] = W.cooldown;
      ship.energy -= W.energy;
      const tPos = V(tgt.r);
      if (w === 'laser' || w === 'railgun') {
        const pair = turretsOf(w === 'laser' ? 'laser' : 'railgun').slice(idx * 2, idx * 2 + 2);
        const tur = pair[(this.cool['alt' + key] = ((this.cool['alt' + key] || 0) + 1) % 2)] || pair[0];
        const from = new THREE.Vector3();
        if (tur) { tur.getWorldPosition(from); const dir = tPos.clone().sub(from).normalize(); from.add(dir.multiplyScalar(tur.userData.muzzle || 5)); }
        if (w === 'laser') {
          this._beam(from, tPos, W.color);
          this._hit(tgt, W.damage, tPos, ctx.onKill);
        } else {
          // lead the target
          const relV = PH.sub(tgt.v, vS);
          const tFly = dist / W.speed;
          const aim = PH.add(tgt.r, PH.mul(relV, tFly));
          const dir = PH.norm(PH.sub(aim, from.toArray()));
          const mesh = this._projMesh(W.color, 40, 0.8);
          mesh.position.copy(from); mesh.lookAt(new THREE.Vector3(...aim));
          this.group.add(mesh);
          this.slugs.push({ r: from.toArray(), v: PH.add(vS, PH.mul(dir, W.speed)), mesh, life: W.range / W.speed * 1.3, dmg: W.damage });
          this._flash(from, 14, W.color, 0.2);
        }
      } else if (w === 'missile') {
        ship.missiles--;
        const mounts = view ? view.parts.missileMounts : [];
        const local = mounts.length ? mounts[(ship.missiles) % mounts.length].clone() : new THREE.Vector3(0, 6, 0);
        const from = local.applyQuaternion(view ? view.root.parent.quaternion : new THREE.Quaternion());
        const out = from.clone().normalize();
        const mesh = this._projMesh(W.color, 6, 0.7);
        mesh.position.copy(from); this.group.add(mesh);
        this.missiles.push({ r: from.toArray(), v: PH.add(vS, PH.mul(out.toArray(), 60)), mesh, life: 90, dmg: W.damage, tid: tgt.id, trail: 0 });
      }
    }

    // railgun slugs: swept collision against every drone
    for (const s of this.slugs.slice()) {
      const r0 = s.r;
      s.r = PH.add(s.r, PH.mul(PH.sub(s.v, vS), gameDt));
      s.life -= gameDt;
      s.mesh.position.set(s.r[0], s.r[1], s.r[2]);
      let hit = null;
      for (const d of this.drones) { if (segDist(r0, s.r, d.r) < 30) { hit = d; break; } }
      if (hit) this._hit(hit, s.dmg, V(hit.r), ctx.onKill);
      if (hit || s.life <= 0) { this.group.remove(s.mesh); this.slugs = this.slugs.filter(x => x !== s); }
    }
    // missiles: pursuit guidance on the relative velocity
    for (const m of this.missiles.slice()) {
      const d = this.drones.find(x => x.id === m.tid) || this.locked();
      const W = WEAPONS.missile;
      if (d) {
        const rel = PH.sub(d.r, m.r);
        const dist = PH.len(rel);
        const vRelM = PH.sub(m.v, d.v);
        const want = PH.mul(PH.norm(rel), Math.min(6000, Math.max(1500, Math.sqrt(2 * W.accel * dist) * 1.5)));
        let a = PH.mul(PH.sub(want, vRelM), 1 / 0.6);
        if (PH.len(a) > W.accel) a = PH.mul(PH.norm(a), W.accel);
        const r0 = m.r;
        m.v = PH.add(m.v, PH.mul(PH.add(a, g), gameDt));
        m.r = PH.add(m.r, PH.mul(PH.sub(m.v, vS), gameDt));
        if (segDist(r0, m.r, d.r) < 28) { this._hit(d, m.dmg, V(d.r), ctx.onKill); m.life = 0; }
        m.mesh.lookAt(new THREE.Vector3(...d.r));
      } else m.r = PH.add(m.r, PH.mul(PH.sub(m.v, vS), gameDt));
      m.life -= gameDt;
      m.mesh.position.set(m.r[0], m.r[1], m.r[2]);
      m.trail -= realDt;
      if (m.trail <= 0) { m.trail = 0.05; this._flash(m.mesh.position.clone(), 10, '#ff9a40', 0.6); }
      if (m.life <= 0) { if (d) this._flash(m.mesh.position.clone(), 40, '#ffb060', 0.5); this.group.remove(m.mesh); this.missiles = this.missiles.filter(x => x !== m); }
    }
    // short-lived effects
    for (const f of this.fx.slice()) {
      f.age += realDt;
      const k = f.age / f.life;
      if (f.kind === 'flash') { f.obj.scale.setScalar(f.size * (0.4 + k * 1.2)); f.obj.material.opacity = Math.max(0, 1 - k); }
      else f.obj.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.group.remove(f.obj); this.fx = this.fx.filter(x => x !== f); }
    }

    this.status = { energy: ship.energy, store: sp.storeMJ, power: this.power, weapons: report, missiles: ship.missiles, pods, target: tgt, drones: this.drones.length };
    return { aimWorld };
  }
}

function segDist(a, b, p) {
  const ab = PH.sub(b, a), ap = PH.sub(p, a);
  const L2 = PH.dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, PH.dot(ap, ab) / L2)) : 0;
  return PH.len(PH.sub(ap, PH.mul(ab, t)));
}

// stellar flux at the ship relative to 1 AU from the Sun
export function starFlux(ship, t) {
  const sys = SYS_BY_ID[ship.sys];
  let f = 0;
  for (const b of sys.bodies) {
    if (!b.temp) continue;
    const st = PH.bodyState(b, t);
    const d = Math.max(PH.len(PH.sub(ship.p, st.p)), b.radius * 1.5);
    f += (b.radius / RSUN) ** 2 * (b.temp / 5772) ** 4 * (AU / d) ** 2;
  }
  return f;
}
