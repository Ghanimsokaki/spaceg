// ─────────────────────────────────────────────────────────────────────────────
//  Universe rendering. Floating origin: the ship is always at (0,0,0).
//  Distant bodies are drawn at a compressed distance with their angular size
//  preserved, so everything fits a log-depth buffer. Relativistic aberration
//  and Doppler shift are applied to the sky and to every body's direction.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { C, AU, LY, RSUN, SYSTEMS, SYS_BY_ID, EQ2GAL } from './data.js';
import { bodyState, sub, len, add } from './physics.js';
import { milkyWayTexture, planetTexture, ringTexture, glowTexture, tempColor, rng } from './textures.js';

export const RMAX = 2.0e7; // beyond this, positions are log-compressed

const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const BLACKBODY_GLSL = /* glsl */`
vec3 blackbody(float T){
  float t = T/100.0; float r,g,b;
  if (t <= 66.0){ r = 255.0; g = 99.47*log(t)-161.12; b = t<=19.0 ? 0.0 : 138.52*log(t-10.0)-305.04; }
  else { r = 329.7*pow(t-60.0,-0.1332); g = 288.12*pow(t-60.0,-0.0755); b = 255.0; }
  return clamp(vec3(r,g,b)/255.0, 0.0, 1.0);
}`;

const ABERR_GLSL = /* glsl */`
uniform vec3 uBeta;
// observed direction + Doppler factor for a source in direction n
vec3 aberrate(vec3 n, out float D){
  float b = length(uBeta); D = 1.0;
  if (b < 1e-6) return n;
  vec3 bh = uBeta / b; float c = dot(n, bh);
  float cp = (c + b) / (1.0 + b * c);
  vec3 perp = n - c * bh; float pl = length(perp);
  perp = pl > 1e-7 ? perp / pl : vec3(0.0);
  float g = 1.0 / sqrt(1.0 - b * b);
  D = 1.0 / (g * (1.0 - b * cp));
  return cp * bh + sqrt(max(0.0, 1.0 - cp * cp)) * perp;
}`;

// CPU version of the same aberration (for meshes & labels)
export function aberrateDir(n, beta) {
  const b = Math.hypot(beta[0], beta[1], beta[2]);
  if (b < 1e-6) return { dir: n, D: 1 };
  const bh = [beta[0] / b, beta[1] / b, beta[2] / b];
  const c = n[0] * bh[0] + n[1] * bh[1] + n[2] * bh[2];
  const cp = (c + b) / (1 + b * c);
  let px = n[0] - c * bh[0], py = n[1] - c * bh[1], pz = n[2] - c * bh[2];
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const sp = Math.sqrt(Math.max(0, 1 - cp * cp));
  const g = 1 / Math.sqrt(1 - b * b);
  return { dir: [cp * bh[0] + sp * px, cp * bh[1] + sp * py, cp * bh[2] + sp * pz], D: 1 / (g * (1 - b * cp)) };
}

const eqToWorld = (x, y, z) => [x, z, -y];
function galToWorld(l, b) {
  const gx = Math.cos(b) * Math.cos(l), gy = Math.cos(b) * Math.sin(l), gz = Math.sin(b);
  const M = EQ2GAL; // eq = Mᵀ · gal
  const ex = M[0][0] * gx + M[1][0] * gy + M[2][0] * gz;
  const ey = M[0][1] * gx + M[1][1] * gy + M[2][1] * gz;
  const ez = M[0][2] * gx + M[1][2] * gy + M[2][2] * gz;
  return eqToWorld(ex, ey, ez);
}

function compress(d) { return d <= RMAX ? d : RMAX * (1 + Math.log(d / RMAX)); }

// ─────────────────────────────────────────────────────────────────────────────
export class Universe {
  constructor(scene) {
    this.scene = scene;
    this.sky = new THREE.Group();
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.beta = new THREE.Vector3();
    this.relOptics = true;
    this.time = 0;
    this._buildMilkyWay();
    this._buildStars();
    this._buildSystemStars();
    this.sysGroups = new Map();
    this.currentSys = null;
    this.bodyViews = [];
    this.labels = [];
  }

