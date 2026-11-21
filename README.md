# Stellar Drive Works

An interstellar flight and starship-company simulator that runs in the browser. Found a company in 2150, research ten propulsion systems, build ships in your orbital shipyard, take contracts, and fly them yourself across a relativistic galaxy — from the Moon to Sagittarius A*.

Every drive and part is free and unlocked from the start; contracts still pay credits as a score.

**Play:** open `index.html` in any modern desktop browser (Chrome, Edge, Firefox, Safari). It is a single self-contained file; no server or internet connection is needed.

## Modes

| Mode | What it is |
|---|---|
| **New company** | Career: contracts, credits as your score, start at the orbital shipyard |
| **Flight simulator** | No company or contracts. Start on a launch pad on Earth and fly anywhere |
| **Sandbox** | Everything unlocked, plus teleport, invincibility, infinite fuel and drones |

### Launch from Earth

In the Flight simulator (or with Sandbox → *Put on Earth launch pad*), your ship stands on a pad on the rotating Earth, on top of a two-stage booster sized to it. Press **LAUNCH**. **You control the staging:**
- When a stage burns out, its engines go quiet, time warp drops to 1×, and the **STAGE** button pulses.
- Press it (or **Space** / **G**) to separate. You can also stage early.
- At orbit, press it once more to jettison the booster and switch to your own drive.

Ascent guidance steers the gravity turn for you, toward roughly a 250 km orbit. Turn it off with the *Ascent guidance* chip on the pad to fly the whole ascent yourself, or press **1** mid-flight to take over. There is no atmospheric drag; the sky fades from blue to black as you climb.

### Flying

- **Flight assist** (**U**, on by default): while you throttle by hand, the ship goes where the nose points. It bleeds off sideways drift and cancels local gravity. Turn it off for pure orbital mechanics.
- **Predicted path:** a cyan line shows where you'll coast. It turns red where it hits the surface.
- **AMED phases are yours to fire:** when you fly an AMED yourself, a phase button works like staging.
  - **Ignite antimatter · Phase 2** lights up once you pass 0.15c. Clicking it opens the ramscoop and arms the antimatter.
  - **Deploy parachute · Phase 3** comes next, and the cycle returns to **Phase 1**.
  - You can also click a card on the dossier timeline, or press **Space** / **G**.
  - The autopilot runs the phases automatically when it is flying.

## Multiplayer

HQ → **Multiplayer**: one player hosts and shares a 5-letter room code, and friends join with it.
- Everyone sees each other's ships live, and the host's clock and time warp apply to the whole room.
- **Fly to them** puts you in formation with another pilot.
- Connections are peer-to-peer (WebRTC via PeerJS). By default they use the free public PeerJS signalling server.
- To use your own server, run `npx peer --port 9000` and open the game with `?peer=yourhost:9000`.
- Multiplayer needs the game served from a normal web host (Vercel, local, etc.), because sandboxed embeds can block the signalling connection.

## Propulsion systems

| Drive | Basis | What it does in the game |
|---|---|---|
| Chemical rocket | Methalox / hydrolox | Huge thrust, ~8.5 km/s Δv. Moon and near-Earth work. |
| Nuclear thermal | NERVA heritage | Twice chemical efficiency; waits for Mars launch windows. |
| Ion / plasma | Gridded ion, VASIMR-class | Tiny thrust, big Δv, spiral escapes. |
| Orion nuclear pulse | Project Orion (1958–65) | Pulse units detonate behind an animated pusher plate. |
| Daedalus ICF fusion | BIS study (1973–78) | Real two-stage numbers; stage 1 separates. Flyby only. |
| Bussard ramjet | Bussard (1960) | 2,500 km scoop; unlimited range above 0.01c; magsail braking. |
| **AMED hybrid** | Your dossier | Three-phase Orion → antimatter ram → magnetic parachute → flip-and-burn. |
| Beamed-core antimatter | p–p̄ pion rocket | 0.33c exhaust, eye-watering fuel prices. |
| Black hole drive | Crane & Westmoreland (2009) | 200,000-tonne Kugelblitz at the focus of a gamma mirror. Photon rocket. |
| Alcubierre warp ring | Speculative | Up to 2,000c, must engage ≥ 20 AU from any star. |

### AMED three-phase hybrid

The AMED model and flight logic follow the technical dossier:

- **Phase 1, 0 → 0.15c:** the ramscoop stays off; D/Li-6 pellets fire through the iris detonation door against the magnetic pusher plate.
- **Phase 2, 0.15c → 0.50c+:** the YBCO ramscoop opens. Scooped hydrogen is detonated with nanogram antimatter sparks, and the pellet forge refills the tanks from scooped deuterium.
- **Phase 3A:** the scoop expands past 10,000 km as a magnetic parachute down to ~0.10c.
- **Phase 3B:** the ship flips and burns forged pellets into orbit.

Autopilot to Proxima b takes about 15.6 Earth-years, or 14.7 years of ship time.

## Ship designer

In HQ → **Shipyard**, pick a drive section, then stack up to 8 modules in front of it. You can use the presets or build your own, and reorder (▲▼) or remove (✕) modules. The 3D preview and the performance table update live.

