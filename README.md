# Oneshot Royale

A browser battle-royale game, now built with **Godot 4** and exported to WebAssembly.

**Play the Godot build:** [https://ericspencer00.github.io/fortnite-oneshot/docs/play/](https://ericspencer00.github.io/fortnite-oneshot/docs/play/)

**Legacy Rust/macroquad build:** [https://ericspencer00.github.io/fortnite-oneshot/](https://ericspencer00.github.io/fortnite-oneshot/) (kept at the repo root)

## Features (Godot build — core loop)
- Skydive + glide drop onto a procedurally generated island
- Third-person camera (spring-arm collision) with crosshair-true shooting
- Hitscan weapons with rarity tiers, ADS zoom, spread, reloads, headshots
- Floor loot + chests, 5-slot inventory
- Shrinking storm with 6 phased circles, 20 AI opponents, Victory Royale

Building (walls/ramps), the battle bus, and material harvesting are still exclusive to the legacy Rust build — Godot port pass 2.

## Develop (Godot build)
```bash
# unit tests (headless, no window)
godot --headless --path godot -s tests/run_tests.gd

# visual verification: writes /tmp/shot_menu.png + /tmp/shot_play.png
godot --path godot -- --screenshot

# web export (non-threaded, GitHub Pages compatible)
godot --headless --path godot --export-release Web ../docs/play/index.html
```

## Develop (legacy Rust build)
```bash
cd rust
cargo test                                            # logic tests (native)
cargo build --release --target wasm32-unknown-unknown # build the game
cp target/wasm32-unknown-unknown/release/oneshot-royale.wasm ../game.wasm
```
Serve the repo root with any static server (`python3 -m http.server`) and open it.

Built by Claude (Fable 5 / Opus 4.8).