  _buildMilkyWay() {
    const M = new THREE.Matrix3().set(...EQ2GAL[0], ...EQ2GAL[1], ...EQ2GAL[2]);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tMW: { value: milkyWayTexture() }, uM: { value: M }, uBeta: { value: this.beta }, uExp: { value: 0.3 } },
      vertexShader: `varying vec3 vDir;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D tMW; uniform mat3 uM; uniform vec3 uBeta; uniform float uExp; varying vec3 vDir;
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec3 np = normalize(vDir); float b = length(uBeta); vec3 n = np; float D = 1.0;
          if (b > 1e-6){ vec3 bh = uBeta/b; float cp = dot(np,bh); float c = (cp - b)/(1.0 - b*cp);
            vec3 perp = np - cp*bh; float pl = length(perp); perp = pl>1e-7?perp/pl:vec3(0.0);
            n = c*bh + sqrt(max(0.0,1.0-c*c))*perp; float g = 1.0/sqrt(1.0-b*b); D = 1.0/(g*(1.0-b*cp)); }
          vec3 eq = vec3(n.x, -n.z, n.y); vec3 gal = uM * eq;
          float lon = atan(gal.y, gal.x); float lat = asin(clamp(gal.z,-1.0,1.0));
          vec2 uv = vec2(fract(lon/6.2831853 + 0.5), 0.5 + lat/3.14159265);
          vec3 col = texture2D(tMW, uv).rgb;
          float boost = pow(D, 2.5);
          vec3 shift = D > 1.0 ? mix(vec3(1.0), vec3(0.65,0.8,1.3), clamp((D-1.0)*0.6,0.0,1.0)) : mix(vec3(1.0), vec3(1.4,0.6,0.3), clamp((1.0-D)*1.5,0.0,1.0));
          gl_FragColor = vec4(col*col*uExp*boost*shift, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.mw = new THREE.Mesh(new THREE.SphereGeometry(1e4, 64, 32), mat);
    this.mw.renderOrder = -10; this.mw.frustumCulled = false;
    this.sky.add(this.mw);
  }

  _buildStars() {
    const N = 16000, R = rng(42);
    const pos = new Float32Array(N * 3), temp = new Float32Array(N), mag = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let d;
      if (R() < 0.55) {
        const l = R() * Math.PI * 2;
        const g = (R() + R() + R() - 1.5) * 0.35;
        d = galToWorld(l, g * (1 + 0.6 * Math.exp(-(Math.min(l, 6.283 - l) ** 2))));
      } else {
        const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        d = [s * Math.cos(th), u, s * Math.sin(th)];
      }
      pos.set(d, i * 3);
      const rT = R();
      temp[i] = rT < 0.08 ? 15000 + R() * 20000 : rT < 0.25 ? 7500 + R() * 3000 : 2800 + R() * 4200;
      mag[i] = 7.6 - 8.6 * Math.pow(R(), 7);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTemp', new THREE.BufferAttribute(temp, 1));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    this.starMat = this._starMaterial();
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    this.sky.add(this.stars);
  }

  _starMaterial(big = false) {
    return new THREE.ShaderMaterial({
      uniforms: { uBeta: { value: this.beta }, uPx: { value: Math.min(window.devicePixelRatio, 2) }, uBig: { value: big ? 1 : 0 } },
      vertexShader: `attribute float aTemp; attribute float aMag; uniform float uPx; uniform float uBig; varying vec3 vCol; varying float vA;
        ${BLACKBODY_GLSL} ${ABERR_GLSL}
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          float D; vec3 dir = aberrate(normalize(position), D);
          vec4 mv = modelViewMatrix * vec4(dir * 9e11, 1.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
          float lum = pow(10.0, -0.4 * (aMag - 6.5)) * pow(D, 3.0);
          vCol = blackbody(clamp(aTemp * D, 1200.0, 60000.0));
          vA = clamp(lum * 0.7, 0.05, 1.0);
          gl_PointSize = clamp(1.0 + 1.1 * pow(lum, 0.33) * (1.0 + uBig * 0.6), 1.0, 6.0 + uBig * 8.0) * uPx;
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec2 p = gl_PointCoord - 0.5; float r = length(p);
          float a = smoothstep(0.5, 0.0, r); a = a*a*vA;
          float core = smoothstep(0.18, 0.0, r);
          gl_FragColor = vec4((vCol + core) * a, a);
        }`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
  }

  // other star systems as bright points
  _buildSystemStars() {
    const n = SYSTEMS.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aTemp', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.sysStars = new THREE.Points(geo, this._starMaterial(true));
    this.sysStars.frustumCulled = false; this.sysStars.renderOrder = -8;
    this.sky.add(this.sysStars);
  }

  // ── per-system meshes ──────────────────────────────────────────────────────
  _ensureSystem(sys) {
    if (this.sysGroups.has(sys.id)) return this.sysGroups.get(sys.id);
    const g = new THREE.Group();
    const views = [];
    for (const b of sys.bodies) {
      let v = null;
      if (b.type === 'star' || b.type === 'star2') v = this._makeStar(b);
      else if (b.type === 'blackhole') v = this._makeBlackHole(b);
      else if (b.type === 'station') v = this._makeStation(b);
      else v = this._makePlanet(b);
      v.body = b;
      g.add(v.obj);
      if (v.dot) g.add(v.dot);
      views.push(v);
    }
    g.visible = false;
    this.scene.add(g);
    const entry = { group: g, views };
    this.sysGroups.set(sys.id, entry);
    return entry;
  }

  _makeStar(b) {
    const col = new THREE.Color(...tempColor(b.temp));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: col }, uTime: { value: 0 }, uHot: { value: b.temp > 15000 ? 1 : 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol; uniform float uTime; uniform float uHot; varying vec3 vN; varying vec3 vP; varying vec3 vV;
        ${NOISE_GLSL}
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec3 p = normalize(vP);
          float n = snoise(p*6.0 + uTime*0.05)*0.5 + snoise(p*18.0 - uTime*0.08)*0.3 + snoise(p*48.0 + uTime*0.2)*0.2;
          float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
          float limb = 0.35 + 0.65*pow(mu, 0.55);
          vec3 c = uCol * (1.6 + n*0.45) * limb;
          c += vec3(1.0,0.95,0.85) * pow(mu, 3.0) * 0.6;
          gl_FragColor = vec4(c*2.2, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.55)'], [0.35, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']], 'corona'), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const obj = new THREE.Group(); obj.add(mesh, glow);
    return { obj, mesh, glow, mat, kind: 'star', col };
  }

  _makePlanet(b) {
    const W = ['earth', 'jupiter', 'saturn'].includes(b.tex) ? 1024 : 512;
    const t = planetTexture(b.tex, b.seed || 1, W);
    const atmo = b.atmo ? new THREE.Color(...b.atmo) : new THREE.Color(0, 0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: t.map }, tNight: { value: t.night || null }, uHasNight: { value: t.night ? 1 : 0 },
        uLight: { value: new THREE.Vector3(1, 0, 0) }, uAtmo: { value: atmo }, uHasAtmo: { value: b.atmo ? 1 : 0 }, uLightI: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vNw; varying vec3 vN; varying vec3 vV;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vUv = uv; vNw = normalize(mat3(modelMatrix)*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D tMap; uniform sampler2D tNight; uniform float uHasNight; uniform vec3 uLight; uniform vec3 uAtmo; uniform float uHasAtmo; uniform float uLightI;
        varying vec2 vUv; varying vec3 vNw; varying vec3 vN; varying vec3 vV;
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec3 albedo = texture2D(tMap, vUv).rgb;
          float ndl = dot(normalize(vNw), normalize(uLight));
          float day = smoothstep(-0.08, 0.25, ndl);
          vec3 c = albedo * max(ndl, 0.0) * 1.25 * uLightI + albedo * 0.012;
          if (uHasNight > 0.5) c += texture2D(tNight, vUv).rgb * (1.0 - day) * 1.4;
          float fr = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
          c += uAtmo * fr * uHasAtmo * smoothstep(-0.25, 0.4, ndl) * 1.2 * uLightI;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), mat);
    if (b.tilt) mesh.rotation.z = b.tilt;
    const obj = new THREE.Group(); obj.add(mesh);
    let clouds = null, atm = null, rings = null;
    if (t.clouds) {
      const cm = new THREE.ShaderMaterial({
        uniforms: { tMap: { value: t.clouds }, uLight: mat.uniforms.uLight, uLightI: mat.uniforms.uLightI },
        vertexShader: mat.vertexShader,
        fragmentShader: `uniform sampler2D tMap; uniform vec3 uLight; uniform float uLightI; varying vec2 vUv; varying vec3 vNw; varying vec3 vN; varying vec3 vV;
          #include <logdepthbuf_pars_fragment>
          void main(){
            #include <logdepthbuf_fragment>
            float a = texture2D(tMap, vUv).a; float ndl = max(dot(normalize(vNw), normalize(uLight)), 0.0);
            gl_FragColor = vec4(vec3(ndl*1.3*uLightI + 0.01), a*0.9);
          }`,
        transparent: true, depthWrite: false,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 96, 48), cm);
      if (b.tilt) clouds.rotation.z = b.tilt;
      obj.add(clouds);
    }
    if (b.atmo) {
      const am = new THREE.ShaderMaterial({
        uniforms: { uAtmo: { value: atmo }, uLight: mat.uniforms.uLight, uLightI: mat.uniforms.uLightI },
        vertexShader: mat.vertexShader,
        fragmentShader: `uniform vec3 uAtmo; uniform vec3 uLight; uniform float uLightI; varying vec2 vUv; varying vec3 vNw; varying vec3 vN; varying vec3 vV;
          #include <logdepthbuf_pars_fragment>
          void main(){
            #include <logdepthbuf_fragment>
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
            float ndl = dot(normalize(vNw), normalize(uLight));
            float a = f * smoothstep(-0.3, 0.3, ndl) * 0.85 * min(uLightI, 1.5);
            gl_FragColor = vec4(uAtmo * a, a);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      });
      atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 32), am);
      obj.add(atm);
    }
    if (b.rings) {
      const rg = new THREE.RingGeometry(1.24, 2.27, 128, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 1.24) / (2.27 - 1.24), 0.5); }
      const rm = new THREE.ShaderMaterial({
        uniforms: { tMap: { value: ringTexture() }, uLight: mat.uniforms.uLight, uLightI: mat.uniforms.uLightI },
        vertexShader: `varying vec2 vUv; varying vec3 vPw; varying vec3 vC; varying float vR;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main(){ vUv = uv; vPw = (modelMatrix*vec4(position,1.0)).xyz; vC = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vR = length(modelMatrix[0].xyz); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `uniform sampler2D tMap; uniform vec3 uLight; uniform float uLightI; varying vec2 vUv; varying vec3 vPw; varying vec3 vC; varying float vR;
          #include <logdepthbuf_pars_fragment>
          void main(){
            #include <logdepthbuf_fragment>
            vec4 t = texture2D(tMap, vUv);
            // planet shadow on the rings
            vec3 rel = vPw - vC; vec3 L = normalize(uLight); float along = dot(rel, L);
            float perp = length(rel - along*L);
            float sh = (along < 0.0 && perp < vR) ? 0.08 : 1.0;
            gl_FragColor = vec4(t.rgb * (0.9*uLightI*sh + 0.03), t.a);
          }`,
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
      });
      rings = new THREE.Mesh(rg, rm);
      rings.rotation.x = -Math.PI / 2 + (b.tilt || 0);
      obj.add(rings);
    }
    // a constant-size dot so tiny distant planets stay visible
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(...(b.atmo || [0.8, 0.8, 0.8])), sizeAttenuation: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    dot.scale.setScalar(0.012);
    return { obj, mesh, mat, clouds, atm, rings, kind: 'planet', dot };
  }

  _makeBlackHole(b) {
    const obj = new THREE.Group();
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    obj.add(horizon);
    const inner = 3, outer = 3 + 22 * b.disk + 6;
    const dg = new THREE.RingGeometry(inner, outer, 256, 4);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIn: { value: inner }, uOut: { value: outer }, uI: { value: 0.6 + b.disk } },
      vertexShader: `varying vec3 vL; varying vec3 vVw; varying vec3 vTan;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vL = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vVw = normalize(-mv.xyz);
          vec3 t = normalize(vec3(-position.y, position.x, 0.0)); vTan = normalize(normalMatrix * t);
          gl_Position = projectionMatrix*mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform float uIn; uniform float uOut; uniform float uI; varying vec3 vL; varying vec3 vVw; varying vec3 vTan;
        ${NOISE_GLSL} ${BLACKBODY_GLSL}
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          float r = length(vL.xy); float th = atan(vL.y, vL.x);
          float x = (r - uIn)/(uOut - uIn);
          float w = pow(uIn / r, 1.5);
          float ang = th + uTime * w * 0.8;
          float n = snoise(vec3(cos(ang)*r*0.35, sin(ang)*r*0.35, log(r)*3.0)) * 0.5 + snoise(vec3(cos(ang)*r*1.2, sin(ang)*r*1.2, uTime*0.1))*0.3;
          float streak = 0.6 + 0.4*sin(ang*3.0 + log(r)*14.0 + n*3.0);
          float T = 16000.0 * pow(uIn / r, 0.75);
          float dop = 1.0 + 0.75 * dot(normalize(vTan), normalize(vVw)) * w;
          vec3 col = blackbody(T * dop) * pow(dop, 3.0);
          float a = smoothstep(0.0, 0.04, x) * smoothstep(1.0, 0.55, x) * (0.55 + n*0.45) * streak * uI;
          gl_FragColor = vec4(col * a * 1.25, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(dg, diskMat);
    disk.rotation.x = -Math.PI / 2 + 0.18;
    obj.add(disk);
    return { obj, mesh: horizon, diskMat, disk, kind: 'blackhole' };
  }

  _makeStation(b) {
    const obj = new THREE.Group();
    const S = (o) => new THREE.MeshStandardMaterial(o);
    const hull = S({ color: 0xd8dbe0, metalness: 0.3, roughness: 0.6 });
    const dark = S({ color: 0x40444b, metalness: 0.7, roughness: 0.4 });
    const win = S({ color: 0x111111, emissive: 0xffd8a0, emissiveIntensity: 2 });
    const solar = S({ color: 0x1a2a66, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide });
    const ringG = new THREE.TorusGeometry(160, 14, 20, 128);
    const ring = new THREE.Mesh(ringG, hull); obj.add(ring);
    const wr = new THREE.Mesh(new THREE.TorusGeometry(174, 1.6, 6, 128), win); obj.add(wr);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 120, 32).rotateX(Math.PI / 2), dark); obj.add(hub);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 134, 10), hull);
      sp.position.set(Math.cos(a) * 93, Math.sin(a) * 93, 0); sp.rotation.z = a - Math.PI / 2; obj.add(sp);
    }
    // dry-dock gantry
    for (let i = 0; i < 4; i++) {
      const gz = 90 + i * 60;
      const fr = new THREE.Mesh(new THREE.TorusGeometry(70, 3, 6, 4), dark); fr.position.z = gz; fr.rotation.z = Math.PI / 4; obj.add(fr);
    }
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; const beam = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 200), dark); beam.position.set(Math.cos(a) * 49, Math.sin(a) * 49, 180); obj.add(beam); }
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(260, 1, 50), solar); p.position.set(0, s * 60, -120); p.rotation.x = Math.PI / 2; obj.add(p); const p2 = p.clone(); p2.position.set(s * 160, 0, -120); p2.rotation.set(0, 0, Math.PI / 2); p2.rotation.x = Math.PI / 2; obj.add(p2); }
    const lamp = new THREE.PointLight(0xffe0c0, 4e3, 1500, 2); lamp.position.set(0, 0, 200); obj.add(lamp);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    return { obj, kind: 'station', spin: ring };
  }

  // ── per-frame update ───────────────────────────────────────────────────────
  update(ship, t, dt, camera, light) {
    this.time += dt;
    const sys = SYS_BY_ID[ship.sys];
    const vel = ship.velocity; // m/s, from main
    const beta = this.relOptics ? [vel[0] / C, vel[1] / C, vel[2] / C] : [0, 0, 0];
    if (ship.warpOn) { const f = ship.fwd; beta[0] = f[0] * 0.97; beta[1] = f[1] * 0.97; beta[2] = f[2] * 0.97; }
    this.beta.set(beta[0], beta[1], beta[2]);
    this.sky.position.copy(camera.position);

    // other systems as points
    const sp = this.sysStars.geometry.attributes.position, st = this.sysStars.geometry.attributes.aTemp, sm = this.sysStars.geometry.attributes.aMag;
    const gShip = add(sys.pos, ship.p);
    this.sysDirs = [];
    SYSTEMS.forEach((s, i) => {
      const lum = s.bodies.filter(b => b.temp).reduce((L, b) => L + (b.radius / RSUN) ** 2 * (b.temp / 5772) ** 4, 0);
      const temp = (s.bodies.find(b => b.temp) || { temp: 5000 }).temp;
      const rel = sub(s.pos, gShip);
      const d = len(rel);
      const dir = [rel[0] / d, rel[1] / d, rel[2] / d];
      sp.setXYZ(i, dir[0], dir[1], dir[2]);
      st.setX(i, temp);
      const pc = d / (3.0857e16);
      let m = 4.83 - 2.5 * Math.log10(lum || 1e-4) + 5 * Math.log10(Math.max(pc, 1e-9) / 10);
      if (s === sys) m = 99;
      if (s.id === 'sgra') m = Math.min(m, 1.5);
      sm.setX(i, Math.max(-3, m));
      this.sysDirs.push({ sys: s, dir, d });
    });
    sp.needsUpdate = st.needsUpdate = sm.needsUpdate = true;

    // current system meshes
    for (const [id, e] of this.sysGroups) e.group.visible = id === sys.id;
    const entry = this._ensureSystem(sys);
    entry.group.visible = true;
    this.currentViews = entry.views;
    let lensing = null;
    const starState = { p: [0, 0, 0] };
    let lightDir = null, lightI = 0.0;
    for (const v of entry.views) {
      const b = v.body;
      const s = bodyState(b, t);
      const rel = sub(s.p, ship.p);
      const d = len(rel);
      const n = [rel[0] / d, rel[1] / d, rel[2] / d];
      const ab = aberrateDir(n, beta);
      const rd = compress(d);
      const k = rd / d;
      v.obj.position.set(ab.dir[0] * rd, ab.dir[1] * rd, ab.dir[2] * rd);
      v.dist = d; v.renderDir = ab.dir; v.state = s;
      if (v.kind === 'star') {
        v.obj.scale.setScalar(1);
        v.mesh.scale.setScalar(b.radius * k);
        const ang = b.radius / d;
        v.glow.scale.setScalar(Math.max(b.radius * k * (ang > 0.02 ? 3.2 : 9), rd * 0.012 * Math.min(1, Math.sqrt(b.temp / 6000))));
        v.glow.material.opacity = ang > 0.02 ? 0.5 : Math.min(1, 0.6 + ang * 50);
        v.mat.uniforms.uTime.value = this.time;
        // light from the brightest star
        const L = (b.radius / RSUN) ** 2 * (b.temp / 5772) ** 4;
        const I = L * (AU / d) ** 2;
        if (I > lightI) { lightI = I; lightDir = n; }
      } else if (v.kind === 'planet') {
        v.obj.scale.setScalar(b.radius * k);
        // light direction = from the system star to the planet
        const toStar = sub([0, 0, 0], s.p); const ls = len(toStar) || 1;
        v.mat.uniforms.uLight.value.set(toStar[0] / ls, toStar[1] / ls, toStar[2] / ls);
        const star = sys.star;
        const Lst = star.temp ? (star.radius / RSUN) ** 2 * (star.temp / 5772) ** 4 : 0.5;
        v.mat.uniforms.uLightI.value = Math.min(2.2, Math.max(0.25, Math.pow(Lst * (AU / ls) ** 2, 0.25)));
        if (v.clouds) v.clouds.rotation.y = this.time * 0.003;
        v.mesh.rotation.y = t * 2 * Math.PI / 86400 * (b.name === 'Earth' ? 1 : 0.4);
        v.dot.position.copy(v.obj.position);
        const angPx = (b.radius / d) / (camera.fov * Math.PI / 180) * window.innerHeight;
        v.dot.material.opacity = angPx > 4 ? 0 : 0.9;
        v.dot.visible = angPx <= 4;
      } else if (v.kind === 'blackhole') {
        v.obj.scale.setScalar(b.radius * k);
        v.diskMat.uniforms.uTime.value = this.time;
        if (d < 2e5 * b.radius) {
          lensing = { pos: v.obj.position.clone(), thetaE: Math.min(0.9, Math.sqrt(2 * b.radius / d)), shadow: Math.min(1.2, 2.6 * b.radius / d) };
        }
      } else if (v.kind === 'station') {
        v.obj.visible = d < 5e7;
        v.obj.scale.setScalar(k);
        v.spin.rotation.z += dt * 0.05;
        // orient station toward the planet (fixed-ish)
        v.obj.rotation.set(0.3, t * 2 * Math.PI / b.period, 0);
      }
    }
    // stars in current system point light direction for ship
    if (lightDir) {
      light.position.set(lightDir[0], lightDir[1], lightDir[2]).multiplyScalar(1000);
      light.intensity = 3.0 * Math.min(1.15, Math.max(0.05, Math.pow(lightI, 0.3)));
    } else {
      light.intensity = 0.3;
    }
    this.lensing = lensing;
  }
}

