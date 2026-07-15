# Oneshot Royale

A battle-royale game compiled to **WebAssembly** — Rust + [macroquad](https://macroquad.rs), running entirely in the browser. No server, no bundler: one 512 KB `game.wasm`, a JS loader, and an `index.html`.

Play it: [https://ericspencer00.github.io/fortnite-oneshot/](https://ericspencer00.github.io/fortnite-oneshot/)

## Features
- Battle bus, skydive + glider drop
- Hitscan weapons with rarity tiers, ADS zoom (sniper scope), recoil, spread, reloads, headshots
- Building: wall / floor / ramp / roof in wood / stone / metal, destructible
- Harvesting trees, rocks and cars with the pickaxe
- Chests, floor loot, shield potions, medkits, ammo
- Shrinking storm with phased circles, 23 AI opponents, kill feed, minimap, Victory Royale

## Develop
```bash
cd rust
cargo test                                            # logic tests (native)
cargo build --release --target wasm32-unknown-unknown # build the game
cp target/wasm32-unknown-unknown/release/oneshot-royale.wasm ../game.wasm
```
Serve the repo root with any static server (`python3 -m http.server`) and open it.

Rewritten in Rust/WASM by Claude Fable 5.
