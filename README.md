# Stellar Drive Works

An interstellar flight and starship-company simulator that runs in the browser. Found a company in 2150, research ten propulsion systems, build ships in your orbital shipyard, take contracts, and fly them yourself across a relativistic galaxy — from the Moon to Sagittarius A*.

**Play:** open `index.html` in any modern desktop browser (Chrome, Edge, Firefox, Safari). It is a single self-contained file; no server or internet connection is needed.

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
