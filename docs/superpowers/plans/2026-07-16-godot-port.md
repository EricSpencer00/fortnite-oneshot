# Godot 4 Port (Core Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Oneshot Royale's core loop (drop-in → loot → shoot bots → storm → win) to Godot 4 with real animated characters, a correct spring-arm camera, and crosshair-true shooting, exported to web for GitHub Pages.

**Architecture:** Pure-logic GDScript classes (`RefCounted`, no node deps) for storm/weapons/inventory/bot-brain, tested headless via a custom SceneTree test runner. Node-layer scripts wire logic to `CharacterBody3D`, `SpringArm3D`, and GLTF animated models. Terrain is generated at load from the same analytic height function as the Rust version.

**Tech Stack:** Godot 4.x standard (GDScript — NOT the installed .NET edition, which can't export to web), non-threaded Web export, CC0 GLTF character assets.

## Global Constraints

- Web export must be **non-threaded** (GitHub Pages has no COOP/COEP headers).
- Editor/export binary: standard Godot cask (`brew install --cask godot`); pin all work to the installed version.
- Existing `rust/`, `index.html`, `game.wasm` stay untouched; web export goes to `docs/play/`.
- Gameplay numbers are ported verbatim from `rust/src/main.rs` (values reproduced in tasks below).
- All logic classes are node-free so they run under `godot --headless`.

---

### Task 1: Project skeleton + headless test harness

**Files:**
- Create: `godot/project.godot`
- Create: `godot/tests/run_tests.gd` (test runner)
- Create: `godot/tests/test_smoke.gd`
- Create: `godot/scenes/main.tscn` (empty Node3D root, placeholder)
- Create: `godot/.gitignore` (`.godot/`)

**Interfaces:**
- Produces: test contract — every `godot/tests/test_*.gd` defines `static func run(t)` receiving a `T` helper with `t.ok(cond, msg)` and `t.eq(a, b, msg)`. Runner exits 0/1.

- [ ] **Step 1: Install standard Godot** (ask Eric before installing if brew prompts)

```bash
brew install --cask godot
GODOT="/Applications/Godot.app/Contents/MacOS/Godot"
"$GODOT" --version   # expect 4.x
```

- [ ] **Step 2: Write project.godot and .gitignore**

```ini
; godot/project.godot
config_version=5

[application]
config/name="Oneshot Royale"
run/main_scene="res://scenes/main.tscn"

[display]
window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"

[input]
; actions defined in Task 4

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
```

`godot/.gitignore`: `.godot/`

- [ ] **Step 3: Write the test runner and a failing smoke test**

```gdscript
# godot/tests/run_tests.gd — run: godot --headless -s tests/run_tests.gd
extends SceneTree

class T:
    var failures: Array[String] = []
    var count := 0
    func ok(cond: bool, msg: String) -> void:
        count += 1
        if not cond: failures.append(msg)
    func eq(a, b, msg: String) -> void:
        ok(a == b or (a is float and b is float and absf(a - b) < 1e-4),
           "%s (got %s, want %s)" % [msg, a, b])

func _init() -> void:
    var t := T.new()
    var dir := DirAccess.open("res://tests")
    dir.list_dir_begin()
    var f := dir.get_next()
    while f != "":
        if f.begins_with("test_") and f.ends_with(".gd"):
            print("== ", f)
            load("res://tests/" + f).run(t)
        f = dir.get_next()
    if t.failures.is_empty():
        print("OK: %d assertions" % t.count)
        quit(0)
    else:
        for m in t.failures: printerr("FAIL: " + m)
        quit(1)
```

```gdscript
# godot/tests/test_smoke.gd
static func run(t) -> void:
    t.ok(true, "harness runs")
```

- [ ] **Step 4: Create empty main scene**

```ini
; godot/scenes/main.tscn
[gd_scene format=3]
[node name="Main" type="Node3D"]
```

- [ ] **Step 5: Verify harness passes headless**

Run: `cd godot && "$GODOT" --headless -s tests/run_tests.gd; echo exit=$?`
Expected: `OK: 1 assertions`, `exit=0`. Then flip the smoke assert to `false`, verify `exit=1`, flip back.

- [ ] **Step 6: Commit**

```bash
git add godot && git commit -m "godot: project skeleton + headless test harness"
```

---

### Task 2: Pure game logic — storm, weapons, rarity

**Files:**
- Create: `godot/scripts/logic/storm_logic.gd`
- Create: `godot/scripts/logic/weapons.gd`
- Test: `godot/tests/test_storm.gd`, `godot/tests/test_weapons.gd`

**Interfaces:**
- Produces:
  - `StormLogic` (class_name, RefCounted): props `center: Vector2`, `radius: float`, `dps: float`, `phase: int`, `finished: bool`; methods `update(dt: float)`, `outside(pos: Vector3) -> bool`.
  - `Weapons` (class_name): `static func cfg(type: int) -> Dictionary` with keys `name,damage,fire_rate,mag,reload,spread,ads_spread,range,auto,pellets,ads_zoom,scope,melee,headshot`; enum `Type {PICKAXE, AR, SHOTGUN, SMG, SNIPER, PISTOL}`; `static func rarity_mult(r: int) -> float`; `static func damage(type: int, r: int) -> float`; `static func roll_rarity(luck: float, rand01: float) -> int`.

- [ ] **Step 1: Write failing tests** (ported from the Rust suite so behavior matches)

```gdscript
# godot/tests/test_storm.gd
static func run(t) -> void:
    var s := StormLogic.new()
    var r0 := s.radius
    for i in 60 * 60 * 10:
        s.update(1.0 / 60.0)
    t.ok(s.finished, "storm finishes all phases")
    t.ok(s.radius < 3.0, "final radius small: %f" % s.radius)
    t.ok(s.radius < r0, "storm shrank")
    t.ok(s.outside(Vector3(1000, 0, 1000)), "far point is outside")
```

```gdscript
# godot/tests/test_weapons.gd
static func run(t) -> void:
    var ar := Weapons.cfg(Weapons.Type.AR)
    t.eq(ar.damage, 30.0, "AR damage ported")
    t.eq(ar.mag, 30, "AR mag ported")
    t.ok(Weapons.damage(Weapons.Type.AR, 4) > Weapons.damage(Weapons.Type.AR, 0),
        "rarity scales damage")
    t.eq(Weapons.roll_rarity(0.0, 0.99), 4, "top roll = legendary")
    t.eq(Weapons.roll_rarity(0.0, 0.0), 0, "bottom roll = common")
    t.eq(Weapons.cfg(Weapons.Type.SHOTGUN).pellets, 9, "shotgun pellets")
```

- [ ] **Step 2: Run to verify failure**

Run: `"$GODOT" --headless -s tests/run_tests.gd` — Expected: parse error / FAIL (StormLogic missing).

- [ ] **Step 3: Implement** (numbers verbatim from `rust/src/main.rs:570` and `wcfg`)

```gdscript
# godot/scripts/logic/storm_logic.gd
class_name StormLogic extends RefCounted
# {wait, shrink, radius, dps} — verbatim from rust STORM_PHASES
const PHASES := [
    {"wait": 35.0, "shrink": 30.0, "radius": 190.0, "dps": 1.0},
    {"wait": 30.0, "shrink": 28.0, "radius": 130.0, "dps": 2.0},
    {"wait": 25.0, "shrink": 25.0, "radius": 80.0, "dps": 4.0},
    {"wait": 20.0, "shrink": 22.0, "radius": 42.0, "dps": 6.0},
    {"wait": 18.0, "shrink": 20.0, "radius": 14.0, "dps": 8.0},
    {"wait": 15.0, "shrink": 30.0, "radius": 2.0, "dps": 10.0},
]
var center := Vector2.ZERO
var radius := 240.0
var phase := 0
var timer: float = PHASES[0].wait
var shrinking := false
var dps: float = PHASES[0].dps
var target_center := Vector2.ZERO
var target_radius: float = PHASES[0].radius
var finished := false

func _init(rand := RandomNumberGenerator.new()) -> void:
    _pick_target(rand)

func _pick_target(rand: RandomNumberGenerator) -> void:
    var p: Dictionary = PHASES[phase]
    var max_off: float = maxf(radius - p.radius, 0.0) * 0.6
    var a := rand.randf() * TAU
    target_center = center + Vector2(cos(a), sin(a)) * rand.randf() * max_off
    target_radius = p.radius

func update(dt: float) -> void:
    if finished: return
    timer -= dt
    var p: Dictionary = PHASES[phase]
    if not shrinking:
        if timer <= 0.0:
            shrinking = true
            timer = p.shrink
    else:
        var k := clampf(1.0 - timer / p.shrink, 0.0, 1.0)
        radius = lerpf(radius, target_radius, k)
        center = center.lerp(target_center, k)
        if timer <= 0.0:
            radius = target_radius
            center = target_center
            phase += 1
            if phase >= PHASES.size():
                finished = true
                return
            dps = PHASES[phase].dps
            shrinking = false
            timer = PHASES[phase].wait
            _pick_target(RandomNumberGenerator.new())

func outside(pos: Vector3) -> bool:
    return Vector2(pos.x, pos.z).distance_to(center) > radius
```

```gdscript
# godot/scripts/logic/weapons.gd
class_name Weapons extends RefCounted
enum Type {PICKAXE, AR, SHOTGUN, SMG, SNIPER, PISTOL}
const RARITY_MULT := [1.0, 1.1, 1.2, 1.32, 1.45]
const RARITY_NAMES := ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
const RARITY_COLORS := [Color8(157,165,173), Color8(76,175,80), Color8(47,159,224), Color8(164,77,224), Color8(232,145,47)]
# verbatim from rust wcfg()
const CFG := {
    Type.PICKAXE: {"name":"Pickaxe","damage":20.0,"fire_rate":0.45,"mag":0,"reload":0.0,"spread":0.0,"ads_spread":0.0,"range":3.5,"auto":true,"pellets":1,"ads_zoom":1.0,"scope":false,"melee":true,"headshot":1.0},
    Type.AR: {"name":"Assault Rifle","damage":30.0,"fire_rate":0.135,"mag":30,"reload":2.2,"spread":0.025,"ads_spread":0.007,"range":250.0,"auto":true,"pellets":1,"ads_zoom":0.72,"scope":false,"melee":false,"headshot":1.5},
    Type.SHOTGUN: {"name":"Pump Shotgun","damage":90.0,"fire_rate":0.95,"mag":5,"reload":3.2,"spread":0.09,"ads_spread":0.06,"range":32.0,"auto":false,"pellets":9,"ads_zoom":0.85,"scope":false,"melee":false,"headshot":1.5},
    Type.SMG: {"name":"SMG","damage":17.0,"fire_rate":0.065,"mag":35,"reload":1.9,"spread":0.045,"ads_spread":0.02,"range":90.0,"auto":true,"pellets":1,"ads_zoom":0.8,"scope":false,"melee":false,"headshot":1.5},
    Type.SNIPER: {"name":"Bolt Sniper","damage":105.0,"fire_rate":1.7,"mag":1,"reload":2.8,"spread":0.04,"ads_spread":0.0,"range":500.0,"auto":false,"pellets":1,"ads_zoom":0.28,"scope":true,"melee":false,"headshot":2.0},
    Type.PISTOL: {"name":"Pistol","damage":26.0,"fire_rate":0.28,"mag":12,"reload":1.6,"spread":0.02,"ads_spread":0.008,"range":120.0,"auto":false,"pellets":1,"ads_zoom":0.8,"scope":false,"melee":false,"headshot":1.5},
}
static func cfg(type: int) -> Dictionary: return CFG[type]
static func rarity_mult(r: int) -> float: return RARITY_MULT[r]
static func damage(type: int, r: int) -> float: return CFG[type].damage * RARITY_MULT[r]
static func roll_rarity(luck: float, rand01: float) -> int:
    var v := rand01 + luck
    if v > 0.97: return 4
    if v > 0.88: return 3
    if v > 0.70: return 2
    if v > 0.45: return 1
    return 0
```

- [ ] **Step 4: Run tests — expect PASS.** `"$GODOT" --headless -s tests/run_tests.gd`

- [ ] **Step 5: Commit** — `git add godot && git commit -m "godot: storm + weapon logic (ported values) with tests"`

---

### Task 3: Terrain — analytic height + generated mesh/collision

**Files:**
- Create: `godot/scripts/logic/terrain.gd`
- Create: `godot/scripts/world.gd` (Node3D script; builds mesh, collision, water, trees)
- Modify: `godot/scenes/main.tscn` (add World node)
- Test: `godot/tests/test_terrain.gd`

**Interfaces:**
- Produces: `Terrain.height(x: float, z: float) -> float` (static, class_name Terrain), constants `Terrain.WORLD_SIZE = 480.0`, `Terrain.HALF = 240.0`. `world.gd` exposes group `"world"`; ground collision on physics layer 1.

- [ ] **Step 1: Failing test — port of `terrain_is_finite_and_island_shaped`**

```gdscript
# godot/tests/test_terrain.gd
static func run(t) -> void:
    var land := 0
    for iz in range(-24, 24):
        for ix in range(-24, 24):
            var h := Terrain.height(ix * 10.0, iz * 10.0)
            t.ok(is_finite(h), "finite height")
            if h > 1.0: land += 1
    t.ok(land > 200, "island big enough: %d" % land)
    t.ok(Terrain.height(Terrain.HALF, Terrain.HALF) < 0.5, "edges underwater")
    t.ok(Terrain.height(0.0, 0.0) > 0.5, "center above water")
```

- [ ] **Step 2: Run, verify FAIL (Terrain missing).**

- [ ] **Step 3: Implement Terrain (deterministic hash identical to Rust `hash2`)**

```gdscript
# godot/scripts/logic/terrain.gd
class_name Terrain extends RefCounted
const WORLD_SIZE := 480.0
const HALF := WORLD_SIZE / 2.0

static func _hash2(ix: int, iz: int) -> float:
    # 32-bit wrapping arithmetic to match rust hash2 exactly
    var h := (ix * 374761393 + iz * 668265263 + 1442695040) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h ^= h >> 16
    return float(h) / 4294967295.0

static func _smoothstep(x: float) -> float: return x * x * (3.0 - 2.0 * x)

static func _vnoise(x: float, z: float) -> float:
    var ix := int(floor(x)); var iz := int(floor(z))
    var fx := _smoothstep(x - floor(x)); var fz := _smoothstep(z - floor(z))
    var a := _hash2(ix, iz); var b := _hash2(ix + 1, iz)
    var c := _hash2(ix, iz + 1); var d := _hash2(ix + 1, iz + 1)
    return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fz)

static func _fbm(x: float, z: float) -> float:
    var amp := 1.0; var freq := 1.0; var sum := 0.0; var norm := 0.0
    for i in 4:
        sum += amp * _vnoise(x * freq, z * freq)
        norm += amp; amp *= 0.5; freq *= 2.0
    return sum / norm

static func height(x: float, z: float) -> float:
    var d := sqrt(x * x + z * z) / HALF
    var falloff := clampf(1.0 - pow(d, 3.2), 0.0, 1.0)
    var n := _fbm(x * 0.008 + 50.0, z * 0.008 + 50.0)
    return (2.5 + pow(n, 1.4) * 26.0) * falloff - 1.5
```

Note: GDScript ints are 64-bit; the `& 0xFFFFFFFF` masks emulate the Rust
i32 wrapping. If the land-count assert fails, debug the hash first
(compare `Terrain._hash2(3, 7)` against a value printed from a one-off
Rust test).

- [ ] **Step 4: Run tests — PASS.**

- [ ] **Step 5: World node builds visual mesh + collision from Terrain.height**

```gdscript
# godot/scripts/world.gd
extends Node3D
const STEP := 4.0  # grid resolution

func _ready() -> void:
    add_to_group("world")
    _build_terrain()
    _add_water()
    _add_sun_and_sky()

func _build_terrain() -> void:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)
    var n := int(Terrain.WORLD_SIZE / STEP)
    for iz in n:
        for ix in n:
            var x0 := -Terrain.HALF + ix * STEP; var z0 := -Terrain.HALF + iz * STEP
            var p00 := Vector3(x0, Terrain.height(x0, z0), z0)
            var p10 := Vector3(x0 + STEP, Terrain.height(x0 + STEP, z0), z0)
            var p01 := Vector3(x0, Terrain.height(x0, z0 + STEP), z0 + STEP)
            var p11 := Vector3(x0 + STEP, Terrain.height(x0 + STEP, z0 + STEP), z0 + STEP)
            for tri in [[p00, p01, p10], [p10, p01, p11]]:
                var normal := (tri[1] - tri[0]).cross(tri[2] - tri[0]).normalized()
                for v in tri:
                    st.set_color(_ground_color(v.y))
                    st.set_normal(normal)
                    st.add_vertex(v)
    var mesh := st.commit()
    var mi := MeshInstance3D.new()
    mi.mesh = mesh
    var mat := StandardMaterial3D.new()
    mat.vertex_color_use_as_albedo = true
    mi.material_override = mat
    add_child(mi)
    var body := StaticBody3D.new()
    var shape := CollisionShape3D.new()
    var cs := ConcavePolygonShape3D.new()
    cs.set_faces(mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX])
    shape.shape = cs
    body.add_child(shape)
    add_child(body)

func _ground_color(y: float) -> Color:
    if y < 0.6: return Color8(214, 196, 142)   # sand
    if y < 12.0: return Color8(88, 148, 74)    # grass
    return Color8(126, 130, 138)               # rock

func _add_water() -> void:
    var w := MeshInstance3D.new()
    var pm := PlaneMesh.new(); pm.size = Vector2(2000, 2000)
    w.mesh = pm; w.position.y = 0.0
    var m := StandardMaterial3D.new()
    m.albedo_color = Color(0.18, 0.42, 0.66, 0.85)
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    w.material_override = m
    add_child(w)

func _add_sun_and_sky() -> void:
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-48, 32, 0)
    sun.shadow_enabled = true
    add_child(sun)
    var env := WorldEnvironment.new()
    var e := Environment.new()
    e.background_mode = Environment.BG_SKY
    e.sky = Sky.new(); e.sky.sky_material = ProceduralSkyMaterial.new()
    env.environment = e
    add_child(env)
```

Add to `main.tscn`:

```ini
[gd_scene load_steps=2 format=3]
[ext_resource type="Script" path="res://scripts/world.gd" id="1"]
[node name="Main" type="Node3D"]
[node name="World" type="Node3D" parent="." ]
script = ExtResource("1")
```

- [ ] **Step 6: Visual verification via headless screenshot**

Create `godot/tests/screenshot.gd`:

```gdscript
# usage: godot --headless -s tests/screenshot.gd  (writes /tmp shot)
extends SceneTree
func _init() -> void:
    var scene: Node = load("res://scenes/main.tscn").instantiate()
    root.add_child(scene)
    var cam := Camera3D.new()
    cam.position = Vector3(0, 120, 260)
    cam.look_at_from_position(cam.position, Vector3.ZERO)
    root.add_child(cam); cam.make_current()
    await process_frame; await process_frame
    var img := root.get_viewport().get_texture().get_image()
    img.save_png("/tmp/godot_shot.png")
    quit(0)
```

Run and Read the PNG: island visible, water around it, sky above.

- [ ] **Step 7: Commit** — `git commit -am "godot: analytic terrain + generated world"` (add new files first)

---

### Task 4: Player controller + spring-arm camera

**Files:**
- Create: `godot/scenes/player.tscn`, `godot/scripts/player.gd`
- Modify: `godot/project.godot` (input map), `godot/scenes/main.tscn` (spawn player)
- Test: `godot/tests/test_player_move.gd`

**Interfaces:**
- Consumes: `Terrain.height`.
- Produces: `player.gd` (class_name PlayerController extends CharacterBody3D) with `func simulate_move(input_dir: Vector2, sprint: bool, jump: bool, dt: float) -> void` — pure velocity computation separated from `_physics_process` so it's testable; signals `damaged(amount)`, `died`. Camera rig: `SpringArm3D` (length 3.8, margin 0.3) → `Camera3D`. Group `"player"`.

- [ ] **Step 1: Input map in project.godot**

```ini
[input]
move_forward={"deadzone":0.5,"events":[{"type":"key","keycode":87}]}   ; W
move_back={"deadzone":0.5,"events":[{"type":"key","keycode":83}]}      ; S
move_left={"deadzone":0.5,"events":[{"type":"key","keycode":65}]}      ; A
move_right={"deadzone":0.5,"events":[{"type":"key","keycode":68}]}     ; D
jump={"deadzone":0.5,"events":[{"type":"key","keycode":32}]}
sprint={"deadzone":0.5,"events":[{"type":"key","keycode":4194325}]}    ; Shift
fire={"deadzone":0.5,"events":[{"type":"mouse_button","button_index":1}]}
aim={"deadzone":0.5,"events":[{"type":"mouse_button","button_index":2}]}
reload={"deadzone":0.5,"events":[{"type":"key","keycode":82}]}
```

(Write these via the Godot editor-format; if hand-writing is finicky, set
them in `_ready` with `InputMap.add_action`/`action_add_event` in an
autoload instead — equivalent and easier to diff.)

- [ ] **Step 2: Failing test for movement math**

```gdscript
# godot/tests/test_player_move.gd
static func run(t) -> void:
    var p := PlayerController.new()
    p.cam_yaw = 0.0   # forward = -Z in Godot
    p.simulate_move(Vector2(0, 1), false, false, 0.016)   # W
    t.ok(p.velocity.z < -1.0, "W moves toward -Z: %s" % p.velocity)
    t.ok(absf(p.velocity.x) < 0.5, "no drift")
    p.simulate_move(Vector2(1, 0), false, false, 0.016)   # D
    t.ok(p.velocity.x > 1.0, "D strafes +X")
    var walk := Vector2(p.velocity.x, p.velocity.z).length()
    p.simulate_move(Vector2(0, 1), true, false, 0.016)
    t.ok(Vector2(p.velocity.x, p.velocity.z).length() > walk * 1.3, "sprint faster")
    p.free()
```

- [ ] **Step 3: Verify FAIL, then implement**

```gdscript
# godot/scripts/player.gd
class_name PlayerController extends CharacterBody3D
signal damaged(amount: float)
signal died

const SPEED := 6.5
const SPRINT_MULT := 1.55
const ADS_MULT := 0.55
const JUMP_VEL := 8.5
const GRAVITY := 24.0
const MOUSE_SENS := 0.0023

var cam_yaw := 0.0
var cam_pitch := -0.15
var aiming := false
var health := 100.0
var shield := 0.0

@onready var spring: SpringArm3D = $SpringArm
@onready var cam: Camera3D = $SpringArm/Camera3D

func _ready() -> void:
    add_to_group("player")
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion:
        var s := MOUSE_SENS * (0.55 if aiming else 1.0)
        cam_yaw -= event.relative.x * s
        cam_pitch = clampf(cam_pitch - event.relative.y * s, -1.35, 1.35)

# Pure movement math — testable headless (no input polling, no physics query)
func simulate_move(input_dir: Vector2, sprint: bool, jump: bool, dt: float) -> void:
    var fwd := Vector3(-sin(cam_yaw), 0, -cos(cam_yaw))
    var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw))
    var wish := fwd * input_dir.y + right * input_dir.x
    if wish.length_squared() > 0.0:
        var spd := SPEED * (SPRINT_MULT if sprint and input_dir.y > 0.0 and not aiming else 1.0) \
            * (ADS_MULT if aiming else 1.0)
        var dir := wish.normalized()
        velocity.x = dir.x * spd
        velocity.z = dir.z * spd
    else:
        var k := exp(-14.0 * dt)
        velocity.x *= k
        velocity.z *= k
    if jump and is_on_floor():
        velocity.y = JUMP_VEL
    velocity.y = maxf(velocity.y - GRAVITY * dt, -55.0)

func _physics_process(dt: float) -> void:
    var input_dir := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
    aiming = Input.is_action_pressed("aim")
    simulate_move(input_dir, Input.is_action_pressed("sprint"),
        Input.is_action_just_pressed("jump"), dt)
    move_and_slide()
    # camera rig follows yaw/pitch; SpringArm handles collision natively
    spring.rotation = Vector3(cam_pitch, cam_yaw, 0)

func take_damage(amount: float) -> void:
    var absorbed := minf(shield, amount)
    shield -= absorbed
    health -= amount - absorbed
    damaged.emit(amount)
    if health <= 0.0:
        health = 0.0
        died.emit()
```

`player.tscn`: `CharacterBody3D` (script above) → `CollisionShape3D`
(CapsuleShape3D, radius 0.45, height 1.8) → `SpringArm` (SpringArm3D,
spring_length 3.8, margin 0.3, position (0, 1.6, 0)) → `Camera3D`.
Placeholder visual: `MeshInstance3D` with CapsuleMesh until Task 6.

- [ ] **Step 4: Tests PASS; also run the game windowed locally and confirm walk/jump/camera feel:** `"$GODOT" --path godot` (Eric can do this, or defer to the screenshot check in Task 6).

- [ ] **Step 5: Commit** — `git commit -m "godot: player controller + spring-arm camera"`

---

### Task 5: Crosshair-true shooting

**Files:**
- Create: `godot/scripts/logic/aim.gd`
- Modify: `godot/scripts/player.gd` (fire logic + weapon state)
- Create: `godot/scripts/inventory.gd`
- Test: `godot/tests/test_aim.gd`, `godot/tests/test_inventory.gd`

**Interfaces:**
- Produces:
  - `Aim.fire_direction(cam_origin: Vector3, cam_forward: Vector3, aim_hit: Variant, muzzle: Vector3, max_range: float) -> Vector3` (static): direction from muzzle toward the camera-ray hit point (or toward `cam_origin + cam_forward * max_range` when `aim_hit == null`). This is THE crosshair-true fix.
  - `Inventory` (class_name, RefCounted): `slots: Array` (5, entries null or `{type, rarity, ammo, reserve, reloading, reload_end}`), `slot: int`, `func add_weapon(type: int, rarity: int)` (same auto-equip/replace semantics as Rust `add_weapon`), `func switch(i: int)`, `func current() -> Dictionary`.
- Consumes: `Weapons.cfg/damage`.

- [ ] **Step 1: Failing tests**

```gdscript
# godot/tests/test_aim.gd
static func run(t) -> void:
    # camera behind-right of player; crosshair looks at a wall point straight ahead
    var cam_o := Vector3(0.9, 2.0, 3.8)
    var fwd := Vector3(0, 0, -1)
    var hit := Vector3(0, 2.0, -50.0)     # what the camera ray hit
    var muzzle := Vector3(0.3, 1.4, -0.5) # offset gun barrel
    var d := Aim.fire_direction(cam_o, fwd, hit, muzzle, 250.0)
    var reach := muzzle + d * (hit - muzzle).length()
    t.ok(reach.distance_to(hit) < 0.01, "bullet converges on crosshair point")
    # no hit: aim at far point along camera ray, not parallel offset
    var d2 := Aim.fire_direction(cam_o, fwd, null, muzzle, 250.0)
    var far := cam_o + fwd * 250.0
    t.ok(muzzle + d2 * (far - muzzle).length() != muzzle, "sane fallback dir")
    t.ok((muzzle + d2 * (far - muzzle).length()).distance_to(far) < 0.5, "fallback converges at range")
```

```gdscript
# godot/tests/test_inventory.gd — port of player_slots_fill_and_replace
static func run(t) -> void:
    var inv := Inventory.new()
    t.eq(inv.slot, 0, "starts on pickaxe")
    inv.add_weapon(Weapons.Type.AR, 0)
    t.eq(inv.slot, 1, "auto-equip first pickup")
    for i in 3: inv.add_weapon(Weapons.Type.SMG, 0)
    for s in inv.slots: t.ok(s != null, "all slots filled")
    inv.add_weapon(Weapons.Type.SNIPER, 3)
    t.eq(inv.current().type, Weapons.Type.SNIPER, "pickup replaces current slot")
```

- [ ] **Step 2: Verify FAIL, implement**

```gdscript
# godot/scripts/logic/aim.gd
class_name Aim extends RefCounted
static func fire_direction(cam_origin: Vector3, cam_forward: Vector3,
        aim_hit: Variant, muzzle: Vector3, max_range: float) -> Vector3:
    var target: Vector3
    if aim_hit != null:
        target = aim_hit
    else:
        target = cam_origin + cam_forward * max_range
    return (target - muzzle).normalized()
```

```gdscript
# godot/scripts/inventory.gd
class_name Inventory extends RefCounted
var slots: Array = [null, null, null, null, null]
var slot := 0

func _init() -> void:
    slots[0] = _mk(Weapons.Type.PICKAXE, 0)

static func _mk(type: int, rarity: int) -> Dictionary:
    var c := Weapons.cfg(type)
    return {"type": type, "rarity": rarity, "ammo": c.mag, "reserve": c.mag * 4,
        "reloading": false, "reload_end": 0.0, "last_fire": -10.0}

func current() -> Dictionary: return slots[slot]

func switch(i: int) -> void:
    if i >= 0 and i < 5 and slots[i] != null:
        current().reloading = false
        slot = i

func add_weapon(type: int, rarity: int) -> void:
    for i in range(1, 5):
        if slots[i] == null:
            slots[i] = _mk(type, rarity)
            if slot == 0: slot = i
            return
    var i := 1 if slot == 0 else slot
    slots[i] = _mk(type, rarity)
    slot = i
```

Player fire wiring (in `player.gd` `_physics_process`, plus helpers):

```gdscript
var inventory := Inventory.new()
var fire_cooldown := 0.0

func _try_fire(dt: float) -> void:
    fire_cooldown = maxf(fire_cooldown - dt, 0.0)
    var w := inventory.current()
    var c := Weapons.cfg(w.type)
    var want := Input.is_action_pressed("fire") if c.auto \
        else Input.is_action_just_pressed("fire")
    if not want or fire_cooldown > 0.0 or w.reloading: return
    if not c.melee:
        if w.ammo <= 0: _start_reload(); return
        w.ammo -= 1
    fire_cooldown = c.fire_rate
    # 1) camera ray through crosshair
    var space := get_world_3d().direct_space_state
    var cam_hit = null
    var q := PhysicsRayQueryParameters3D.create(cam.global_position,
        cam.global_position + (-cam.global_transform.basis.z) * c.range)
    q.exclude = [get_rid()]
    var res := space.intersect_ray(q)
    if res: cam_hit = res.position
    # 2) fire each pellet from the muzzle toward that point
    var muzzle: Vector3 = global_position + Vector3(0, 1.4, 0)
    for p in c.pellets:
        var dir := Aim.fire_direction(cam.global_position,
            -cam.global_transform.basis.z, cam_hit, muzzle, c.range)
        var spread: float = c.ads_spread if aiming else c.spread
        dir = dir.rotated(Vector3.UP, randf_range(-spread, spread)) \
                 .rotated(dir.cross(Vector3.UP).normalized(), randf_range(-spread, spread))
        var pq := PhysicsRayQueryParameters3D.create(muzzle, muzzle + dir * c.range)
        pq.exclude = [get_rid()]
        var hit := space.intersect_ray(pq)
        if hit and hit.collider.has_method("hit_by_shot"):
            hit.collider.hit_by_shot(Weapons.damage(w.type, w.rarity), hit.position)
```

- [ ] **Step 3: Tests PASS.** — `"$GODOT" --headless -s tests/run_tests.gd`

- [ ] **Step 4: Commit** — `git commit -m "godot: crosshair-true shooting + inventory"`

---

### Task 6: Animated GLTF characters

**Files:**
- Create: `godot/assets/characters/` (downloaded GLTF + license file)
- Modify: `godot/scenes/player.tscn` (replace capsule mesh with model + AnimationTree)
- Create: `godot/scripts/character_visual.gd`

**Interfaces:**
- Produces: `character_visual.gd` — attach to the model root; `func set_state(moving: bool, sprinting: bool, airborne: bool, aiming: bool)` drives an `AnimationTree` state machine (idle/run/jump/aim). Reused by bots in Task 7.

- [ ] **Step 1: ASK ERIC before downloading.** Source: Quaternius "Universal Animation Library" or KayKit character pack (both CC0, GLTF, pre-animated). State filename, source URL, size in the ask. Place under `godot/assets/characters/` with the license text alongside.

- [ ] **Step 2: Import + wire AnimationTree**

`character_visual.gd`:

```gdscript
class_name CharacterVisual extends Node3D
@onready var anim: AnimationTree = $AnimationTree
func set_state(moving: bool, sprinting: bool, airborne: bool, aiming: bool) -> void:
    var target := "Idle"
    if airborne: target = "Jump"
    elif moving: target = "Run"
    anim["parameters/state/transition_request"] = target
    # aim: blend upper-body aim pose if the pack provides one; else skip
```

Exact animation names depend on the pack — inspect with
`"$GODOT" --headless --path godot -s` a small script that loads the GLTF and
prints `AnimationPlayer.get_animation_list()`, then map names in the
AnimationTree accordingly.

In `player.gd` `_physics_process` add:

```gdscript
$Visual.set_state(velocity.length() > 0.5, Input.is_action_pressed("sprint"),
    not is_on_floor(), aiming)
$Visual.rotation.y = cam_yaw  # body faces camera direction
```

- [ ] **Step 3: Screenshot verification** — extend `tests/screenshot.gd` to instantiate `player.tscn` at origin and screenshot; Read the PNG: a real character model, not a capsule.

- [ ] **Step 4: Commit** (include license file) — `git commit -m "godot: animated character models (CC0)"`

---

### Task 7: Bots

**Files:**
- Create: `godot/scripts/logic/bot_brain.gd`, `godot/scenes/bot.tscn`, `godot/scripts/bot.gd`
- Modify: `godot/scenes/main.tscn` or `world.gd` (spawn ~20 bots)
- Test: `godot/tests/test_bot.gd`

**Interfaces:**
- Produces: `BotBrain` (class_name, RefCounted): fields `health, shield, alive, state (IDLE/ROAM/ENGAGE/FLEE_STORM), wander_target: Vector2, accuracy: float`; methods `take_damage(amount: float)` (shield-first, same as Rust), `think(pos: Vector3, player_pos: Vector3, player_alive: bool, storm: StormLogic, t: float, rand: RandomNumberGenerator) -> Dictionary` returning `{move_dir: Vector3, want_fire: bool, look_at: Vector3}`.
- `bot.gd` (CharacterBody3D): applies brain output with gravity + `move_and_slide`; has `hit_by_shot(dmg, pos)`; head hitbox is a child `Area3D` named `Head` — `hit_by_shot` receives the hit position and applies `headshot` multiplier when `pos.y > global_position.y + 1.45`.

- [ ] **Step 1: Failing tests (port `bot_shield_absorbs_before_health` + engage logic)**

```gdscript
# godot/tests/test_bot.gd
static func run(t) -> void:
    var b := BotBrain.new()
    b.shield = 25.0
    b.take_damage(30.0)
    t.eq(b.shield, 0.0, "shield absorbs first")
    t.ok(absf(b.health - 95.0) < 0.01, "overflow hits health")
    b.take_damage(200.0)
    t.ok(not b.alive, "dies at 0")

    var brain := BotBrain.new()
    var storm := StormLogic.new()
    var rand := RandomNumberGenerator.new(); rand.seed = 7
    var out: Dictionary = brain.think(Vector3.ZERO, Vector3(10, 0, 0), true, storm, 1.0, rand)
    t.ok(brain.state == BotBrain.State.ENGAGE, "engages nearby player")
    t.ok(out.move_dir.length() <= 1.001, "move_dir normalized")
    # storm outside → flee toward center
    var far := Vector3(storm.center.x + storm.radius + 50.0, 0, storm.center.y)
    brain.think(far, Vector3(9999, 0, 9999), true, storm, 2.0, rand)
    t.ok(brain.state == BotBrain.State.FLEE_STORM, "flees storm")
```

- [ ] **Step 2: FAIL, then implement**

```gdscript
# godot/scripts/logic/bot_brain.gd
class_name BotBrain extends RefCounted
enum State {ROAM, ENGAGE, FLEE_STORM}
const ENGAGE_RANGE := 60.0
var health := 100.0
var shield := 0.0
var alive := true
var state := State.ROAM
var wander_target := Vector2.ZERO
var next_wander := 0.0
var accuracy := 0.3

func take_damage(amount: float) -> void:
    if not alive: return
    var absorbed := minf(shield, amount)
    shield -= absorbed
    health -= amount - absorbed
    if health <= 0.0:
        health = 0.0
        alive = false

func think(pos: Vector3, player_pos: Vector3, player_alive: bool,
        storm: StormLogic, t: float, rand: RandomNumberGenerator) -> Dictionary:
    var out := {"move_dir": Vector3.ZERO, "want_fire": false, "look_at": player_pos}
    if storm.outside(pos):
        state = State.FLEE_STORM
        var to_center := Vector3(storm.center.x - pos.x, 0, storm.center.y - pos.z)
        out.move_dir = to_center.normalized()
        return out
    var to_player := player_pos - pos
    if player_alive and to_player.length() < ENGAGE_RANGE:
        state = State.ENGAGE
        out.want_fire = true
        # strafe at mid range, close at long range
        if to_player.length() > 25.0:
            out.move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
        else:
            out.move_dir = Vector3(to_player.z, 0, -to_player.x).normalized() \
                * (1.0 if fposmod(t, 4.0) < 2.0 else -1.0)
        return out
    state = State.ROAM
    if t >= next_wander:
        next_wander = t + rand.randf_range(4.0, 9.0)
        wander_target = Vector2(pos.x, pos.z) \
            + Vector2(rand.randf_range(-40, 40), rand.randf_range(-40, 40))
    var to_t := Vector3(wander_target.x - pos.x, 0, wander_target.y - pos.z)
    if to_t.length() > 2.0: out.move_dir = to_t.normalized()
    return out
```

`bot.gd` node layer: gravity, `move_and_slide()`, calls
`$Visual.set_state(...)` (Task 6 interface), fires hitscan at the player
with accuracy jitter when `want_fire` and line-of-sight ray succeeds, and
implements `hit_by_shot(dmg, hit_pos)` → `brain.take_damage`, `queue_free`
plus loot drop on death. Spawn: `world.gd` places 20 bots at random land
points (`Terrain.height(x,z) > 1.0`) with `BOT_NAMES` from the Rust file.

- [ ] **Step 3: Tests PASS. Commit** — `git commit -m "godot: bot brain + spawning"`

---

### Task 8: Loot, chests, pickup, HUD

**Files:**
- Create: `godot/scenes/loot.tscn`, `godot/scripts/loot.gd`
- Create: `godot/scenes/hud.tscn`, `godot/scripts/hud.gd`
- Modify: `godot/scripts/world.gd` (scatter loot + chests), `godot/scripts/player.gd` (E to pick up; number keys switch; R reload)

**Interfaces:**
- Consumes: `Inventory.add_weapon`, `Weapons.RARITY_COLORS/RARITY_NAMES`.
- Produces: `loot.gd` (Area3D) exposes `type: int`, `rarity: int`; player picks up on E when overlapping. HUD reads the `"player"` group node: health/shield bars, ammo `X / Y`, slot strip 1-5 with rarity colors, kill counter, storm timer, crosshair that expands with `spread`.

- [ ] **Step 1: Loot scatter** — in `world.gd`: 90 ground weapons + 24 chests at random land points, `roll_rarity(0.0, randf())` for ground, `roll_rarity(0.15, randf())` for chests. Loot visual: small rotating colored box (rarity color) + point light.

- [ ] **Step 2: Player pickup + slot keys** — in `player.gd`:

```gdscript
func _unhandled_key_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo:
        var n := event.keycode - KEY_1
        if n >= 0 and n < 5: inventory.switch(n)
        if event.keycode == KEY_R: _start_reload()
        if event.keycode == KEY_E: _try_pickup()
```

`_start_reload` mirrors the Rust semantics: no-op when mag full / reserve
empty / melee; sets `reloading` + `reload_end = now + cfg.reload`; a check
in `_physics_process` completes it (move `min(mag - ammo, reserve)` rounds).

- [ ] **Step 3: HUD** — CanvasLayer with health/shield `ProgressBar`s, ammo Label, slot HBox, storm phase Label, center crosshair (four `ColorRect` ticks whose offset follows a `spread` value lerped exactly like the Rust `cross_spread`: 3.0 aiming / 14.0 moving / 8.0 idle).

- [ ] **Step 4: Manual/screenshot check, commit** — `git commit -m "godot: loot, pickup, HUD"`

---

### Task 9: Storm visuals + match flow

**Files:**
- Create: `godot/scripts/storm_visual.gd` (translucent cylinder wall, scale = radius)
- Create: `godot/scenes/menu.tscn`, `godot/scripts/game_flow.gd` (autoload)
- Modify: `godot/scenes/main.tscn`, `godot/scripts/player.gd` (skydive state)

**Interfaces:**
- Consumes: `StormLogic`, player `take_damage`, bots-alive count.
- Produces: `GameFlow` autoload with `state: {MENU, SKYDIVE, PLAYING, ENDED}`, `func start_match()`, `signal match_ended(victory: bool)`.

- [ ] **Step 1: Storm** — `storm_visual.gd`: a `MeshInstance3D` CylinderMesh (height 200, open-ended look via transparent purple material `Color(0.5, 0.2, 0.8, 0.25)`, `cull_mode = CULL_DISABLED`); each frame set `position = Vector3(logic.center.x, 0, logic.center.y)` and `scale = Vector3(logic.radius, 1, logic.radius)` (unit-radius mesh). Apply `logic.dps * dt` damage to player and bots outside.

- [ ] **Step 2: Flow** — menu scene: title + DROP IN button → `start_match()`. Skydive: spawn player at `Vector3(randf_range(-80, 80), 120, randf_range(-80, 80))`, fall capped at -38 m/s (skydive) then -7 (auto-glide below 30m over terrain), full air control at 11-14 m/s; on landing → PLAYING. ENDED when player dies (defeat) or all bots dead (VICTORY ROYALE) → end screen with kills + Play Again; `Input.mouse_mode = MOUSE_MODE_VISIBLE` in menus, `CAPTURED` in play (this is the pointer-lock the browser build needs — Godot handles the click-to-capture dance on web).

- [ ] **Step 3: Full headless test run + screenshot of menu and mid-match. Commit** — `git commit -m "godot: storm visuals + match flow"`

---

### Task 10: Web export → docs/play

**Files:**
- Create: `godot/export_presets.cfg`
- Create: `docs/play/` (export output, committed)
- Modify: `README.md` (link to new build)

- [ ] **Step 1: Download export templates** (ask Eric first — ~1GB):

```bash
"$GODOT" --headless --export-release nonexistent 2>&1 | head -2  # confirms template path it wants
# templates: https://github.com/godotengine/godot/releases → matching .tpz
```

- [ ] **Step 2: export_presets.cfg** — Web preset, `variant/thread_support=false` (the non-threaded/GitHub-Pages-safe setting), `vram_texture_compression/for_desktop=true`, export path `../docs/play/index.html`.

- [ ] **Step 3: Export + verify locally**

```bash
"$GODOT" --headless --path godot --export-release Web ../docs/play/index.html
python3 -m http.server 8080 -d docs/play &
# open http://localhost:8080 in the Claude Browser: menu renders, DROP IN starts a match
```

Expected: total payload < 60MB (wasm+pck); menu visible in browser; no console errors on load.

- [ ] **Step 4: README link + commit**

```bash
git add godot/export_presets.cfg docs/play README.md
git commit -m "godot: web export to docs/play"
```

- [ ] **Step 5: Ask Eric** whether to point the Pages link at `docs/play/` now or keep both builds linked.
