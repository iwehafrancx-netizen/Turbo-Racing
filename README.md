# Turbo Racing

An arcade sky racer for web game portals (CrazyGames first, Playgama next).
Ten tracks float high above the clouds. Drift to charge turbos, fire nitro,
jump the gaps, and don't fall off the edge.

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

**Core loop:** drift through corners to charge a 3-tier mini-turbo
(blue → orange → purple). Drifting, airtime, coins and slipstreaming fill the
nitro bar. A top-3 finish unlocks the next track; a win earns ★★★. Coins buy
cars and upgrades (engine, turbo, tyres).

| # | Track | World | Gimmick |
|---|-------|-------|---------|
| 1 | Sunrise Skyway | golden sunrise, palm islands | first gap jump, roller hills |
| 2 | Neon Sky City | midnight neon towers, rain | neon arches, gap on the main straight |
| 3 | Mirage Mesas | floating desert rocks | gorge jump, first rail-less section |
| 4 | Spiral Summit | snowy peaks | climbing ice helix, then a plunge |
| 5 | Jungle Sky Isles | waterfall islands, temple | vine hills, gap, rail-less start |
| 6 | Volcano Inferno | ash skies, lava falls | figure-8 with a bridge jump over the crossing |
| 7 | Airship Harbor | floating docks, airships | 90° drift corners, open-edge straight |
| 8 | Aurora Glacier | northern lights, ice | slippery ice, jumps, open edges |
| 9 | Storm Runner | thunderstorm, lightning | mostly rail-less, two big gaps |
| 10 | Galaxy Grand Prix | space, nebula, planets | bowtie with jumps over the crossover |

**Cars:** Drift Ronin (starter), Clubsport GT4, Carbon Stingray, Silhouette R.
The display names are original nicknames, so no car brand appears in the UI.

## Project layout

```
index.html, css/, fonts/        UI shell and styling
src/main.js                     game controller (screens, race lifecycle, ads)
src/data/                       tracks, themes, cars: tweak the game here
src/world/                      track path math, track meshes, sky, scenery
src/game/                       car physics, AI, race rules, camera, effects
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
