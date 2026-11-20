// ─────────────────────────────────────────────────────────────────────────────
//  Engine visual effects: plumes, nuclear pulses, ramscoop/magsail fields,
//  photon beams, warp ring glow. All additive, bloom-friendly.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const plumeVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const plumeFrag = /* glsl */`
  uniform vec3 uCore; uniform vec3 uEdge; uniform float uI; uniform float uTime; uniform float uDiamonds; uniform float uFall;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float t = 1.0 - vUv.y;                // 0 at nozzle → 1 at tail
    float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
    float fade = pow(1.0 - t, uFall) * smoothstep(0.0, 0.03, t + 0.01);
    float flick = 0.85 + 0.15 * sin(uTime * 37.0 + t * 23.0) * sin(uTime * 13.0 - t * 7.0);
    float dia = 1.0 + uDiamonds * smoothstep(0.55, 1.0, sin(t * 60.0 - uTime * 2.0)) * (1.0 - t);
    vec3 col = mix(uCore, uEdge, clamp(t * 1.4 + (1.0 - f) * 0.6, 0.0, 1.0));
    float a = f * fade * flick * dia * uI;
    gl_FragColor = vec4(col * a, a);
  }`;

export function makePlume({ length = 60, r0 = 3, r1 = 9, core = '#ffffff', edge = '#ff8a2a', diamonds = 0, fall = 1.6, segments = 40 } = {}) {
  const geo = new THREE.CylinderGeometry(r0, r1, length, segments, 1, true);
  geo.translate(0, -length / 2, 0);
  geo.rotateX(Math.PI / 2); // nozzle at z=0, tail at z=-length
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) }, uI: { value: 0 }, uTime: { value: 0 }, uDiamonds: { value: diamonds }, uFall: { value: fall } },
    vertexShader: plumeVert, fragmentShader: plumeFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.setI = (i) => { mat.uniforms.uI.value = i; m.visible = i > 0.001; };
  m.userData.tick = (t) => { mat.uniforms.uTime.value = t; };
  m.visible = false;
  return m;
}

// A plume = soft outer sheath + hot inner core + nozzle glow sprite
export function makeExhaust(opts) {
  const g = new THREE.Group();
  const outer = makePlume(opts);
  const inner = makePlume({ ...opts, length: opts.length * 0.55, r0: opts.r0 * 0.55, r1: opts.r1 * 0.35, edge: opts.core, core: '#ffffff', fall: 1.2 });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(opts.edge), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  spr.scale.setScalar(opts.r0 * 5);
  g.add(outer, inner, spr);
  g.userData.set = (i, t) => {
    outer.userData.setI(i); inner.userData.setI(i * 1.2);
    outer.userData.tick(t); inner.userData.tick(t);
    spr.material.opacity = Math.min(1, i); spr.visible = i > 0.01;
  };
  g.userData.set(0, 0);
  return g;
}

// ── Nuclear pulse: flash sprite + expanding plasma shell + light ─────────────
const shellFrag = /* glsl */`
  uniform vec3 uColor; uniform float uA;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = pow(f, 2.0) * uA + 0.15 * uA;
    gl_FragColor = vec4(uColor * a, a);
  }`;
export function makePulseSystem({ z = -40, scale = 30, color = '#ffd9a0', light = true } = {}) {
  const g = new THREE.Group();
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 0 } },
      vertexShader: plumeVert, fragmentShader: shellFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    shell.scale.set(1, 1, 1.6);
    flash.visible = shell.visible = false;
    g.add(flash, shell);
    pool.push({ flash, shell, age: 99 });
  }
  let pl = null;
  if (light) { pl = new THREE.PointLight(new THREE.Color(color), 0, scale * 12, 1.2); pl.position.z = z; g.add(pl); }
  let next = 0;
  g.userData.trigger = (strength = 1) => {
    const p = pool[next++ % pool.length];
    p.age = 0; p.s = strength;
  };
  g.userData.update = (dt) => {
    let lightI = 0;
    for (const p of pool) {
      p.age += dt;
      const a = p.age;
      if (a > 1.2) { p.flash.visible = p.shell.visible = false; continue; }
      p.flash.visible = p.shell.visible = true;
      const k = Math.min(1, a / 0.08);
      const fade = Math.max(0, 1 - a / 1.2);
      p.flash.position.z = z; p.shell.position.z = z - a * scale * 0.6;
      p.flash.scale.setScalar(scale * (0.6 + 2.4 * k) * p.s);
      p.flash.material.opacity = Math.pow(fade, 3) * p.s;
      p.shell.scale.set(1, 1, 1.6).multiplyScalar(scale * (0.2 + a * 2.2) * p.s);
      p.shell.material.uniforms.uA.value = Math.pow(fade, 2) * 0.9 * p.s;
      lightI = Math.max(lightI, Math.pow(fade, 4) * p.s);
    }
    if (pl) pl.intensity = lightI * scale * scale * 6;
  };
  return g;
}

// ── Ramscoop / magnetic-parachute field (funnel of flowing field lines) ─────
const fieldFrag = /* glsl */`
  uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uFlow;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float lines = pow(0.5 + 0.5 * sin(vUv.x * 6.2831 * 24.0), 18.0);
    float flow = pow(fract(vUv.y * 6.0 + uTime * uFlow), 6.0);
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    float a = (lines * (0.35 + flow * 1.2) + f * 0.25) * edge * uI;
    gl_FragColor = vec4(uColor * a, a);
  }`;
export function makeField({ rFar = 400, rNear = 30, length = 700, color = '#33e1ff', flow = 0.6 } = {}) {
  const geo = new THREE.CylinderGeometry(rFar, rNear, length, 64, 8, true);
  geo.translate(0, length / 2, 0);
  geo.rotateX(Math.PI / 2); // +Y → +Z, opening forward
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: 0 }, uTime: { value: 0 }, uFlow: { value: flow } },
    vertexShader: plumeVert, fragmentShader: fieldFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.set = (i, t, flowSign = 1) => { mat.uniforms.uI.value = i; mat.uniforms.uTime.value = t * flowSign; m.visible = i > 0.002; };
  m.visible = false;
  return m;
}

// ── bright core sprite (black-hole drive, antimatter) ─────────────────────────
export function makeCore(color = '#ffffff', size = 30) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 'core'),
    color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  s.scale.setScalar(size);
  return s;
}
