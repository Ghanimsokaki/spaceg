// ─────────────────────────────────────────────────────────────────────────────
//  Game data: physical constants, engines, ship configurations, star systems,
//  contracts. All physics in SI units (m, s, kg, N).
// ─────────────────────────────────────────────────────────────────────────────

export const C = 299792458;            // speed of light, m/s
export const G = 6.674e-11;            // gravitational constant
export const AU = 1.495978707e11;      // m
export const LY = 9.4607304725808e15;  // m
export const YEAR = 31557600;          // Julian year, s
export const DAY = 86400;
export const MSUN = 1.989e30;
export const RSUN = 6.957e8;
export const MEARTH = 5.972e24;
export const REARTH = 6.371e6;
export const RHO_ISM = 1.67e-21;       // ~1 proton per cm³ (kg/m³)
export const G0 = 9.80665;

// ─────────────────────────────────────────────────────────────────────────────
//  ENGINES
//  thrust: N, ve: effective exhaust velocity (ship frame) m/s,
//  dry: engine+structure dry mass kg, fuel: main propellant capacity kg
//  rated: dust/radiation shield rating as fraction of c
//  cost / research: billions of credits
// ─────────────────────────────────────────────────────────────────────────────
export const ENGINES = {
  chem: {
    key: 'chem', name: 'Chemical Rocket', short: 'CHEM', tier: 0,
    era: 'Methalox / Hydrolox bipropellant',
    thrust: 4.0e6, ve: 3700, dry: 45000, fuel: 450000, fuelName: 'LOX/CH₄',
    fuelPrice: 0.0000000008, // $B per kg (~$0.8/kg)
    rated: 0.001, cost: 0.4, research: 0, rep: 0,
    configs: ['probe', 'explorer'],
    color: '#ffb347',
    blurb: 'The workhorse that got humanity off Earth. Enormous thrust, terrible efficiency. Good for lunar and near-Earth work only.',
    facts: ['Specific impulse ≈ 380 s', 'Thrust-to-weight > 100', 'Δv ≈ 8–9 km/s for a light ship'],
  },
  ntr: {
    key: 'ntr', name: 'Nuclear Thermal Rocket', short: 'NTR', tier: 1,
    era: 'NERVA heritage solid-core fission',
    thrust: 3.3e5, ve: 9000, dry: 60000, fuel: 240000, fuelName: 'Liquid H₂',
    fuelPrice: 0.000000003, rated: 0.001, cost: 1.4, research: 1.0, rep: 1,
    configs: ['probe', 'explorer'],
    color: '#9fe6ff',
    blurb: 'A fission reactor heats hydrogen to 2,800 K and blasts it out a single nozzle. Twice the efficiency of chemistry; the classic Mars-mission engine.',
    facts: ['Isp ≈ 900 s', 'Reactor core ≈ 1,500 MW thermal', 'Shadow-shield protects crew'],
  },
  ion: {
    key: 'ion', name: 'Ion / Plasma Drive', short: 'ION', tier: 1,
    era: 'Gridded xenon ion + VASIMR-class plasma',
    thrust: 4.0e3, ve: 60000, dry: 40000, fuel: 60000, fuelName: 'Xenon / Argon',
    fuelPrice: 0.00000002, rated: 0.002, cost: 1.0, research: 1.0, rep: 1,
    configs: ['probe', 'explorer'],
    color: '#5aa8ff',
    blurb: 'Whisper-thin thrust sustained for months. Huge Δv, but you will spend a lot of time in time-warp. Powered by enormous solar wings.',
    facts: ['Isp ≈ 6,000 s', 'Thrust ≈ 4 kN', 'Efficient for outer-planet cargo'],
  },
  orion: {
    key: 'orion', name: 'Orion Nuclear Pulse', short: 'ORION', tier: 2,
    era: 'Project Orion (1958–1965) pusher-plate propulsion',
    thrust: 2.2e7, ve: 150000, dry: 1.6e6, fuel: 3.0e6, fuelName: 'Pulse units',
    fuelPrice: 0.0000002, rated: 0.01, cost: 6, research: 4, rep: 3,
    configs: ['probe', 'explorer', 'ark'], pulse: true,
    color: '#ffd27a',
    blurb: 'Small shaped nuclear charges are ejected through the pusher plate and detonated behind the ship. The plate and two-stage shock absorbers turn each blast into a shove. Brutal, cheap, and fast across the Solar System.',
    facts: ['Pusher plate Ø 40 m, graphite-oiled steel', 'One pulse unit per ~1 s', 'Isp ≈ 15,000 s (fusion-boosted units)'],
  },
  daedalus: {
    key: 'daedalus', name: 'Daedalus ICF Fusion', short: 'DAEDALUS', tier: 3,
    era: 'British Interplanetary Society study (1973–1978)',
    // Stage 1 numbers; stage 2 handled by `stage2`
    thrust: 7.54e6, ve: 1.06e7, dry: 1.69e6, fuel: 4.6e7, fuelName: 'D/He³ pellets',
    stage2: { thrust: 6.63e5, ve: 9.21e6, dry: 9.8e5, fuel: 4.0e6 },
    fuelPrice: 0.0000003, rated: 0.15, cost: 25, research: 15, rep: 6,
    configs: ['probe'], staged: true, flybyOnly: true,
    color: '#c9a2ff',
    blurb: 'Two-stage inertial-confinement fusion probe. 250 deuterium/helium-3 pellets per second are crushed by electron beams inside a 100 m reaction chamber. Reaches 12% of light speed — but it cannot stop. Flyby missions only.',
    facts: ['Stage 1: 7.54 MN for 2.05 yr', 'Stage 2: 663 kN for 1.76 yr', 'Beryllium erosion shield, 50 t', 'Designed for Barnard’s Star in 50 yr'],
  },
  bussard: {
    key: 'bussard', name: 'Bussard Ramjet', short: 'RAMJET', tier: 4,
    era: 'Robert W. Bussard (1960) interstellar ramjet',
    thrust: 1.6e7, ve: 5.0e6, dry: 2.4e6, fuel: 1.5e6, fuelName: 'D-He³ booster',
    ram: { area: 2.0e13, eps: 0.0035, minBeta: 0.01 }, magsail: { area: 6.0e11 },
    fuelPrice: 0.0000003, rated: 0.6, cost: 60, research: 40, rep: 10,
    configs: ['probe', 'explorer', 'ark'],
    color: '#7affd4',
    blurb: 'A 2,500 km electromagnetic scoop gathers interstellar hydrogen and burns it in a proton fusion reactor. Needs a fusion booster to reach 1% c, then the galaxy is its fuel tank. Brakes with its scoop as a magnetic sail.',
    facts: ['Scoop field radius ≈ 2,500 km', 'Thrust grows with speed', 'Unlimited range above 0.01c'],
  },
  amed: {
    key: 'amed', name: 'AMED Hybrid Drive', short: 'AMED', tier: 5,
    era: 'Antimatter-Matter Explosion Drive · three-phase hybrid',
    // Phase 1 & 3B — antimatter-catalysed D/Li-6 pellets through the iris door
    thrust: 1.5e7, ve: 3.0e7, dry: 4.0e6, fuel: 1.6e7, fuelName: 'D/Li-6 pellets',
    fuel2: 0.010, fuel2Name: 'Antimatter (p̄ / e⁺)', fuel2Price: 100, // $B per kg (≈$1B / 10 g)
    ram: { area: 2.85e13, eps: 0.0035, minBeta: 0.15, amRate: 1e-11, forge: 0.03 },
    magsail: { area: 1.6e12 },
    fuelPrice: 0.0000003, rated: 0.55, cost: 90, research: 60, rep: 12,
    configs: ['probe', 'explorer', 'ark'],
    color: '#00e5ff',
    blurb: 'Three-phase hybrid starship. Phase 1: cheap Orion-style fusion pellets fired through the iris door against the magnetic pusher plate take the ship to 0.15c with the YBCO ramscoop off. Phase 2: the scoop opens, interstellar hydrogen self-compresses in the speed-magnet coils and is detonated with nanogram antimatter sparks — cruise to 0.50c+ while the pellet forge refills the tanks. Phase 3: the scoop widens past 10,000 km as a magnetic parachute down to 0.10c, then flip-and-burn on forged pellets.',
    facts: ['0.50c+ cruise · ~12–15 yr to Proxima', 'YBCO ramscoop > 10,000 km expanded', 'Dual 0.8 g counter-rotating habitats', '99.99% antimatter reduction via hybrid cycle'],
  },
  antimatter: {
    key: 'antimatter', name: 'Beamed-Core Antimatter', short: 'ANTIMATTER', tier: 6,
    era: 'Proton–antiproton pion rocket, magnetic nozzle',
    thrust: 2.0e7, ve: 0.33 * C, dry: 3.0e6, fuel: 1.0e7, fuelName: 'H / H̄ (1:1)',
    fuelPrice: 0.002, rated: 0.7, cost: 150, research: 100, rep: 16,
    configs: ['probe', 'explorer', 'ark'],
    color: '#ff5fd2',
    blurb: 'Pure annihilation. Charged pions from proton–antiproton reactions are steered by a magnetic nozzle at a third of light speed. Ferociously expensive fuel, staggering performance.',
    facts: ['Exhaust ≈ 0.33c', 'Penning-trap antihydrogen storage', 'Gamma shielding is most of the dry mass'],
  },
  blackhole: {
    key: 'blackhole', name: 'Black Hole Drive', short: 'KUGELBLITZ', tier: 7,
    era: 'Crane & Westmoreland (2009) Hawking-radiation starship',
    // Photon rocket: thrust = P/c, mass flow = P/c² (fed into the hole)
    thrust: 4.9e9, ve: C, dry: 3.0e8, fuel: 3.0e9, fuelName: 'Feed mass (any matter)',
    bh: { mass: 2.0e8 },
    fuelPrice: 0.0000000005, rated: 0.995, cost: 400, research: 250, rep: 22,
    configs: ['probe', 'explorer', 'ark'],
    color: '#ffffff',
    blurb: 'An artificial black hole of 200,000 tonnes — smaller than a proton — sits at the focus of a gamma-ray reflector dish. Its Hawking radiation (~1.5 exawatts) is the exhaust. Feed it matter to keep it from evaporating. A true photon rocket: the stars are within reach.',
    facts: ['Hawking temperature ≈ 6×10¹⁴ K', 'Schwarzschild radius ≈ 0.3 attometres', 'Exhaust velocity = c'],
  },
  warp: {
    key: 'warp', name: 'Alcubierre Warp Ring', short: 'WARP', tier: 8,
    era: 'Speculative: Alcubierre (1994) metric, exotic negative energy',
    thrust: 2.0e7, ve: 5.0e6, dry: 2.0e6, fuel: 5.0e6, fuelName: 'D-He³ (sublight)',
    fuel2: 100, fuel2Name: 'Exotic matter (units)', fuel2Price: 4,
    warp: { maxC: 2000, perLy: 0.002, minAU: 20 },
    fuelPrice: 0.0000003, rated: 0.1, cost: 1200, research: 800, rep: 30,
    configs: ['probe', 'explorer', 'ark'],
    color: '#8fb4ff', speculative: true,
    blurb: 'Purely theoretical. A ring of exotic negative energy contracts space ahead and expands it behind. Inside the bubble the ship is in free fall — no time dilation, no acceleration felt. Must be engaged far from any star.',
    facts: ['Up to 2,000c', 'Must be ≥ 20 AU from any star', '1 unit exotic matter ≈ 500 ly'],
  },
};
export const ENGINE_ORDER = ['chem', 'ntr', 'ion', 'orion', 'daedalus', 'bussard', 'amed', 'antimatter', 'blackhole', 'warp'];