| Module | Effect |
|---|---|
| Command module | Crew of 6; controls the ship |
| Science bus | Minimum probe payload |
| Habitat ring | 24 crew, rotating gravity; makes the ship an **Explorer** |
| Colony module | 1,200 colonists; makes it a **Colony Ark** |
| Extra propellant tank | +25% of the drive's propellant |
| Cargo pods | +25% pay on repeatable contracts (up to 4) |
| Dust shield | Raises the safe cruise speed |
| Radiator array | +8% thrust (up to 3) |
| Strap-on engine | Half-size copy of your drive: +50% thrust and propellant each (fit 2, 3 or 4) |
| Warp ring | Alcubierre drive for any ship: up to 1,000c, 20 units of exotic matter |
| Truss spacer | Structural spacing |
| Solar array | 4 MW at 1 AU (fades with distance); +20% ion thrust |
| Fission reactor | 40 MW steady power |
| Capacitor bank | +600 MJ weapon energy |
| Laser turrets | Instant hit, 25 damage, 30 km range |
| Railgun turrets | 30 km/s leading slugs, 70 damage, 100 km range |
| Missile pods | 8 homing missiles, 120 damage, 500 km range |

Every module adds mass, so it costs Δv and acceleration. You can fit up to 12 modules. Docked ships can be refitted from the Fleet tab.

## Weapons and sandbox

- Press **J** to launch target drones, **Y** to cycle the lock, and hold **F** to fire. Turrets track the locked drone.
- Weapons draw from the ship's capacitor, which recharges from reactor and solar power.
- Career mode has a repeatable *Weapons Certification* contract.

**Sandbox mode** (on the title screen) has its own save. It gives you:
- unlimited funds, with every drive and part unlocked
- teleporting into orbit around any body
- invincibility and infinite fuel
- a drone launcher and clock skips

## Touch, trackpad and saving

- **Touchscreens** (phones, tablets and touch laptops) get on-screen controls automatically:
  - a joystick for pitch and yaw, plus roll buttons
  - a throttle slider, a fire button and a "Go to" autopilot button
  - drag the sky to look, and pinch to zoom
  - small screens switch to a compact layout; tap **Info** for the flight panels
- You can force touch controls on or off in Settings.
- **Trackpads:** click-drag to look, two-finger scroll or pinch to zoom.
- **Saving:** progress saves automatically to **IndexedDB**, falling back to localStorage. It saves every 10 seconds, after purchases and contracts, and when the tab is hidden or closed. Older localStorage saves are migrated on first load.

## Physics

- Relativistic rocket integration on proper velocity (u = γv), so ships approach but never reach c. The game tracks Earth time and ship proper time separately.
- Ram thrust is `γρAv(√(v² + 2εc²) − v)`. Magnetic-sail drag is `ρAv²γ²`, using an interstellar medium of about 1 proton per cm³.
- Gravity comes from every body in the current system, with planets moving on rails. Star systems use real RA/Dec and distances, and the ship rebases between systems.
- Autopilot modes:
  - Lambert-solver transfers with a porkchop launch-window search
  - Patched-conic escapes
  - A relativistic brachistochrone with a braking profile integrated for each engine
  - Orbit insertion
- Relativistic optics: aberration and Doppler shift of the starfield, the Milky Way and every body.
- Gravitational lensing post-process near black holes (Gaia BH1, Cygnus X-1, Sagittarius A*). Accretion disks show Doppler beaming.
- Dust erosion: flying faster than a ship's shield rating erodes the hull.

## Controls

| Key | Action |
|---|---|
| W/S, A/D, Q/E | Pitch, yaw, roll |
| Shift / Ctrl | Throttle up / down |
| Z / X | Full throttle / cut |
| `,` `.` `/` | Slower / faster time warp, reset |
| T, N | Next target, target list |
| 1–6 | Autopilot: off, prograde, retrograde, face target, go to and orbit, flyby |
| R, B | Ramscoop, magnetic sail |
| G, V, `[` `]` | Stage (Daedalus), warp engage, warp speed |
| M, C, H, P, ? | Map, camera, headquarters, pause, help |

Easiest start: the Moon is pre-targeted. Press **5**, then raise time warp with **.**

## Deploy to Vercel

The repo is set up for Vercel with no extra configuration (`vercel.json`). Vercel runs `npm install` and `npm run build`, then serves the static `dist/` folder.

1. Push this repo to GitHub.
2. On vercel.com, choose **Add New → Project**, import the repo, and press **Deploy**. The framework preset is ignored because `vercel.json` sets the build itself.

Or, from the command line:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

Any other static host (Netlify, GitHub Pages, Cloudflare Pages) works the same way: build command `npm run build`, output directory `dist`.

## Development

```bash
npm install
npm run build      # bundles src/ into index.html
npm run dev        # rebuild on change
```

Source lives in `src/`:

- `data.js`: engines, systems and contracts
- `physics.js`: integration, engines, Lambert solver and autopilot
- `shipModels.js`: procedural starship models
- `universe.js`: sky, planets, black holes and lensing
- `effects.js`: plumes, pulses and fields
- `ui.js`: HUD, maps and HQ
- `main.js`: game loop

Progress saves to the browser's localStorage.