// ── gravitational lensing post-process ───────────────────────────────────────
export const LensShader = {
  uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uThetaE: { value: 0 }, uShadow: { value: 0 }, uAspect: { value: 1 }, uTanHalf: { value: 0.5 }, uOn: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uCenter; uniform float uThetaE; uniform float uShadow; uniform float uAspect; uniform float uTanHalf; uniform float uOn; varying vec2 vUv;
    void main(){
      if (uOn < 0.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 p = (vUv - 0.5) * 2.0; p.x *= uAspect; p *= uTanHalf;
      vec2 c = (uCenter - 0.5) * 2.0; c.x *= uAspect; c *= uTanHalf;
      vec2 d = p - c; float r = max(length(d), 1e-6);
      float beta = r - uThetaE * uThetaE / r;
      vec2 s = c + d / r * beta;
      vec2 suv = s / uTanHalf; suv.x /= uAspect; suv = suv * 0.5 + 0.5;
      vec3 col = texture2D(tDiffuse, clamp(suv, 0.001, 0.999)).rgb;
      float edge = smoothstep(0.0, 0.03, min(min(suv.x, 1.0 - suv.x), min(suv.y, 1.0 - suv.y)));
      col = mix(texture2D(tDiffuse, vUv).rgb * 0.2, col, edge);
      // magnification brightening near the Einstein ring
      float mag = clamp(1.0 / abs(1.0 - pow(uThetaE / r, 4.0)), 1.0, 3.0);
      col *= mix(1.0, mag, 0.35);
      float ring = exp(-pow((r - uShadow * 1.04) / (uShadow * 0.035 + 1e-5), 2.0));
      col += vec3(1.0, 0.85, 0.6) * ring * 0.9;
      if (r < uShadow) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