export const CONFIGS = {
  probe:    { key: 'probe', name: 'Probe', payload: 5000, cost: 0.1, crew: 0, desc: 'Uncrewed science bus' },
  explorer: { key: 'explorer', name: 'Explorer', payload: 300000, cost: 3, crew: 24, desc: 'Crewed, rotating habitat' },
  ark:      { key: 'ark', name: 'Colony Ark', payload: 2.0e7, cost: 40, crew: 1200, desc: '1,200 colonists, bio-domes, cargo' },
};

// ─────────────────────────────────────────────────────────────────────────────
//  STAR SYSTEMS  (RA°, Dec°, distance ly) → galactic-ish world coords
// ─────────────────────────────────────────────────────────────────────────────
const AUm = AU;
function P(name, o) { return { name, ...o }; }

export const SYSTEMS = [
  {
    id: 'sol', name: 'Sol', ra: 0, dec: 0, dist: 0,
    bodies: [
      P('Sun', { type: 'star', mass: MSUN, radius: RSUN, temp: 5772 }),
      P('Mercury', { type: 'planet', mass: 3.301e23, radius: 2.4397e6, a: 0.387 * AUm, period: 87.97 * DAY, phase: 1.2, tex: 'mercury' }),
      P('Venus', { type: 'planet', mass: 4.867e24, radius: 6.0518e6, a: 0.723 * AUm, period: 224.7 * DAY, phase: 4.1, tex: 'venus', atmo: [1.0, 0.85, 0.55] }),
      P('Earth', { type: 'planet', mass: MEARTH, radius: REARTH, a: 1.0 * AUm, period: 365.256 * DAY, phase: 0.0, tex: 'earth', atmo: [0.35, 0.6, 1.0], tilt: 0.41 }),
      P('Moon', { type: 'moon', parent: 'Earth', mass: 7.342e22, radius: 1.7374e6, a: 3.844e8, period: 27.32 * DAY, phase: 2.0, tex: 'moon' }),
      P('Shipyard', { type: 'station', parent: 'Earth', mass: 0, radius: 400, a: 4.2164e7, period: 86164, phase: 0.6 }),
      P('Mars', { type: 'planet', mass: 6.417e23, radius: 3.3895e6, a: 1.524 * AUm, period: 686.98 * DAY, phase: 2.6, tex: 'mars', atmo: [1.0, 0.6, 0.4] }),
      P('Ceres', { type: 'planet', mass: 9.39e20, radius: 4.73e5, a: 2.77 * AUm, period: 1680 * DAY, phase: 5.4, tex: 'ceres' }),
      P('Jupiter', { type: 'planet', mass: 1.898e27, radius: 6.9911e7, a: 5.203 * AUm, period: 4332.6 * DAY, phase: 3.3, tex: 'jupiter', atmo: [1.0, 0.9, 0.75] }),
      P('Saturn', { type: 'planet', mass: 5.683e26, radius: 5.8232e7, a: 9.537 * AUm, period: 10759 * DAY, phase: 5.0, tex: 'saturn', rings: true, atmo: [1.0, 0.9, 0.7], tilt: 0.47 }),
      P('Titan', { type: 'moon', parent: 'Saturn', mass: 1.345e23, radius: 2.5747e6, a: 1.2219e9, period: 15.945 * DAY, phase: 1.0, tex: 'titan', atmo: [1.0, 0.7, 0.3] }),
      P('Uranus', { type: 'planet', mass: 8.681e25, radius: 2.5362e7, a: 19.19 * AUm, period: 30687 * DAY, phase: 0.8, tex: 'uranus', atmo: [0.6, 0.9, 1.0] }),
      P('Neptune', { type: 'planet', mass: 1.024e26, radius: 2.4622e7, a: 30.07 * AUm, period: 60190 * DAY, phase: 2.2, tex: 'neptune', atmo: [0.4, 0.6, 1.0] }),
    ],
  },
  {
    id: 'proxima', name: 'Proxima Centauri', ra: 217.429, dec: -62.68, dist: 4.2465,
    bodies: [
      P('Proxima Centauri', { type: 'star', mass: 0.122 * MSUN, radius: 0.154 * RSUN, temp: 3042 }),
      P('Proxima b', { type: 'planet', mass: 1.07 * MEARTH, radius: 1.03 * REARTH, a: 0.0485 * AUm, period: 11.19 * DAY, phase: 0.5, tex: 'ocean', atmo: [0.6, 0.7, 1.0], seed: 11 }),
      P('Proxima d', { type: 'planet', mass: 0.26 * MEARTH, radius: 0.81 * REARTH, a: 0.0288 * AUm, period: 5.12 * DAY, phase: 3.0, tex: 'lava', seed: 12 }),
    ],
  },
  {
    id: 'alphacen', name: 'Alpha Centauri', ra: 219.90, dec: -60.834, dist: 4.344,
    bodies: [
      P('Alpha Centauri A', { type: 'star', mass: 1.1 * MSUN, radius: 1.22 * RSUN, temp: 5790 }),
      P('Alpha Centauri B', { type: 'star2', mass: 0.907 * MSUN, radius: 0.86 * RSUN, temp: 5260, a: 23.4 * AUm, period: 79.9 * YEAR, phase: 1.0 }),
    ],
  },
  {
    id: 'barnard', name: 'Barnard’s Star', ra: 269.452, dec: 4.6934, dist: 5.963,
    bodies: [
      P('Barnard’s Star', { type: 'star', mass: 0.162 * MSUN, radius: 0.196 * RSUN, temp: 3134 }),
      P('Barnard b', { type: 'planet', mass: 0.37 * MEARTH, radius: 0.75 * REARTH, a: 0.0188 * AUm, period: 3.15 * DAY, phase: 2.0, tex: 'lava', seed: 21 }),
    ],
  },
  {
    id: 'sirius', name: 'Sirius', ra: 101.287, dec: -16.716, dist: 8.611,
    bodies: [
      P('Sirius A', { type: 'star', mass: 2.06 * MSUN, radius: 1.711 * RSUN, temp: 9940 }),
      P('Sirius B', { type: 'star2', mass: 1.02 * MSUN, radius: 0.0084 * RSUN, temp: 25000, a: 20 * AUm, period: 50.1 * YEAR, phase: 2.0 }),
    ],
  },
  {
    id: 'epseri', name: 'Epsilon Eridani', ra: 53.233, dec: -9.458, dist: 10.475,
    bodies: [
      P('Epsilon Eridani', { type: 'star', mass: 0.82 * MSUN, radius: 0.735 * RSUN, temp: 5084 }),
      P('Epsilon Eridani b', { type: 'planet', mass: 0.66 * 317.8 * MEARTH, radius: 0.95 * 6.9911e7, a: 3.53 * AUm, period: 7.37 * YEAR, phase: 1.5, tex: 'gasgiant', seed: 31, atmo: [0.9, 0.8, 0.7] }),
    ],
  },
  {
    id: 'tauceti', name: 'Tau Ceti', ra: 26.017, dec: -15.937, dist: 11.912,
    bodies: [
      P('Tau Ceti', { type: 'star', mass: 0.783 * MSUN, radius: 0.793 * RSUN, temp: 5344 }),
      P('Tau Ceti e', { type: 'planet', mass: 3.93 * MEARTH, radius: 1.5 * REARTH, a: 0.538 * AUm, period: 162.9 * DAY, phase: 0.3, tex: 'desert', seed: 41, atmo: [1.0, 0.8, 0.6] }),
      P('Tau Ceti f', { type: 'planet', mass: 3.93 * MEARTH, radius: 1.5 * REARTH, a: 1.334 * AUm, period: 636 * DAY, phase: 2.9, tex: 'ice', seed: 42, atmo: [0.7, 0.85, 1.0] }),
    ],
  },
  {
    id: 'trappist', name: 'TRAPPIST-1', ra: 346.622, dec: -5.041, dist: 40.66,
    bodies: [
      P('TRAPPIST-1', { type: 'star', mass: 0.0898 * MSUN, radius: 0.1192 * RSUN, temp: 2566 }),
      P('TRAPPIST-1b', { type: 'planet', mass: 1.37 * MEARTH, radius: 1.116 * REARTH, a: 0.01154 * AUm, period: 1.51 * DAY, phase: 0.1, tex: 'lava', seed: 51 }),
      P('TRAPPIST-1c', { type: 'planet', mass: 1.31 * MEARTH, radius: 1.097 * REARTH, a: 0.0158 * AUm, period: 2.42 * DAY, phase: 1.1, tex: 'venus', seed: 52 }),
      P('TRAPPIST-1d', { type: 'planet', mass: 0.39 * MEARTH, radius: 0.788 * REARTH, a: 0.02227 * AUm, period: 4.05 * DAY, phase: 2.1, tex: 'desert', seed: 53 }),
      P('TRAPPIST-1e', { type: 'planet', mass: 0.69 * MEARTH, radius: 0.92 * REARTH, a: 0.02925 * AUm, period: 6.10 * DAY, phase: 3.1, tex: 'ocean', seed: 54, atmo: [0.6, 0.7, 1.0] }),
      P('TRAPPIST-1f', { type: 'planet', mass: 1.04 * MEARTH, radius: 1.045 * REARTH, a: 0.03849 * AUm, period: 9.21 * DAY, phase: 4.1, tex: 'ice', seed: 55 }),
      P('TRAPPIST-1g', { type: 'planet', mass: 1.32 * MEARTH, radius: 1.129 * REARTH, a: 0.04683 * AUm, period: 12.35 * DAY, phase: 5.1, tex: 'ocean', seed: 56 }),
      P('TRAPPIST-1h', { type: 'planet', mass: 0.33 * MEARTH, radius: 0.755 * REARTH, a: 0.06189 * AUm, period: 18.77 * DAY, phase: 0.6, tex: 'ice', seed: 57 }),
    ],
  },
  {
    id: 'gaiabh1', name: 'Gaia BH1', ra: 262.171, dec: -0.581, dist: 1560,
    bodies: [
      P('Gaia BH1', { type: 'blackhole', mass: 9.62 * MSUN, radius: 2 * G * 9.62 * MSUN / (C * C), disk: 0.35 }),
      P('Gaia BH1 companion', { type: 'star2', mass: 0.93 * MSUN, radius: 0.99 * RSUN, temp: 5850, a: 1.4 * AUm, period: 185.6 * DAY, phase: 0.4 }),
    ],
  },
  {
    id: 'cygx1', name: 'Cygnus X-1', ra: 299.590, dec: 35.202, dist: 7240,
    bodies: [
      P('Cygnus X-1', { type: 'blackhole', mass: 21.2 * MSUN, radius: 2 * G * 21.2 * MSUN / (C * C), disk: 1.0 }),
      P('HDE 226868', { type: 'star2', mass: 40.6 * MSUN, radius: 22.2 * RSUN, temp: 31000, a: 0.2 * AUm, period: 5.6 * DAY, phase: 0.0 }),
    ],
  },
  {
    id: 'sgra', name: 'Sagittarius A*', ra: 266.417, dec: -29.008, dist: 26670,
    bodies: [
      P('Sagittarius A*', { type: 'blackhole', mass: 4.3e6 * MSUN, radius: 2 * G * 4.3e6 * MSUN / (C * C), disk: 0.6 }),
      P('S2', { type: 'star2', mass: 14 * MSUN, radius: 6 * RSUN, temp: 28000, a: 1000 * AUm, period: 16.05 * YEAR, phase: 1.0 }),
    ],
  },
];

