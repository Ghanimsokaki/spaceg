// ─────────────────────────────────────────────────────────────────────────────
//  Multiplayer: room codes over PeerJS (WebRTC data channels).
//  Star topology — the host relays every pilot's ship state to everyone and
//  owns the clock (game time + time warp) so all players share one universe.
//  Signalling uses the free public PeerJS server unless ?peer=host:port is set.
// ─────────────────────────────────────────────────────────────────────────────
import { Peer } from 'peerjs';

const PREFIX = 'sdw-room-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: +(port || 9000), path: '/', secure: location.protocol === 'https:' && host !== 'localhost', debug: 0 };
}

export class Net {
  constructor(hooks) {
    this.h = hooks;                 // { getState(), getTime(), setTime(t, warpIdx), toast(msg, kind) }
    this.peer = null; this.conns = new Map(); this.hostConn = null;
    this.role = 'off'; this.room = null; this.myId = null; this.name = 'Pilot';
    this.remotes = new Map();       // id → { name, s, last }
    this.status = 'Offline';
    this._tick = null;
  }
  get online() { return this.role !== 'off'; }

  host(name) {
    this.leave();
    this.name = name || 'Host';
    this.role = 'host'; this.status = 'Creating room…';
    const tryOpen = (attempt) => {
      const room = code();
      const peer = new Peer(PREFIX + room, peerOptions());
      this.peer = peer;
      peer.on('open', (id) => { this.myId = id; this.room = room; this.status = 'Hosting'; this.h.toast(`Room ${room} is open — share the code with your friends`, 'good'); this._startTick(); });
      peer.on('connection', (c) => this._accept(c));
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
        this._fail(e);
      });
      peer.on('disconnected', () => { if (this.role === 'host') peer.reconnect(); });
    };
    tryOpen(0);
  }

  join(room, name) {
    this.leave();
    room = (room || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(room)) { this.h.toast('Room codes are 5 letters/numbers', 'warn'); return; }
    this.name = name || 'Pilot';
    this.role = 'client'; this.status = 'Connecting…'; this.room = room;
    const peer = new Peer(undefined, peerOptions());
    this.peer = peer;
    peer.on('open', (id) => {
      this.myId = id;
      const c = peer.connect(PREFIX + room, { reliable: true, metadata: { name: this.name } });
      this.hostConn = c;
      c.on('open', () => { this.status = 'Connected'; c.send({ type: 'hello', name: this.name }); this.h.toast(`Joined room ${room}`, 'good'); this._startTick(); });
      c.on('data', (m) => this._onData(m, c));
      c.on('close', () => { if (this.role === 'client') { this.h.toast('Disconnected from the room', 'warn'); this.leave(); } });
      c.on('error', (e) => this._fail(e));
    });
    peer.on('error', (e) => this._fail(e));
  }

  leave() {
    clearInterval(this._tick); this._tick = null;
    for (const c of this.conns.values()) { try { c.send({ type: 'bye' }); c.close(); } catch (_) {} }
    if (this.hostConn) { try { this.hostConn.send({ type: 'bye' }); this.hostConn.close(); } catch (_) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (_) {} }
    this.peer = null; this.conns.clear(); this.hostConn = null; this.remotes.clear();
    this.role = 'off'; this.room = null; this.status = 'Offline';
  }

  _fail(e) {
    const why = e && e.type === 'peer-unavailable' ? 'No room with that code' : e && e.type === 'network' ? 'Network error — check your connection' : e && e.type === 'browser-incompatible' ? 'This browser does not support WebRTC' : (e && (e.type || e.message)) || 'Connection failed';
    this.h.toast('Multiplayer: ' + why, 'bad');
    this.leave();
  }

  _accept(c) {
    c.on('open', () => { this.conns.set(c.peer, c); });
    c.on('data', (m) => this._onData(m, c));
    c.on('close', () => { this._drop(c.peer); });
    c.on('error', () => { this._drop(c.peer); });
  }
  _drop(id) {
    const r = this.remotes.get(id);
    this.conns.delete(id); this.remotes.delete(id);
    if (r) { this.h.toast(`${r.name} left the room`); this._broadcast({ type: 'gone', id }); }
  }
  _broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); }

  _onData(m, c) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello' && this.role === 'host') { this.h.toast(`${String(m.name).slice(0, 24)} joined`, 'good'); return; }
    if (m.type === 'state') {
      const id = this.role === 'host' ? c.peer : m.id;
      if (!id || id === this.myId) return;
      const known = this.remotes.has(id);
      this.remotes.set(id, { name: String(m.name || 'Pilot').slice(0, 24), s: m.s, last: performance.now() });
      if (!known && this.role === 'client') this.h.toast(`${String(m.name).slice(0, 24)} is in the room`);
      if (this.role === 'host') this._broadcast({ ...m, id }, id);   // relay
      return;
    }
    if (m.type === 'time' && this.role === 'client') { this.h.setTime(m.t, m.w); return; }
    if (m.type === 'gone') { const r = this.remotes.get(m.id); this.remotes.delete(m.id); if (r) this.h.toast(`${r.name} left the room`); return; }
    if (m.type === 'bye' && this.role === 'host') { this._drop(c.peer); }
  }

  _startTick() {
    clearInterval(this._tick);
    this._tick = setInterval(() => {
      const s = this.h.getState();
      if (s) {
        const msg = { type: 'state', name: this.name, s };
        if (this.role === 'host') { this._broadcast({ ...msg, id: this.myId }); const tm = this.h.getTime(); this._broadcast({ type: 'time', t: tm.t, w: tm.w }); }
        else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
      }
      const now = performance.now();
      for (const [id, r] of this.remotes) if (now - r.last > 6000) this.remotes.delete(id);
    }, 100);
  }
}
