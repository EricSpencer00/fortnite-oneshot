# Oneshot Royale

A free battle royale that runs in your browser: you and 29 bots drop onto an island, loot, build and fight until one is left.

**Play:** [https://ericspencer.us/fortnite-oneshot/](https://ericspencer.us/fortnite-oneshot/)

It's a static site. There's no install, no build step and no server. The first load is about 1.5 MB, compared with about 40 MB for the old Godot export.

## Features
- **Battle bus → skydive → glider:** jump whenever you like, and look down to dive faster. The glider opens on its own close to the ground.
- **Island:** procedural terrain with seven named towns. Houses can be entered, have doors and windows, and some have two floors with stairs. There are also forests, rocks and cars.
- **Weapons:** AR, pump shotgun, SMG, bolt sniper (with a scope) and pistol, each in five rarities. Shots are hitscan and land on the crosshair. There are headshots, damage falloff, bloom, recoil, ADS and reloads.
- **Building:** walls, floors and ramps on a 4 m grid, in wood, stone or metal. Pieces gain HP while they build up, and you can ramp-rush.
- **Harvesting:** hit trees, rocks and cars with the pickaxe to collect materials.
- **Loot:** floor loot, chests, ammo types, and heals (bandages, med kits, shield potions). Eliminated players drop everything they had.
- **Storm:** six phases that shrink, with damage that ramps up.
- **Bots:** they drop, loot, open chests, rotate away from the storm, strafe, jump and build walls when they're shot. There are three difficulty levels.
- **HUD:** minimap, full map (M), kill feed, damage numbers, hit markers, damage-direction arcs, a storm timer, and a hotbar using generated icons.

## Controls
| Key | Action |
| --- | --- |
| WASD / Mouse | Move / aim |
| Left / right click | Fire or use / aim down sights |
| Space / Shift | Jump or deploy / sprint |
| E / R | Pick up or open chest / reload |
| 1 / 2–6 / wheel | Pickaxe / inventory slots / cycle |
| Q / X / C | Build wall / floor / ramp (click to place) |
| G / M / Esc | Change material / map / pause |

## Tech
- [three.js](https://threejs.org) r170, loaded from a CDN through an import map. Everything else is plain ES modules in `js/`.
- Rendering is kept cheap so it stays fast:
  - Trees, rocks and bushes are drawn with instancing.
  - Each town's houses are merged into one draw per material.
  - Tracers and particles each use a single pooled draw call.
  - Pixel ratio is capped, and in "Auto" graphics mode resolution and shadows scale down if FPS drops.
- There's no physics engine. Collision uses a spatial hash of AABBs and ramps, raycasts step through the grid with DDA, and the terrain is an analytic height function. Simulating 30 actors costs about 1 ms per tick.
- The audio is all synthesized with WebAudio, so there are no sound files.
- The textures, sky, title art and item icons were made with ChatGPT image generation. They were then made seamless and compressed to 512 px JPEGs or 160 px PNGs (`assets/`).

| File | Purpose |
| --- | --- |
| `js/main.js` | renderer, input, player controller, camera, match flow |
| `js/bot.js` | bot AI |
| `js/combat.js` | hitscan shooting and harvesting |
| `js/build.js` | building |
| `js/world.js` / `js/terrain.js` | island generation |
| `js/physics.js` | collision and raycasts |
| `js/loot.js`, `js/storm.js`, `js/hud.js`, `js/fx.js`, `js/audio.js`, `js/character.js` | loot, storm, HUD, effects, sound and character models |

## Run locally
```bash
python3 -m http.server 8000
```
Then open http://localhost:8000. ES modules need a server, so opening the file directly won't work.

To test from the dev console: `__osr.startMatch()` starts a match, and `__osr.sim(60)` fast-forwards the simulation by 60 s.

QA suite (37 checks covering the drop, looting, chests, shooting, reloads, heals, building, harvesting, storm, scope, death, restart and full matches): open the game, then run `await import('./tests/qa.js')` in the console and read `window.__qa`.

The earlier Rust/macroquad and Godot builds are still in git history.
