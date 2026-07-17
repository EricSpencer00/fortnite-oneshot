# Oneshot Royale — Godot 4 Port (Core Loop)

**Date:** 2026-07-16
**Status:** Approved by Eric

## Why

The macroquad version's controls/visuals are janky for structural reasons:
cube-people (macroquad cannot load rigged/animated models), a hand-rolled
third-person camera, and shooting that fires from camera geometry so the
bullet disagrees with the crosshair. Goal is the **best playable browser
game**, so we port to a real engine. Godot 4 chosen (full editor, animation
tools, asset pipeline, text-based project files so Claude can build it
headless).

## Constraints

- Deploys to GitHub Pages: **non-threaded web export** (no COOP/COEP headers).
- The installed Godot 4.5.1 is the .NET edition, which **cannot export to
  web**. Use **GDScript** and the standard Godot cask (`brew install --cask
  godot`) for editing/export. Pin all work to that one version.
- The existing `rust/` macroquad game, `index.html`, and `game.wasm` remain
  untouched until the Godot build is playable; then the README/Pages link
  swaps over.

## Project shape

```
godot/                  # full Godot project, all text files
  project.godot
  export_presets.cfg    # Web preset, non-threaded
  scenes/*.tscn
  scripts/*.gd          # game logic kept engine-thin for testability
  tests/*.gd            # GUT unit tests, run headless
  assets/               # CC0 GLTF characters + weapons (Quaternius/Kenney)
docs/play/              # web export output (index.html, .wasm, .pck)
```

Export: `godot --headless --export-release Web docs/play/index.html`.

## Pass 1 scope — core loop

Drop-in → loot → shoot bots → storm → win/lose.

- **Terrain**: port `terrain_height` island function from `rust/src/main.rs`
  to generate a heightmap mesh + collision; simple placed trees/houses.
- **Characters**: CC0 rigged GLTF models with idle/run/jump/aim animations
  driven by `AnimationTree`. Applies to player and bots.
- **Player**: `CharacterBody3D` movement (walk/sprint/jump),
  `SpringArm3D` third-person camera (native camera collision — replaces the
  hand-rolled lerp camera).
- **Shooting (crosshair-true)**: raycast from camera center through the
  crosshair to find the aim point; fire from the muzzle toward that point.
  Hitscan weapons: AR, SMG, shotgun, sniper (port damage/cadence numbers
  from the Rust `wcfg` table). Headshot multiplier via separate head hitbox.
- **Bots**: ~20, simple state machine (roam → engage → flee storm), ported
  accuracy/reaction parameters.
- **Loot**: ground weapon spawns + chests, 5-slot inventory, number-key
  switching, R reload.
- **Storm**: shrinking circle, phase table ported from `STORM_PHASES`,
  damage per second outside.
- **Flow**: menu → skydive drop → play → victory/defeat screen.

**Explicitly deferred to pass 2**: building system, battle bus, glider,
material harvesting, ammo scarcity tuning.

## Testing / feedback loop

This is the fix for "you cannot see how bad it is":

1. **Unit tests**: game logic (storm phases, damage math, bot state, loot,
   inventory) lives in plain GDScript classes free of node dependencies,
   tested with a small custom SceneTree test runner (no addon dependency):
   `godot --headless -s tests/run_tests.gd`.
2. **Visual verification**: headless Godot can run a scripted scene and
   capture viewport screenshots to PNG — rendered frames are inspectable
   without a browser or desktop control.
3. **Manual**: Eric plays the web export; symptoms become failing tests.

## Non-goals

- Multiplayer.
- Feature parity with the macroquad version in pass 1.
- Deleting the Rust version (separate decision later).
