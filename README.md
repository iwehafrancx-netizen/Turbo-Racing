# Turbo Racing

An arcade sky racer for web game portals (CrazyGames first, Playgama next).
Ten point-to-point races from a START gate to a FINISH gate, each across a
different dream-like sky world. Drift to charge turbos, fire nitro, jump the
gaps and dodge the moving obstacles.

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
sliding blocks, spinning bars, swinging hammers and slamming pistons. A top-3
finish unlocks the next track; a win earns ★★★. Coins buy cars and upgrades.

| # | Track | World | Highlights |
|---|-------|-------|-----------|
| 1 | Candy Cloud Run | cotton-candy sky | rainbow sugar road, lollipops, giant donuts, rainbow arches |
| 2 | Neon Grid Rush | synthwave night | glowing grid road, giant striped sun, neon shapes, sliding blocks |
| 3 | Prism Peaks | crystal sky | iridescent road, a spiral climb under itself, spinning bars |
| 4 | Golden Temple | golden sunrise | marble and gold road, temple islands, swinging hammers |
| 5 | Lantern Festival | moonlit night | red lacquer road, torii gates, a thousand rising lanterns |
| 6 | Lava Forge | burning sky | obsidian road with lava cracks, meteors, slamming pistons |
| 7 | Sky Reef | ocean-blue sky | bubble road, flying sky-whales, jellyfish, coral islands |
| 8 | Aurora Ribbon | polar night | slippery ice ribbon, aurora curtains, shooting stars |
| 9 | Thunder Citadel | thunderstorm | chrome road with lightning, sky fortress, real lightning bolts |
| 10 | Cosmic Rainbow Road | galaxy | rainbow road, black hole, ringed planet, every obstacle type |

**Cars:** Drift Ronin (starter), Clubsport GT4, Carbon Stingray, Silhouette R.
The display names are original nicknames, so no car brand appears in the UI.

## Project layout

```
index.html, css/, fonts/        UI shell and styling
src/main.js                     game controller (screens, race lifecycle, ads)
src/data/                       courses, worlds, cars: tweak the game here
src/world/                      course path, road meshes, sky, sky set pieces, scenery
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