// RA/Dec → world (Y = north celestial pole). Distances in metres.
export function radecToVec(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return [x, z, -y];
}
for (const s of SYSTEMS) {
  const d = radecToVec(s.ra, s.dec);
  s.pos = [d[0] * s.dist * LY, d[1] * s.dist * LY, d[2] * s.dist * LY];
  s.star = s.bodies[0];
  for (const b of s.bodies) { b.sys = s; b.id = s.id + ':' + b.name; }
}
export const SYS_BY_ID = Object.fromEntries(SYSTEMS.map(s => [s.id, s]));

// Equatorial → galactic rotation (J2000), used for Milky Way rendering
export const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACTS
//  kind: 'orbit' (arrive & orbit target), 'flyby' (pass within radius),
//        'speed' (reach fraction of c)
// ─────────────────────────────────────────────────────────────────────────────
export const CONTRACTS = [
  { id: 'moon', title: 'Lunar Survey', kind: 'orbit', target: 'sol:Moon', reward: 1.2, rep: 1, config: 'probe', desc: 'Map the lunar south pole ice deposits from orbit.' },
  { id: 'mars', title: 'Mars Orbital Survey', kind: 'orbit', target: 'sol:Mars', reward: 3, rep: 1, config: 'probe', desc: 'Deliver a reconnaissance orbiter to Mars.' },
  { id: 'venus', title: 'Venus Cloud Probe', kind: 'orbit', target: 'sol:Venus', reward: 2.5, rep: 1, config: 'probe', desc: 'Sample the sulphuric cloud deck of Venus.' },
  { id: 'mars-crew', title: 'Ares Crew Rotation', kind: 'orbit', target: 'sol:Mars', reward: 6, rep: 2, config: 'explorer', repeat: true, desc: 'Ferry a relief crew to Mars orbit. Repeatable.' },
  { id: 'ceres', title: 'Ceres Mining Claim', kind: 'orbit', target: 'sol:Ceres', reward: 5, rep: 2, config: 'probe', desc: 'Stake the ice-mining claim on Ceres.' },
  { id: 'jupiter', title: 'Jovian Helium-3 Survey', kind: 'orbit', target: 'sol:Jupiter', reward: 9, rep: 3, config: 'probe', desc: 'Map helium-3 concentrations in the Jovian atmosphere.' },
  { id: 'titan', title: 'Titan Expedition', kind: 'orbit', target: 'sol:Titan', reward: 16, rep: 4, config: 'explorer', desc: 'Land a crewed expedition on Titan’s methane shores.' },
  { id: 'neptune', title: 'Neptune Deep Survey', kind: 'orbit', target: 'sol:Neptune', reward: 20, rep: 4, config: 'probe', desc: 'Orbit the ice giant at the edge of the planets.' },
  { id: 'jupiter-haul', title: 'He-3 Tanker Run', kind: 'orbit', target: 'sol:Jupiter', reward: 7, rep: 1, config: 'explorer', repeat: true, desc: 'Run a helium-3 tanker to Jupiter. Repeatable.' },
  { id: 'v01', title: 'Speed Record: 1% c', kind: 'speed', beta: 0.01, reward: 4, rep: 2, desc: 'Become the first company to exceed 3,000 km/s.' },
  { id: 'v10', title: 'Speed Record: 10% c', kind: 'speed', beta: 0.10, reward: 20, rep: 5, desc: 'Break 30,000 km/s.' },
  { id: 'v50', title: 'Speed Record: 50% c', kind: 'speed', beta: 0.50, reward: 80, rep: 10, desc: 'Half the speed of light.' },
  { id: 'v90', title: 'Speed Record: 90% c', kind: 'speed', beta: 0.90, reward: 200, rep: 15, desc: 'Time dilation factor γ > 2.29.' },
  { id: 'v99', title: 'Speed Record: 99% c', kind: 'speed', beta: 0.99, reward: 500, rep: 20, desc: 'γ > 7. Your crew ages one day for every week on Earth.' },
  { id: 'barnard', title: 'Project Daedalus Reborn', kind: 'flyby', target: 'barnard:Barnard’s Star', radius: 2 * AU, reward: 70, rep: 8, desc: 'Fly a probe through Barnard’s Star system, as the BIS planned in 1978.' },
  { id: 'proxima', title: 'Proxima b Orbiter', kind: 'orbit', target: 'proxima:Proxima b', reward: 140, rep: 10, config: 'probe', desc: 'Put a probe in orbit around the nearest exoplanet.' },
  { id: 'alphacen', title: 'Alpha Centauri Expedition', kind: 'orbit', target: 'alphacen:Alpha Centauri A', reward: 260, rep: 12, config: 'explorer', desc: 'First crewed arrival at another star.' },
  { id: 'sirius', title: 'Sirius B Survey', kind: 'orbit', target: 'sirius:Sirius B', reward: 320, rep: 12, config: 'probe', desc: 'Study the white dwarf companion of the brightest star.' },
  { id: 'epseri', title: 'Epsilon Eridani Survey', kind: 'orbit', target: 'epseri:Epsilon Eridani b', reward: 380, rep: 12, config: 'explorer', desc: 'Survey the young gas giant and its debris belts.' },
  { id: 'tauceti', title: 'Tau Ceti Colony', kind: 'orbit', target: 'tauceti:Tau Ceti f', reward: 900, rep: 18, config: 'ark', desc: 'Establish humanity’s first extrasolar colony.' },
  { id: 'trappist', title: 'TRAPPIST-1 Settlement', kind: 'orbit', target: 'trappist:TRAPPIST-1e', reward: 2200, rep: 22, config: 'ark', desc: 'Settle the ocean world of a seven-planet system 40 ly away.' },
  { id: 'gaiabh1', title: 'Nearest Black Hole', kind: 'orbit', target: 'gaiabh1:Gaia BH1', reward: 4000, rep: 25, config: 'probe', desc: 'Observe the dormant black hole Gaia BH1, 1,560 ly away.' },
  { id: 'cygx1', title: 'Cygnus X-1 Expedition', kind: 'orbit', target: 'cygx1:Cygnus X-1', reward: 9000, rep: 30, config: 'explorer', desc: 'Visit the first black hole ever identified.' },
  { id: 'sgra', title: 'Galactic Core', kind: 'orbit', target: 'sgra:Sagittarius A*', reward: 40000, rep: 50, config: 'probe', desc: 'Reach the 4.3-million-solar-mass black hole at the heart of the Milky Way.' },
];

export const START_CREDITS = 6; // $B
export const START_YEAR = 2150;
