# Turbo Racing

An arcade sky racer for web game portals (CrazyGames first, Playgama next).
Ten point-to-point action races from a START gate to a FINISH gate, high in
the sky and out in deep space. Drift to charge turbos, fire nitro, jump the
gaps, dodge the moving obstacles and dive through black holes that warp you
to the next stretch of track.

## Play locally

The game is plain HTML + JavaScript modules: there is no build step. Serve the folder
with any static web server and open it in a browser:

```bash
npx http-server -c-1 .        # or: python3 -m http.server
# then open http://localhost:8080/
```

Add `?platform=local` to the URL to skip the portal SDK while testing.

## Upload to CrazyGames

```bash
./tools/build-zip.sh          # creates dist/turbo-racing.zip (~3.5 MB)
```

Upload `dist/turbo-racing.zip` in the CrazyGames developer portal. `index.html`
is at the zip root and loads the CrazyGames SDK v3.

The SDK integration lives in `src/platform/crazygames.js`:

| Game moment                      | SDK call                          |
|----------------------------------|-----------------------------------|
| Asset loading / track building   | `loadingStart` / `loadingStop`    |
| Race running (incl. resume)      | `gameplayStart`                   |
| Pause, finish, menus             | `gameplayStop`                    |
| Winning a race                   | `happytime`                       |
| Between races (Next/Retry/Menu)  | midgame ad                        |
| "Double coins", "Free 250 coins" | rewarded ads                      |
| Save game                        | `SDK.data` (falls back to localStorage) |

Audio mutes during ads, when the tab is hidden, and when the portal's mute setting is on.

## Porting to another portal (e.g. Playgama)

The game only talks to the small interface described in `src/platform/platform.js`.
To add a portal, write one adapter next to `crazygames.js`, pick it in
`createPlatform()`, and swap the SDK `<script>` tag in `index.html`.

## The game

**Controls:** W/↑ gas, S/↓ brake, A/D steer, SPACE drift, SHIFT/N nitro,
C camera, R reset car, ESC pause. Gamepads work, and phones and tablets get
touch buttons with auto-accelerate.

**Core loop:** every race runs from START to FINISH (no laps). Drift through
corners to charge a 3-tier mini-turbo (blue → orange → purple). Drifting,
airtime, coins and slipstreaming fill the nitro bar. Dodge moving obstacles:
sliding blocks, rolling boulders, spinning bars, swinging hammers and slamming
pistons. On the space tracks the road runs into a black hole: drive in and you
come out of a wormhole on a new stretch of track somewhere else, with a speed
boost. A top-3 finish unlocks the next track; a win earns ★★★. Coins buy cars
and upgrades.

| # | Track | World | Highlights |
|---|-------|-------|-----------|
| 1 | Sunset Skyway | sunset over a cloud-buried city | highway in the sky, fighter jets, sliding blocks |
| 2 | Neon Megacity | rainy cyberpunk night | rooftop skyway, flying traffic, searchlights, hologram billboards |
| 3 | Galaxy Ways | deep space | asteroid fields big and small, ringed planet, **black hole warp** |
| 4 | Canyon Blitz | dust-storm canyon | floating mesas, swinging wrecking balls, spinning bars |
| 5 | Frozen Fortress | blizzard | slippery ice road, ice crushers, ice spikes |
| 6 | Volcano Fury | burning sky | obsidian road with lava cracks, meteor shower, boulders, pistons |
| 7 | Storm Chaser | thunderstorm | tornado with flying debris, tesla coils, real lightning bolts, open edges |
| 8 | Air Strike | military airspace | sky carriers, jets, searchlights, blast doors |
| 9 | Alien Frontier | alien world | UFOs with tractor beams, twin moons, spiral climb, **wormhole warp** |
| 10 | Event Horizon | edge of a giant black hole | space station ring, asteroid storm, **two black hole warps** |

**Cars:** Drift Ronin (starter), Clubsport GT4, Carbon Stingray, Silhouette R.
The display names are original nicknames, so no car brand appears in the UI.

## Project layout

```
index.html, css/, fonts/        UI shell and styling
src/main.js                     game controller (screens, race lifecycle, ads)
src/data/                       courses, worlds, cars: tweak the game here
src/world/                      course path (legs + warp portals), road meshes, sky, sky set pieces, scenery
src/game/                       car physics, AI, obstacles, race rules, camera, effects
src/ui/                         menus, HUD, garage showroom
src/platform/                   portal adapters (CrazyGames, local)
lib/three/                      vendored three.js r170 + Draco decoder
Assets/                         your car models and sounds
tools/trackviz.html             dev view of all track layouts
```

## Credits / licences

- three.js (MIT), Russo One and Rajdhani fonts (SIL OFL): licences are included.
- Car models: check the licence of each GLB you uploaded (Sketchfab models
  often require attribution) before publishing.
