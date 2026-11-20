// ─────────────────────────────────────────────────────────────────────────────
//  HUD, labels, maps and the company HQ.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { C, AU, LY, YEAR, DAY, G0, ENGINES, ENGINE_ORDER, CONFIGS, SYSTEMS, SYS_BY_ID, CONTRACTS, START_YEAR } from './data.js';
import * as PH from './physics.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(api) {
    this.api = api;
    this.hqOpen = false; this.mapOpen = false; this.helpOpen = false; this.navOpen = false;
    this.tab = 'fleet';
    this.sel = { engine: 'chem', config: 'probe', name: '' };
    this.mapMode = 'sys';
    this.hudTimer = 0;
    this.labelEls = new Map();
    this._bind();
  }

  // ── formatting ─────────────────────────────────────────────────────────────
  static fmtDist(m) {
    const a = Math.abs(m);
    if (a < 1e4) return a.toFixed(0) + ' m';
    if (a < 1e9) return (a / 1000).toLocaleString('en-US', { maximumFractionDigits: a < 1e6 ? 1 : 0 }) + ' km';
    if (a < 0.05 * LY) return (a / AU).toFixed(a < 10 * AU ? 3 : 1) + ' AU';
    return (a / LY).toFixed(a < 100 * LY ? 3 : 1) + ' ly';
  }
  static fmtSpeed(v) {
    const a = Math.abs(v);
    if (a < 1000) return a.toFixed(1) + ' m/s';
    if (a < 0.001 * C) return (a / 1000).toFixed(2) + ' km/s';
    return Math.round(a / 1000).toLocaleString('en-US') + ' km/s';
  }
  static fmtTime(s) {
    if (!isFinite(s)) return '∞';
    const a = Math.abs(s);
    if (a < 120) return a.toFixed(0) + ' s';
    if (a < 7200) return (a / 60).toFixed(1) + ' min';
    if (a < 3 * DAY) return (a / 3600).toFixed(1) + ' h';
    if (a < YEAR) return (a / DAY).toFixed(1) + ' d';
    return (a / YEAR).toFixed(a < 100 * YEAR ? 2 : 0) + ' yr';
  }
  static fmtMass(kg) {
    if (kg < 1e3) return kg.toFixed(kg < 1 ? 3 : 0) + ' kg';
    const t = kg / 1000;
    if (t < 1e3) return t.toFixed(1) + ' t';
    if (t < 1e6) return (t / 1e3).toFixed(1) + ' kt';
    if (t < 1e9) return (t / 1e6).toFixed(2) + ' Mt';
    return (t / 1e9).toFixed(2) + ' Gt';
  }
  static fmtMoney(b) {
    if (Math.abs(b) >= 1000) return '$' + (b / 1000).toFixed(2) + 'T';
    if (Math.abs(b) >= 1) return '$' + b.toFixed(2) + 'B';
    return '$' + (b * 1000).toFixed(0) + 'M';
  }
  static fmtDate(t) {
    const ms = Date.UTC(START_YEAR, 0, 1) + t * 1000;
    if (Math.abs(ms) > 8e15) return 'Year ' + Math.floor(START_YEAR + t / YEAR);
    return new Date(ms).toISOString().slice(0, 10);
  }
  static fmtForce(N) {
    if (N >= 1e9) return (N / 1e9).toFixed(2) + ' GN';
    if (N >= 1e6) return (N / 1e6).toFixed(2) + ' MN';
    if (N >= 1e3) return (N / 1e3).toFixed(1) + ' kN';
    return N.toFixed(0) + ' N';
  }

  // ── setup ──────────────────────────────────────────────────────────────────
  _bind() {
    $('wDown').onclick = () => this.api.setWarp(this.api.warpIdx - 1);
    $('wUp').onclick = () => this.api.setWarp(this.api.warpIdx + 1);
    $('hqBtn').onclick = () => this.toggleHQ(true);
    $('mapBtn').onclick = () => this.toggleMap(true);
    $('camBtn').onclick = () => this.api.cycleCamera();
    $('helpBtn').onclick = () => this.toggleHelp(true);
    $('helpClose').onclick = () => this.toggleHelp(false);
    $('navBtn').onclick = () => this.toggleNav();
    $('hqClose').onclick = () => this.toggleHQ(false);
    $('mapClose').onclick = () => this.toggleMap(false);
    $('mapSys').onclick = () => { this.mapMode = 'sys'; };
    $('mapGal').onclick = () => { this.mapMode = 'gal'; };
    $('lossBtn').onclick = () => { $('loss').hidden = true; this.toggleHQ(true); };
    document.querySelectorAll('[data-tgt]').forEach(b => b.onclick = () => this.cycleTarget(+b.dataset.tgt));
    document.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => { const s = this.api.activeShip(); if (s) this.api.setAP(s, b.dataset.ap); });
    $('cruise').oninput = (e) => { const s = this.api.activeShip(); if (s) s.ap.cruise = +e.target.value / 1000; };
    $('hqTabs').onclick = (e) => { const t = e.target.closest('button'); if (!t) return; this.tab = t.dataset.tab; this.renderHQ(); };
    $('mapc').addEventListener('click', (e) => this._mapClick(e));
    $('hqBody').addEventListener('click', (e) => this._hqClick(e));
    $('hqBody').addEventListener('input', (e) => { if (e.target.id === 'shipName') this.sel.name = e.target.value; if (e.target.id === 'coRename') { this.api.game.company = e.target.value || 'Stellar Drive Works'; } });
    $('hqBody').addEventListener('change', (e) => this._hqChange(e));
    $('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; this.setTarget(b.dataset.id); this.toggleNav(false); });
  }

  showIntro() {
    $('intro').hidden = false;
    $('contBtn').hidden = !this.api.hasSave();
    $('introEngines').innerHTML = ENGINE_ORDER.map(k => `<span class="tag ${k === 'amed' ? 'cy' : k === 'blackhole' ? 'vi' : ''}">${esc(ENGINES[k].name)}</span>`).join('');
    $('newBtn').onclick = () => { this.api.newGame($('coInput').value.trim()); this._startPlay(true); };
    $('contBtn').onclick = () => { if (this.api.loadGame()) this._startPlay(false); };
  }
  _startPlay(isNew) {
    $('intro').hidden = true;
    $('hud').hidden = false;
    this.sel.engine = 'chem'; this.sel.config = 'probe';
    if (isNew) {
      this.toast(`Welcome, CEO. ${this.api.game.company} owns one chemical rocket and $${this.api.game.credits}B. Take the Lunar Survey to start earning.`, 'good');
      setTimeout(() => this.toggleHelp(true), 600);
      const s = this.api.activeShip(); if (s) s.ap.target = 'sol:Moon';
    }
  }

  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    const box = $('toasts'); box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 5200);
  }
  contractToast(c, reward, ship) {
    const el = document.createElement('div');
    el.className = 'toast contract';
    el.innerHTML = `<b>Contract complete</b> · ${esc(c.title)} — ${esc(UI.fmtMoney(reward))} paid, +${c.rep} reputation`;
    $('toasts').prepend(el); setTimeout(() => el.remove(), 8000);
  }
  showLoss(ship, why) {
    $('lossTxt').textContent = `${ship.name} (${ENGINES[ship.engine].name}) was ${why}. Insurance does not cover acts of physics.`;
    $('loss').hidden = false;
  }

  toggleHelp(force) { this.helpOpen = force ?? !this.helpOpen; $('help').hidden = !this.helpOpen; }
  toggleNav(force) { this.navOpen = force ?? !this.navOpen; $('nav').hidden = !this.navOpen; if (this.navOpen) this.renderNav(); }
  toggleMap(force) { this.mapOpen = force ?? !this.mapOpen; $('map').hidden = !this.mapOpen; }
  toggleHQ(force) {
    const g = this.api.game; if (!g) return;
    this.hqOpen = force ?? !this.hqOpen;
    if (!this.hqOpen && !this.api.activeShip()) { this.hqOpen = true; this.toast('Build or select a ship first', 'warn'); }
    $('hq').hidden = !this.hqOpen;
    $('hud').hidden = this.hqOpen;
    $('labels').hidden = this.hqOpen;
    if (this.hqOpen) { this.toggleNav(false); this.toggleMap(false); this.renderHQ(); this.api.save(); }
  }

  // ── targets ────────────────────────────────────────────────────────────────
  targetList(ship) {
    const out = [];
    const cur = SYS_BY_ID[ship.sys];
    for (const b of cur.bodies) out.push(b);
    for (const s of SYSTEMS) if (s !== cur) out.push(s.bodies[0]);
    return out;
  }
  setTarget(id) {
    const s = this.api.activeShip(); if (!s) return;
    s.ap.target = id; s.ap.plan = null;
    if (s.ap.mode === 'approach' || s.ap.mode === 'flyby') s.ap.mode = 'off';
    const b = PH.bodyById(id);
    this.toast('Target: ' + b.name);
  }
  cycleTarget(dir) {
    const s = this.api.activeShip(); if (!s) return;
    const list = this.targetList(s);
    let i = list.findIndex(b => b.id === s.ap.target);
    i = (i + dir + list.length) % list.length;
    this.setTarget(list[i].id);
  }
  renderNav() {
    const s = this.api.activeShip(); if (!s) return;
    let h = '';
    for (const sys of SYSTEMS) {
      const here = sys.id === s.sys;
      const g = PH.shipGlobal(s);
      const d = PH.len(PH.sub(sys.pos, g));
      h += `<h4>${esc(sys.name)} · ${here ? 'here' : UI.fmtDist(d)}</h4>`;
      for (const b of sys.bodies) {
        if (!here && b !== sys.bodies[0] && b.type !== 'planet' && b.type !== 'blackhole') continue;
        const c = CONTRACTS.find(c => c.target === b.id && !this.api.game.done[c.id]);
        h += `<button data-id="${esc(b.id)}" class="${s.ap.target === b.id ? 'sel' : ''}">${esc(b.name)}${c ? ' <span style="color:var(--amber)">◆</span>' : ''}<span>${esc(b.type)}</span></button>`;
      }
    }
    $('nav').innerHTML = h;
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  updateHUD(ship, camera) {
    this._labels(ship, camera);
    if (this.mapOpen) this.drawMap(ship);
    this.hudTimer -= 1 / 60;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    const g = this.api.game, E = ENGINES[ship.engine];
    $('coName').textContent = g.company;
    $('coCr').textContent = UI.fmtMoney(g.credits);
    $('coRep').textContent = 'REP ' + g.rep;
    const W = this.api.WARPS[this.api.warpIdx];
    $('wVal').textContent = (W >= 1e6 ? W.toExponential(0).replace('e+', 'e') : W.toLocaleString('en-US')) + '×';
    const eff = this.api.effWarp;
    $('wLim').textContent = this.api.paused ? 'PAUSED' : (this.api.warpLimitedBy && eff < W * 0.9 ? `≈${eff < 1e5 ? Math.round(eff).toLocaleString('en-US') : eff.toExponential(1)}× · ${this.api.warpLimitedBy}` : (W >= 3e7 ? `${(W / YEAR).toFixed(W >= 1e9 ? 0 : 1)} yr / s` : ''));
    $('date').textContent = UI.fmtDate(g.t);
    $('tau').textContent = '+' + UI.fmtTime(ship.tau);

    const v = PH.velOfU(ship.u);
    const sp = PH.len(v), beta = sp / C, gam = PH.gammaOfU(ship.u);
    $('shipName').textContent = ship.name;
    // speed relative to the local reference body (the smallest sphere of influence we are inside)
    const sysNow = SYS_BY_ID[ship.sys];
    let ref = sysNow.star, refV = [0, 0, 0], refR = Infinity;
    for (const b of sysNow.bodies) {
      if (b.type !== 'planet' && b.type !== 'moon') continue;
      const st = PH.bodyState(b, g.t);
      const r = PH.len(PH.sub(ship.p, st.p));
      const soi = PH.hillRadius(b) * 0.5;
      if (r < soi && soi < refR) { ref = b; refV = st.v; refR = soi; }
    }
    const spRef = ship.warpOn ? ship.warpC * C : PH.len(PH.sub(v, refV));
    $('spd').innerHTML = esc(UI.fmtSpeed(spRef)).replace(/ (\S+)$/, '<small>$1</small>');
    $('spdRef').textContent = ship.warpOn ? 'warp bubble' : 'rel. ' + ref.name;
    $('betaBar').style.width = Math.min(100, beta * 100) + '%';
    $('ratedTick').style.left = Math.min(100, E.rated * 100) + '%';
    $('betaTxt').textContent = ship.warpOn ? `${ship.warpC}c WARP` : (beta < 0.001 ? beta.toExponential(2) : beta.toFixed(beta > 0.99 ? 5 : 4)) + 'c';
    $('gam').textContent = gam < 1.0001 ? (gam - 1 < 1e-9 ? '1.000' : '1 + ' + (gam - 1).toExponential(2)) : gam.toFixed(gam > 10 ? 2 : 4);
    $('acc').textContent = (this.api.accel / G0).toFixed(this.api.accel / G0 < 0.01 ? 4 : 3) + ' g';
    const phi = PH.rapidityAvailable(ship);
    $('dv').textContent = E.ram ? (E.key === 'amed' ? 'ram ∞ · ' : 'ram ∞ · ') + UI.fmtSpeed(PH.deltaVofRapidity(phi)) : E.warp && ship.warpOn ? 'warp' : UI.fmtSpeed(PH.deltaVofRapidity(phi));
    $('mass').textContent = UI.fmtMass(PH.shipMass(ship));
    $('dil').textContent = '1 : ' + gam.toFixed(gam < 1.01 ? 4 : 2);
    const f1 = E.staged ? ship.fuel / E.fuel : ship.fuel / E.fuel;
    $('f1name').textContent = E.staged ? 'Stage 1' : (E.short === 'AMED' ? 'Pellets' : 'Fuel');
    $('f1').style.width = (f1 * 100) + '%'; $('f1t').textContent = (f1 * 100).toFixed(f1 < 0.1 ? 1 : 0) + '%';
    const hasF2 = E.staged || E.fuel2;
    $('f2row').hidden = !hasF2;
    if (hasF2) {
      const cap = E.staged ? E.stage2.fuel : E.fuel2;
      const f2 = ship.fuel2 / cap;
      $('f2name').textContent = E.staged ? 'Stage 2' : E.key === 'amed' ? 'Antimatter' : 'Exotic';
      $('f2').style.width = (f2 * 100) + '%';
      $('f2t').textContent = E.key === 'amed' ? (ship.fuel2 * 1000).toFixed(2) + ' g' : E.key === 'warp' ? ship.fuel2.toFixed(1) + ' u' : (f2 * 100).toFixed(0) + '%';
    }
    $('hullBar').style.width = Math.max(0, ship.hull * 100) + '%'; $('hullT').textContent = Math.max(0, ship.hull * 100).toFixed(0) + '%';
    $('loc').innerHTML = this._locText(ship);

    // target
    const tb = ship.ap.target ? PH.bodyById(ship.ap.target) : null;
    if (tb) {
      const rel = PH.relToBody(ship, tb, g.t);
      const d = PH.len(rel.r);
      const same = tb.sys.id === ship.sys;
      const urel = PH.sub(v, same ? rel.vb : [0, 0, 0]);
      const closing = PH.dot(urel, PH.norm(rel.r));
      $('tgtName').textContent = tb.name;
      $('tgtType').textContent = tb.sys.name + ' · ' + tb.type;
      $('tDist').textContent = UI.fmtDist(d);
      $('tRel').textContent = UI.fmtSpeed(PH.len(urel));
      $('tClose').textContent = (closing >= 0 ? '+' : '−') + UI.fmtSpeed(Math.abs(closing));
      let eta = closing > 1 ? d / closing : Infinity;
      if (ship.warpOn) eta = d / (ship.warpC * C);
      if (ship.ap.plan && ship.ap.plan.kind === 'lambert') eta = ship.ap.plan.tArr - g.t;
      $('tEta').textContent = UI.fmtTime(eta);
      $('tEtaS').textContent = ship.warpOn ? UI.fmtTime(eta) : UI.fmtTime(eta / gam);
    } else {
      $('tgtName').textContent = 'None'; $('tgtType').textContent = '';
      ['tDist', 'tRel', 'tClose', 'tEta', 'tEtaS'].forEach(id => $(id).textContent = '—');
    }
    document.querySelectorAll('[data-ap]').forEach(b => b.classList.toggle('on', ship.ap.mode === b.dataset.ap));
    const ap = ship.ap;
    $('apPhase').textContent = ap.mode !== 'off' ? (ap.phaseLabel || ap.mode.toUpperCase()) : '';
    $('cruiseBox').hidden = E.rated < 0.02;
    $('cruiseT').textContent = ap.cruise.toFixed(3) + 'c' + (ap.cruise > E.rated ? ' ⚠' : '');
    if (document.activeElement !== $('cruise')) $('cruise').value = Math.round(ap.cruise * 1000);
    let info = '';
    if (ap.plan && ap.plan.kind === 'lambert') info = (ap.plan.tDep > g.t ? `Waiting for launch window · burn ${UI.fmtDate(ap.plan.tDep)} · ` : 'Transfer · ') + `Δv ${(ap.plan.dv / 1000).toFixed(1)} km/s · arrive ${UI.fmtDate(ap.plan.tArr)}`;
    else if (ap.mode === 'approach') info = 'Relativistic brachistochrone · stop & orbit';
    else if (ap.mode === 'flyby') info = 'Full burn toward target, no braking';
    if (E.flybyOnly && ap.mode === 'approach') info = 'Daedalus cannot brake — use Flyby (6)';
    $('apInfo').textContent = info;

    // engine strip
    this._engineStrip(ship, E);
    const thr = ship.throttle;
    $('thrBar').style.width = (thr * 100) + '%'; $('thrT').textContent = (thr * 100).toFixed(0) + '%';
  }

  _locText(ship) {
    const sys = SYS_BY_ID[ship.sys];
    const g = this.api.game;
    if (ship.status === 'docked') return '<b>Docked</b> · Orbital Shipyard, Earth';
    if (ship.warpOn) return `<b>In warp bubble</b> · ${esc(sys.name)} region`;
    let best = null, bd = Infinity;
    for (const b of sys.bodies) {
      const st = PH.bodyState(b, g.t);
      const d = PH.len(PH.sub(st.p, ship.p));
      const score = d / Math.max(b.radius || 1, 1) / (b.type === 'station' ? 1e4 : 1);
      if (score < bd) { bd = score; best = { b, d }; }
    }
    const fromStar = PH.len(ship.p);
    if (ship.status === 'orbit' && ship.orbiting) { const b = PH.bodyById(ship.orbiting); return `<b>Orbiting ${esc(b.name)}</b> · ${esc(sys.name)}`; }
    if (fromStar > 2000 * AU) return `<b>Interstellar space</b> · ${UI.fmtDist(fromStar)} from ${esc(sys.name)}`;
    return `<b>${esc(sys.name)}</b> · ${UI.fmtDist(best.d)} from ${esc(best.b.name)}`;
  }

  _engineStrip(ship, E) {
    const fx = this.api.fx;
    $('eName').textContent = E.name;
    $('eName').style.color = E.color;
    let ph = '', desc = '';
    if (E.key === 'amed') {
      const P = fx.phase || '';
      ph = `<span class="phase p1 ${P === 'P1' ? 'on' : ''}" title="Orion fusion start">P1</span><span class="phase p2 ${P === 'P2' ? 'on' : ''}" title="Antimatter ram cruise">P2</span><span class="phase p3 ${P === 'P3A' ? 'on' : ''}" title="Magnetic parachute">P3A</span><span class="phase p3 ${P === 'P3B' ? 'on' : ''}" title="Flip-and-burn">P3B</span>`;
      desc = { P1: 'Orion fusion start · pellets through the iris door', P2: `Antimatter ram-explosion cruise · forge +${(fx.forge || 0).toFixed(2)} kg/s`, P3A: 'Magnetic parachute · scoop expanded > 10,000 km', P3B: 'Flip-and-burn · forged pellets brake the ship' }[P] || (PH.len(PH.velOfU(ship.u)) / C < 0.15 ? 'Ram ignites above 0.15c' : 'Ram ready');
    } else if (E.key === 'bussard') {
      const P = fx.phase || '';
      ph = `<span class="phase p1 ${P === 'BOOST' ? 'on' : ''}">BOOST</span><span class="phase p2 ${P === 'RAM' ? 'on' : ''}">RAM</span><span class="phase p3 ${P === 'SAIL' || fx.sail ? 'on' : ''}">SAIL</span>`;
      desc = P === 'RAM' ? 'Burning interstellar hydrogen' : 'Ram lights above 0.01c';
    } else if (E.staged) {
      ph = `<span class="phase p1 ${ship.stage === 1 ? 'on' : ''}">STAGE 1</span><span class="phase p2 ${ship.stage === 2 ? 'on' : ''}">STAGE 2</span>`;
      desc = '250 Hz D/He³ pellet detonations';
    } else if (E.warp) {
      ph = `<span class="phase p2 ${ship.warpOn ? 'on' : ''}">WARP ${ship.warpC}c</span>`;
      desc = ship.warpOn ? 'Alcubierre bubble: no time dilation' : 'Engage ≥ 20 AU from any star';
    } else if (E.key === 'blackhole') {
      const h = PH.hawking(E.bh.mass);
      ph = `<span class="phase p2 on">T ${h.T.toExponential(1)} K</span>`;
      desc = `Hawking power ${(h.P / 1e18).toFixed(2)} EW · rₛ ${(h.rs * 1e18).toFixed(2)} am`;
    } else if (E.pulse) {
      ph = `<span class="phase p1 ${fx.pulse ? 'on' : ''}">PULSE</span>`;
      desc = 'Nuclear pulse units against the pusher plate';
    }
    $('phases').innerHTML = ph;
    $('phaseDesc').textContent = desc;
    let tg = '';
    if (E.ram) tg += `<button class="chip ${ship.ram ? 'on' : ''}" data-tog="ram">Scoop<kbd>R</kbd></button>`;
    if (E.magsail) tg += `<button class="chip ${ship.magsail ? 'warnon' : ''}" data-tog="sail">Mag-sail<kbd>B</kbd></button>`;
    if (E.staged && ship.stage === 1) tg += `<button class="chip" data-tog="stage">Stage<kbd>G</kbd></button>`;
    if (E.warp) tg += `<button class="chip ${ship.warpOn ? 'on' : ''}" data-tog="warp">Warp<kbd>V</kbd></button>`;
    tg += `<button class="chip" data-tog="full">Full<kbd>Z</kbd></button><button class="chip" data-tog="cut">Cut<kbd>X</kbd></button>`;
    const box = $('eToggles');
    if (box.dataset.h !== tg) {
      box.innerHTML = tg; box.dataset.h = tg;
      box.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => {
        const s = this.api.activeShip(); if (!s) return;
        const k = b.dataset.tog;
        if (k === 'ram') s.ram = !s.ram;
        if (k === 'sail') s.magsail = !s.magsail;
        if (k === 'stage') this.api.stageNow();
        if (k === 'warp') this.api.toggleWarpDrive();
        if (k === 'full') { s.throttle = 1; if (s.ap.mode === 'approach' || s.ap.mode === 'flyby') s.ap.mode = 'off'; }
        if (k === 'cut') { s.throttle = 0; if (s.ap.mode === 'approach' || s.ap.mode === 'flyby') s.ap.mode = 'off'; }
      });
    }
  }

  // ── labels / markers ───────────────────────────────────────────────────────
  _labels(ship, camera) {
    const W = window.innerWidth, H = window.innerHeight;
    const placed = [];
    const used = new Set();
    const v3 = new THREE.Vector3();
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const proj = (p) => { v3.copy(p); const inFront = v3.clone().sub(camera.position).dot(camDir) > 0; v3.project(camera); return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, inFront }; };
    const put = (key, text, sub, pos, cls, prio, id) => {
      const s = proj(pos);
      if (!s.inFront || s.x < -50 || s.x > W + 50 || s.y < -20 || s.y > H + 20) return;
      if (prio < 3 && placed.some(p => Math.abs(p.x - s.x) < 70 && Math.abs(p.y - s.y) < 14)) return;
      placed.push(s);
      let el = this.labelEls.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'blabel'; el.onclick = () => this.setTarget(el.dataset.id); $('labels').appendChild(el); this.labelEls.set(key, el); }
      el.dataset.id = id;
      el.className = 'blabel ' + cls;
      const html = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
      el.hidden = false;
      used.add(key);
    };
    const views = (this.api.universe.currentViews || []).slice().sort((a, b) => (b.body.id === ship.ap.target) - (a.body.id === ship.ap.target));
    for (const vw of views) {
      const b = vw.body;
      if (b.type === 'station' && vw.dist > 5e8) continue;
      const tgt = b.id === ship.ap.target;
      put(b.id, b.name, UI.fmtDist(vw.dist), vw.obj.position, tgt ? 'tgt' : '', tgt ? 3 : b.type === 'moon' ? 0 : 1, b.id);
    }
    for (const sd of this.api.universe.sysDirs || []) {
      if (sd.sys.id === ship.sys) continue;
      const b = sd.sys.bodies[0];
      const tgt = sd.sys.bodies.some(x => x.id === ship.ap.target);
      put('sys:' + sd.sys.id, sd.sys.name, UI.fmtDist(sd.d), new THREE.Vector3(...sd.dir).multiplyScalar(1e9).add(camera.position), tgt ? 'tgt sys' : 'sys', tgt ? 3 : 1, tgt ? ship.ap.target : b.id);
    }
    for (const [k, el] of this.labelEls) if (!used.has(k)) el.hidden = true;

    // target marker / off-screen arrow
    const tm = $('tgtMarker'), ta = $('tgtArrow');
    tm.hidden = ta.hidden = true;
    const tb = ship.ap.target ? PH.bodyById(ship.ap.target) : null;
    if (tb) {
      let pos = null;
      const vw = (this.api.universe.currentViews || []).find(x => x.body === tb);
      if (vw) pos = vw.obj.position.clone();
      else { const sd = (this.api.universe.sysDirs || []).find(x => x.sys === tb.sys); if (sd) pos = new THREE.Vector3(...sd.dir).multiplyScalar(1e9).add(camera.position); }
      if (pos) {
        const s = proj(pos);
        if (s.inFront && s.x > 0 && s.x < W && s.y > 0 && s.y < H) { tm.hidden = false; tm.style.left = s.x + 'px'; tm.style.top = s.y + 'px'; }
        else {
          let dx = s.x - W / 2, dy = s.y - H / 2;
          if (!s.inFront) { dx = -dx; dy = -dy; }
          const a = Math.atan2(dy, dx);
          const r = Math.min(W, H) * 0.42;
          ta.hidden = false;
          ta.style.left = (W / 2 + Math.cos(a) * r - 9) + 'px'; ta.style.top = (H / 2 + Math.sin(a) * r - 8) + 'px';
          ta.style.transform = `rotate(${a + Math.PI / 2}rad)`;
        }
      }
    }
    // prograde / retrograde
    const v = ship.velocity;
    const sp = PH.len(v);
    const pg = $('pgMarker'), rg = $('rgMarker');
    pg.hidden = rg.hidden = true;
    if (sp > 1 && !ship.warpOn) {
      const n = new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(1e6).add(camera.position);
      const s = proj(n);
      if (s.inFront && s.x > 0 && s.x < W && s.y > 0 && s.y < H) { pg.hidden = false; pg.style.left = s.x + 'px'; pg.style.top = s.y + 'px'; }
      const n2 = new THREE.Vector3(-v[0], -v[1], -v[2]).normalize().multiplyScalar(1e6).add(camera.position);
      const s2 = proj(n2);
      if (s2.inFront && s2.x > 0 && s2.x < W && s2.y > 0 && s2.y < H) { rg.hidden = false; rg.style.left = s2.x + 'px'; rg.style.top = s2.y + 'px'; }
    }
  }

  // ── maps ───────────────────────────────────────────────────────────────────
  drawMap(ship) {
    const cv = $('mapc');
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#04080f'; x.fillRect(0, 0, W, H);
    this._mapHits = [];
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    $('mapSys').classList.toggle('on', this.mapMode === 'sys');
    $('mapGal').classList.toggle('on', this.mapMode === 'gal');
    const g = this.api.game;
    x.font = '12px "Saira Condensed", sans-serif';
    if (this.mapMode === 'sys') {
      const sys = SYS_BY_ID[ship.sys];
      $('mapTitle').textContent = sys.name + ' system';
      const maxA = Math.max(...sys.bodies.filter(b => b.a && !b.parent).map(b => b.a), AU);
      const r0 = maxA / 400;
      const sc = (r) => R * Math.log10(1 + r / r0) / Math.log10(1 + maxA * 1.6 / r0);
      // grid rings
      x.strokeStyle = '#0f1d30'; x.lineWidth = 1;
      for (const au of [0.01, 0.1, 1, 10, 100, 1000]) { const rr = sc(au * AU); if (rr > R * 1.05 || rr < 8) continue; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#2a3b55'; x.fillText(au + ' AU', cx + rr + 3, cy - 3); }
      const P = (p) => { const r = Math.hypot(p[0], p[2]); const k = r > 0 ? sc(r) / r : 0; return [cx + p[0] * k, cy + p[2] * k]; };
      for (const b of sys.bodies) {
        const st = PH.bodyState(b, g.t);
        let [px, py] = P(st.p);
        if (b.parent) {
          const ps = PH.bodyState(sys.byName[b.parent], g.t);
          const [qx, qy] = P(ps.p);
          const off = PH.sub(st.p, ps.p); const ol = Math.hypot(off[0], off[2]) || 1;
          const rr = b.type === 'station' ? 9 : 16;
          px = qx + off[0] / ol * rr; py = qy + off[2] / ol * rr;
          x.strokeStyle = '#13243a'; x.beginPath(); x.arc(qx, qy, rr, 0, Math.PI * 2); x.stroke();
        } else if (b.a) {
          x.strokeStyle = b.type === 'star2' ? '#3a2a10' : '#16304c'; x.beginPath(); x.arc(cx, cy, sc(b.a), 0, Math.PI * 2); x.stroke();
        }
        const tgt = b.id === ship.ap.target;
        const col = b.type.startsWith('star') ? '#ffd27a' : b.type === 'blackhole' ? '#d6b4ff' : b.type === 'station' ? '#00e5ff' : '#cbd5e1';
        x.fillStyle = col;
        x.beginPath(); x.arc(px, py, b.type.startsWith('star') || b.type === 'blackhole' ? 6 : b.type === 'moon' || b.type === 'station' ? 2.5 : 4, 0, Math.PI * 2); x.fill();
        if (tgt) { x.strokeStyle = '#00e5ff'; x.lineWidth = 1.5; x.strokeRect(px - 8, py - 8, 16, 16); x.lineWidth = 1; }
        const c = CONTRACTS.find(c => c.target === b.id && !g.done[c.id]);
        x.fillStyle = tgt ? '#00e5ff' : c ? '#f59e0b' : '#94a3b8';
        if (b.type !== 'station' || tgt) x.fillText(b.name + (c ? ' ◆' : ''), px + 8, py + 4);
        this._mapHits.push({ x: px, y: py, id: b.id });
      }
      // ship & velocity
      const [sx, sy] = P(ship.p);
      x.fillStyle = '#34d399'; x.beginPath(); x.moveTo(sx, sy - 7); x.lineTo(sx + 6, sy + 5); x.lineTo(sx - 6, sy + 5); x.closePath(); x.fill();
      x.fillText(ship.name, sx + 9, sy - 6);
      const v = PH.velOfU(ship.u);
      const ahead = PH.add(ship.p, PH.mul(v, 30 * DAY));
      const [vx, vy] = P(ahead);
      x.strokeStyle = 'rgba(52,211,153,.6)'; x.beginPath(); x.moveTo(sx, sy); x.lineTo(vx, vy); x.stroke();
      if (ship.ap.plan && ship.ap.plan.kind === 'lambert') {
        const tb = PH.bodyById(ship.ap.plan.legTarget);
        const [ax, ay] = P(PH.bodyState(tb, ship.ap.plan.tArr).p);
        x.strokeStyle = 'rgba(0,229,255,.7)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(cx + (sx + ax - 2 * cx) * 0.7, cy + (sy + ay - 2 * cy) * 0.7, ax, ay); x.stroke(); x.setLineDash([]);
        x.strokeStyle = '#00e5ff'; x.beginPath(); x.arc(ax, ay, 7, 0, Math.PI * 2); x.stroke();
        x.fillStyle = '#00e5ff'; x.fillText('intercept ' + UI.fmtDate(ship.ap.plan.tArr), ax + 10, ay + 16);
      }
      x.fillStyle = '#5b6b82'; x.fillText('Log-scaled radial distance · click a body to target it', 16, H - 16);
    } else {
      $('mapTitle').textContent = 'Interstellar map';
      const gS = PH.shipGlobal(ship);
      const maxD = 30000 * LY, r0 = 0.6 * LY;
      const sc = (r) => R * Math.log10(1 + r / r0) / Math.log10(1 + maxD / r0);
      x.strokeStyle = '#0f1d30';
      for (const ly of [1, 10, 100, 1000, 10000]) { const rr = sc(ly * LY); x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#2a3b55'; x.fillText(ly.toLocaleString('en-US') + ' ly', cx + rr + 3, cy - 3); }
      const P = (p) => { const r = Math.hypot(p[0], p[2]); const k = r > 0 ? sc(r) / r : 0; return [cx + p[0] * k, cy + p[2] * k]; };
      for (const s of SYSTEMS) {
        const [px, py] = P(s.pos);
        const tgt = s.bodies.some(b => b.id === ship.ap.target);
        const bh = s.bodies[0].type === 'blackhole';
        x.fillStyle = bh ? '#d6b4ff' : '#ffd27a';
        x.beginPath(); x.arc(px, py, bh ? 5 : 4, 0, Math.PI * 2); x.fill();
        if (tgt) { x.strokeStyle = '#00e5ff'; x.strokeRect(px - 8, py - 8, 16, 16); }
        const d = PH.len(PH.sub(s.pos, gS));
        x.fillStyle = tgt ? '#00e5ff' : '#cbd5e1';
        x.fillText(`${s.name}  ${UI.fmtDist(d)}`, px + 8, py + 4);
        this._mapHits.push({ x: px, y: py, id: s.bodies.find(b => b.type === 'planet')?.id || s.bodies[0].id, sysId: s.id });
      }
      const [sx, sy] = P(gS);
      x.fillStyle = '#34d399'; x.beginPath(); x.moveTo(sx, sy - 7); x.lineTo(sx + 6, sy + 5); x.lineTo(sx - 6, sy + 5); x.closePath(); x.fill();
      if (ship.ap.target) {
        const tb = PH.bodyById(ship.ap.target);
        const [tx, ty] = P(tb.sys.pos);
        x.strokeStyle = 'rgba(0,229,255,.6)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(sx, sy); x.lineTo(tx, ty); x.stroke(); x.setLineDash([]);
      }
      x.fillStyle = '#5b6b82'; x.fillText('Top-down, log-scaled from Sol · click a system to target it', 16, H - 16);
    }
  }
  _mapClick(e) {
    const r = e.target.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bd = 22;
    for (const h of this._mapHits || []) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h; } }
    if (best) this.setTarget(best.id);
  }

  // ── HQ ─────────────────────────────────────────────────────────────────────
  updateHQ() {
    if (!this.hqOpen) return;
    if (this.tab === 'yard') this.api.setHangarModel(this.sel.engine, this.sel.config);
    else { const s = this.api.activeShip(); if (s) this.api.setHangarModel(s.engine, s.config); else this.api.setHangarModel('amed', 'explorer'); }
    const E = ENGINES[this.tab === 'yard' ? this.sel.engine : (this.api.activeShip() || { engine: 'amed' }).engine];
    $('capT').textContent = E.name; $('capT').style.color = E.color;
    $('capS').textContent = E.era + ' · drag to rotate · scroll to zoom';
  }

  shipStats(engine, config) {
    const E = ENGINES[engine];
    const s = PH.newShip(engine, config, '');
    const wet = PH.shipMass(s);
    const phi = PH.rapidityAvailable(s);
    const acc = E.thrust / wet;
    return { wet, dry: PH.shipDryMass(s), phi, dv: PH.deltaVofRapidity(phi), acc, cost: E.cost + CONFIGS[config].cost };
  }

  refitCost(ship) {
    const E = ENGINES[ship.engine];
    let c = 0;
    if (E.staged) { c += (E.fuel - ship.fuel + E.stage2.fuel - ship.fuel2) * E.fuelPrice; if (ship.stage === 2) c += E.cost * 0.4; }
    else {
      c += (E.fuel - ship.fuel) * E.fuelPrice;
      if (E.fuel2) c += (E.fuel2 - ship.fuel2) * (E.fuel2Price || 0);
    }
    c += (1 - ship.hull) * 0.3 * (E.cost + CONFIGS[ship.config].cost);
    return Math.max(0, c);
  }

  renderHQ() {
    const g = this.api.game;
    $('hqName').textContent = g.company;
    $('hqSub').textContent = `Headquarters · ${UI.fmtDate(g.t)} · ${UI.fmtMoney(g.credits)} · reputation ${g.rep}`;
    document.querySelectorAll('#hqTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const body = $('hqBody');
    if (this.tab === 'fleet') body.innerHTML = this._fleetHTML();
    if (this.tab === 'yard') body.innerHTML = this._yardHTML();
    if (this.tab === 'rd') body.innerHTML = this._rdHTML();
    if (this.tab === 'contracts') body.innerHTML = this._contractsHTML();
    if (this.tab === 'settings') body.innerHTML = this._settingsHTML();
    this.updateHQ();
  }

  _fleetHTML() {
    const g = this.api.game;
    const done = Object.keys(g.done).length;
    let h = `<div class="stats">
      <div class="stat"><span class="lbl">Treasury</span><div class="v am">${UI.fmtMoney(g.credits)}</div></div>
      <div class="stat"><span class="lbl">Fleet</span><div class="v">${g.fleet.length}</div></div>
      <div class="stat"><span class="lbl">Fastest</span><div class="v cy">${g.records.maxBeta < 0.001 ? (g.records.maxBeta * C / 1000).toFixed(1) + ' km/s' : g.records.maxBeta.toFixed(3) + 'c'}</div></div>
    </div>`;
    if (!g.fleet.length) h += `<p class="blurb">Your fleet is empty. Open the <b>Shipyard</b> tab and commission a ship.</p>`;
    for (const s of g.fleet) {
      const E = ENGINES[s.engine];
      const act = s.id === g.activeId;
      const docked = s.status === 'docked';
      const cost = this.refitCost(s);
      const inSol = s.sys === 'sol';
      h += `<div class="row ${act ? 'active' : ''}">
        <div><h5>${esc(s.name)} ${act ? '<span class="tag cy">ACTIVE</span>' : ''}</h5>
          <p>${esc(E.name)} · ${esc(CONFIGS[s.config].name)}</p>
          <div class="meta"><span>${this._locText(s)}</span></div>
          <div class="meta"><span>Fuel <b>${(PH.fuelFraction(s) * 100).toFixed(0)}%</b></span><span>Hull <b>${(s.hull * 100).toFixed(0)}%</b></span><span>Top speed <b>${s.maxBeta < 0.001 ? (s.maxBeta * C / 1000).toFixed(1) + ' km/s' : s.maxBeta.toFixed(3) + 'c'}</b></span><span>τ <b>${UI.fmtTime(s.tau)}</b></span></div>
        </div>
        <div class="acts">
          <button class="btn" data-act="fly" data-id="${s.id}">${act ? 'Launch' : 'Take helm'}</button>
          ${docked ? `<button class="btn amber" data-act="refit" data-id="${s.id}" ${cost < 1e-4 || g.credits < cost ? 'disabled' : ''}>Refuel · ${UI.fmtMoney(cost)}</button>` : ''}
          ${!docked && inSol ? `<button class="btn ghost" data-act="tow" data-id="${s.id}" ${g.credits < 0.2 ? 'disabled' : ''}>Tug home · $200M</button>` : ''}
          <button class="btn ghost" data-act="scrap" data-id="${s.id}">${this._confirm === 'scrap' + s.id ? 'Confirm scrap' : 'Scrap'}</button>
        </div></div>`;
    }
    return h;
  }

  _yardHTML() {
    const g = this.api.game;
    const sel = this.sel;
    if (!g.unlocked.includes(sel.engine)) sel.engine = 'chem';
    const E = ENGINES[sel.engine];
    if (!E.configs.includes(sel.config)) sel.config = E.configs[0];
    const st = this.shipStats(sel.engine, sel.config);
    let h = `<span class="lbl">Propulsion</span><div class="enginelist" style="margin-top:6px">`;
    for (const k of ENGINE_ORDER) {
      const e = ENGINES[k], un = g.unlocked.includes(k);
      h += `<button class="eng ${k === sel.engine ? 'sel' : ''} ${un ? '' : 'locked'}" data-eng="${k}"><b style="color:${un ? e.color : 'inherit'}">${esc(e.name)}</b><span>${un ? UI.fmtMoney(e.cost) : '🔒 research ' + UI.fmtMoney(e.research)}</span></button>`;
    }
    h += `</div>`;
    h += `<p class="blurb">${esc(E.blurb)}</p><ul class="facts">${E.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
    if (E.key === 'amed') h += `<div class="amedphases"><div class="a"><b>PHASE 1 · 0 → 0.15c</b>Orion fusion start. Ramscoop off, D/Li-6 pellets detonate against the pusher plate.</div><div class="c"><b>PHASE 2 · 0.15c → 0.50c+</b>Antimatter ram cruise. Scooped hydrogen self-compresses, nanogram antimatter sparks, forge harvests deuterium.</div><div class="v"><b>PHASE 3 · 0.50c → 0</b>Magnetic parachute to ~0.10c, then flip-and-burn on forged pellets.</div></div>`;
    h += `<div style="margin-top:14px"><span class="lbl">Configuration</span><div class="cfgs" style="margin-top:6px">${E.configs.map(c => `<button class="chip ${c === sel.config ? 'on' : ''}" data-cfg="${c}">${esc(CONFIGS[c].name)} · ${esc(CONFIGS[c].desc)}</button>`).join('')}</div></div>`;
    const ve = E.ve >= 0.01 * C ? (E.ve / C).toFixed(2) + 'c' : (E.ve / 1000).toLocaleString('en-US') + ' km/s';
    const vmax = E.ram ? 'unlimited (ramjet)' : E.warp ? `${E.warp.maxC.toLocaleString('en-US')}c in warp` : (st.phi > 0.01 ? Math.tanh(st.phi).toFixed(3) + 'c' : UI.fmtSpeed(st.dv));
    h += `<table class="spec"><tbody>
      <tr><td>Thrust${E.staged ? ' (stage 1 / 2)' : ''}</td><td>${UI.fmtForce(E.thrust)}${E.staged ? ' / ' + UI.fmtForce(E.stage2.thrust) : ''}</td></tr>
      <tr><td>Exhaust velocity</td><td>${ve} · Isp ${E.ve >= C * 0.99 ? '3.06×10⁷' : Math.round(E.ve / 9.80665).toLocaleString('en-US')} s</td></tr>
      <tr><td>Wet / dry mass</td><td>${UI.fmtMass(st.wet)} / ${UI.fmtMass(st.dry)}</td></tr>
      <tr><td>Initial acceleration</td><td>${(st.acc / 9.80665).toFixed(st.acc < 0.098 ? 4 : 2)} g</td></tr>
      <tr><td>Propellant Δv (relativistic)</td><td>${UI.fmtSpeed(st.dv)}</td></tr>
      <tr><td>Top speed</td><td>${vmax}</td></tr>
      <tr><td>Dust-shield rating</td><td>${E.rated >= 0.01 ? E.rated.toFixed(2) + 'c' : UI.fmtSpeed(E.rated * C)}</td></tr>
      <tr><td>Propellant</td><td>${esc(E.fuelName)}${E.fuel2Name ? ' + ' + esc(E.fuel2Name) : ''}</td></tr>
      <tr><td>Crew</td><td>${CONFIGS[sel.config].crew.toLocaleString('en-US')}</td></tr>
      <tr><td><b>Build cost</b></td><td><b>${UI.fmtMoney(st.cost)}</b></td></tr>
    </tbody></table>`;
    const n = g.fleet.filter(s => s.engine === sel.engine).length + 1;
    const defName = `${E.short.charAt(0) + E.short.slice(1).toLowerCase()} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || n}`;
    h += `<label class="field"><span class="lbl">Ship name</span><input id="shipName" value="${esc(sel.name || defName)}" maxlength="28"></label>
      <button class="btn" data-act="build" ${g.credits < st.cost || !g.unlocked.includes(sel.engine) ? 'disabled' : ''}>Commission · ${UI.fmtMoney(st.cost)}</button>
      ${g.credits < st.cost ? `<span class="tag am" style="margin-left:8px">Need ${UI.fmtMoney(st.cost - g.credits)} more</span>` : ''}`;
    this._defName = defName;
    return h;
  }

  _rdHTML() {
    const g = this.api.game;
    let h = `<p class="blurb" style="margin-top:0">Each propulsion breakthrough needs funding and the reputation to attract the right physicists. Completing contracts earns both.</p>`;
    for (const k of ENGINE_ORDER) {
      const e = ENGINES[k];
      const un = g.unlocked.includes(k);
      const can = !un && g.credits >= e.research && g.rep >= e.rep;
      h += `<div class="row ${un ? 'done' : ''}"><div><h5 style="color:${e.color}">${esc(e.name)} ${e.speculative ? '<span class="tag vi">SPECULATIVE</span>' : ''}</h5><p>${esc(e.era)}</p>
        <div class="meta"><span>Δv class <b>${e.ram ? 'ramjet' : e.warp ? 'FTL' : UI.fmtSpeed(PH.deltaVofRapidity(this.shipStats(k, e.configs[0]).phi))}</b></span><span>Ship from <b>${UI.fmtMoney(e.cost)}</b></span></div></div>
        <div class="acts">${un ? '<span class="tag gd">RESEARCHED</span>' : `<button class="btn ${can ? '' : 'ghost'}" data-act="research" data-eng="${k}" ${can ? '' : 'disabled'}>Research · ${UI.fmtMoney(e.research)}</button><span class="tag ${g.rep >= e.rep ? 'gd' : 'am'}">Rep ${e.rep} needed</span>`}</div></div>`;
    }
    return h;
  }

  _contractsHTML() {
    const g = this.api.game;
    const s = this.api.activeShip();
    let h = '';
    const rows = CONTRACTS.map(c => ({ c, done: !!g.done[c.id] && !c.repeat }));
    rows.sort((a, b) => a.done - b.done);
    for (const { c, done } of rows) {
      const tb = c.target ? PH.bodyById(c.target) : null;
      const where = tb ? `${tb.name}, ${tb.sys.name}` : 'Anywhere';
      const kind = c.kind === 'orbit' ? 'Reach orbit' : c.kind === 'flyby' ? `Fly within ${UI.fmtDist(c.radius)}` : `Reach ${c.beta}c`;
      const reward = c.repeat ? c.reward * Math.pow(0.85, g.done[c.id] || 0) : c.reward;
      h += `<div class="row ${done ? 'done' : ''}"><div><h5>${esc(c.title)} ${c.repeat ? '<span class="tag">REPEATABLE</span>' : ''} ${done ? '<span class="tag gd">DONE</span>' : ''}</h5><p>${esc(c.desc)}</p>
        <div class="meta"><span>${esc(kind)}</span><span>Target <b>${esc(where)}</b></span>${c.config ? `<span>Ship <b>${esc(CONFIGS[c.config].name)}${c.config !== 'ark' ? '+' : ''}</b></span>` : ''}<span>Reward <b style="color:var(--amber)">${UI.fmtMoney(reward)}</b> · +${c.rep} rep</span></div></div>
        <div class="acts">${tb && s && !done ? `<button class="btn ghost" data-act="settgt" data-id="${esc(tb.id)}">Set target</button>` : ''}</div></div>`;
    }
    return h;
  }

  _settingsHTML() {
    const g = this.api.game;
    return `<label class="field"><span class="lbl">Company name</span><input id="coRename" value="${esc(g.company)}" maxlength="32"></label>
      <div class="row"><div><h5>Relativistic optics</h5><p>Aberration and Doppler shift of the sky and every body at high speed.</p></div><div class="acts"><button class="btn ${g.settings.relOptics ? '' : 'ghost'}" data-act="optics">${g.settings.relOptics ? 'On' : 'Off'}</button></div></div>
      <div class="row"><div><h5>Bloom</h5><p>Glow on engines, stars and accretion disks. Turn off for speed on weaker GPUs.</p></div><div class="acts"><button class="btn ${g.settings.bloom ? '' : 'ghost'}" data-act="bloom">${g.settings.bloom ? 'On' : 'Off'}</button></div></div>
      <div class="row"><div><h5>Reset company</h5><p>Erase this save and start over from the title screen.</p></div><div class="acts"><button class="btn ghost" data-act="reset">${this._confirm === 'reset' ? 'Confirm reset' : 'Reset'}</button></div></div>
      <p class="blurb" style="color:var(--muted);font-size:12.5px">Progress saves to this browser automatically.</p>`;
  }

  _hqChange(e) {}

  _hqClick(e) {
    const g = this.api.game;
    const eng = e.target.closest('[data-eng]');
    const cfg = e.target.closest('[data-cfg]');
    const actEl = e.target.closest('[data-act]');
    if (eng && !actEl) { this.sel.engine = eng.dataset.eng; this.sel.name = ''; if (!g.unlocked.includes(this.sel.engine)) { this.toast(`${ENGINES[this.sel.engine].name} needs research first (R&D tab)`, 'warn'); } this.renderHQ(); return; }
    if (cfg) { this.sel.config = cfg.dataset.cfg; this.renderHQ(); return; }
    if (!actEl) return;
    const act = actEl.dataset.act;
    const ship = actEl.dataset.id ? g.fleet.find(s => s.id === actEl.dataset.id) : null;
    if (act !== 'scrap' && act !== 'reset') this._confirm = null;
    switch (act) {
      case 'fly': this.api.flyShip(ship.id); this.toggleHQ(false); break;
      case 'refit': {
        const cost = this.refitCost(ship); if (g.credits < cost) return;
        g.credits -= cost;
        const E = ENGINES[ship.engine];
        ship.fuel = E.fuel; ship.fuel2 = E.staged ? E.stage2.fuel : (E.fuel2 || 0); ship.stage = 1; ship.hull = 1; ship._hullWarned = false;
        this.toast(`${ship.name} refuelled and repaired`, 'good'); break;
      }
      case 'tow': g.credits -= 0.2; this.api.placeAtShipyard(ship); this.toast(`${ship.name} towed to the shipyard`); break;
      case 'scrap': {
        if (this._confirm !== 'scrap' + ship.id) { this._confirm = 'scrap' + ship.id; break; }
        this._confirm = null;
        const E = ENGINES[ship.engine]; g.credits += (E.cost + CONFIGS[ship.config].cost) * 0.3;
        g.fleet = g.fleet.filter(s => s !== ship); if (g.activeId === ship.id) g.activeId = g.fleet[0] ? g.fleet[0].id : null;
        this.toast(`${ship.name} scrapped (30% recovered)`); break;
      }
      case 'build': {
        const st = this.shipStats(this.sel.engine, this.sel.config);
        if (g.credits < st.cost) return;
        g.credits -= st.cost;
        const s = PH.newShip(this.sel.engine, this.sel.config, (this.sel.name || this._defName).trim() || this._defName);
        s.built = g.t;
        this.api.placeAtShipyard(s);
        g.fleet.push(s); g.activeId = s.id; this.sel.name = '';
        this.toast(`${s.name} commissioned at the orbital shipyard`, 'good');
        this.tab = 'fleet'; break;
      }
      case 'research': {
        const k = actEl.dataset.eng, E = ENGINES[k];
        if (g.credits < E.research || g.rep < E.rep) return;
        g.credits -= E.research; g.unlocked.push(k);
        this.toast(`${E.name} researched — now available in the Shipyard`, 'good');
        this.sel.engine = k; break;
      }
      case 'settgt': { const s = this.api.activeShip(); if (s) { s.ap.target = actEl.dataset.id; s.ap.mode = 'off'; s.ap.plan = null; this.toast('Target set: ' + PH.bodyById(s.ap.target).name); } break; }
      case 'optics': g.settings.relOptics = !g.settings.relOptics; break;
      case 'bloom': g.settings.bloom = !g.settings.bloom; this.api.setBloom(g.settings.bloom); break;
      case 'reset':
        if (this._confirm !== 'reset') { this._confirm = 'reset'; break; }
        try { localStorage.removeItem('sdw-save-v1'); } catch (_) {}
        location.reload(); return;
    }
    this.api.save();
    this.renderHQ();
  }
}
