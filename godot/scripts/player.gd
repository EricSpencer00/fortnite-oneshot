class_name PlayerController extends CharacterBody3D
signal died

## GameFlow is an autoload singleton; under `-s` headless test mode autoloads
## aren't registered, so the bare identifier "GameFlow" fails to resolve at
## compile time and silently kills every assertion in any test that loads
## this script. Preload the script directly (for the State enum + statics)
## and look the node up dynamically at runtime instead.
const _GameFlowScript = preload("res://scripts/game_flow.gd")

func _game_flow() -> Node:
	return get_node_or_null("/root/GameFlow")

const SPEED := 6.5
const SPRINT_MULT := 1.55
const ADS_MULT := 0.55
const JUMP_VEL := 8.5
const GRAVITY := 24.0
const MOUSE_SENS := 0.0023
const SKYDIVE_FALL := -38.0
const GLIDE_FALL := -7.0

var cam_yaw := 0.0
var cam_pitch := -0.15
var aiming := false
var health := 100.0
var shield := 0.0
var alive := true
var inventory := Inventory.new()
var fire_cooldown := 0.0
var gliding := false
var spread := 8.0

@onready var spring: SpringArm3D = $SpringArm
@onready var cam: Camera3D = $SpringArm/Camera3D
@onready var visual: Node3D = $Visual

func _ready() -> void:
	add_to_group("player")
	add_to_group("match_listeners")
	# the camera arm must not collide with our own capsule
	spring.add_excluded_object(get_rid())
	visible = false  # hidden until a match starts

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var s := MOUSE_SENS * (0.55 if aiming else 1.0)
		cam_yaw -= event.relative.x * s
		cam_pitch = clampf(cam_pitch - event.relative.y * s, -1.35, 1.35)

func _unhandled_key_input(event: InputEvent) -> void:
	var gf = _game_flow()
	if gf == null or gf.state != _GameFlowScript.State.PLAYING: return
	if event is InputEventKey and event.pressed and not event.echo:
		var n: int = event.physical_keycode - KEY_1
		if n >= 0 and n < 5: inventory.switch(n)
		if event.physical_keycode == KEY_R: _start_reload()
		if event.physical_keycode == KEY_E: _try_pickup()

## Pure movement math — testable headless.
func simulate_move(input_dir: Vector2, sprint: bool, jump: bool, dt: float) -> void:
	var fwd := Vector3(-sin(cam_yaw), 0, -cos(cam_yaw))
	var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw))
	var wish := fwd * input_dir.y + right * input_dir.x
	if wish.length_squared() > 0.0:
		var spd := SPEED
		if sprint and input_dir.y > 0.0 and not aiming: spd *= SPRINT_MULT
		if aiming: spd *= ADS_MULT
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
	if not alive: return
	var gf = _game_flow()
	var state: int = gf.state if gf != null else _GameFlowScript.State.MENU
	match state:
		_GameFlowScript.State.SKYDIVE:
			_skydive(dt)
		_GameFlowScript.State.PLAYING:
			_play(dt)
		_:
			pass
	spring.rotation = Vector3(cam_pitch, cam_yaw, 0)

func _skydive(dt: float) -> void:
	var ground := Terrain.height(global_position.x, global_position.z)
	if not gliding and global_position.y - ground < 30.0:
		gliding = true
	var target_fall := GLIDE_FALL if gliding else SKYDIVE_FALL
	velocity.y += (target_fall - velocity.y) * minf(dt * 2.2, 1.0)
	var input_dir := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
	var fwd := Vector3(-sin(cam_yaw), 0, -cos(cam_yaw))
	var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw))
	var move3 := fwd * input_dir.y + right * input_dir.x
	var speed := 11.0 if gliding else 14.0
	velocity.x = move3.x * speed
	velocity.z = move3.z * speed
	move_and_slide()
	visual.rotation.y = cam_yaw + PI
	if is_on_floor() or global_position.y <= ground + 0.1:
		velocity = Vector3.ZERO
		gliding = false
		var gf = _game_flow()
		if gf != null: gf.begin_playing()

func _play(dt: float) -> void:
	var input_dir := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
	aiming = Input.is_action_pressed("aim") and not Weapons.cfg(inventory.current().type).melee
	simulate_move(input_dir, Input.is_action_pressed("sprint"),
		Input.is_action_just_pressed("jump"), dt)
	move_and_slide()
	_try_fire(dt)
	_update_reload()
	# ADS zoom
	var c := Weapons.cfg(inventory.current().type)
	var target_fov: float = 75.0 * (c.ads_zoom if aiming else 1.0)
	cam.fov = lerpf(cam.fov, target_fov, 1.0 - exp(-10.0 * dt))
	# crosshair spread (same targets as rust)
	var moving := Vector2(velocity.x, velocity.z).length() > 1.0
	var spread_target := 3.0 if aiming else (14.0 if moving else 8.0)
	spread = lerpf(spread, spread_target, 1.0 - exp(-10.0 * dt))
	# body faces camera when aiming/firing, else movement dir
	if visual:
		var target_yaw := cam_yaw + PI
		if not aiming and not Input.is_action_pressed("fire") and moving:
			target_yaw = atan2(-velocity.x, -velocity.z) + PI
		visual.rotation.y = lerp_angle(visual.rotation.y, target_yaw, 1.0 - exp(-14.0 * dt))
		if visual.has_method("set_state"):
			visual.set_state(moving, Input.is_action_pressed("sprint"), not is_on_floor(), aiming)

func _try_fire(dt: float) -> void:
	fire_cooldown = maxf(fire_cooldown - dt, 0.0)
	var w: Dictionary = inventory.current()
	var c := Weapons.cfg(w.type)
	var want: bool = Input.is_action_pressed("fire") if c.auto \
		else Input.is_action_just_pressed("fire")
	if not want or fire_cooldown > 0.0 or w.reloading: return
	if not c.melee:
		if w.ammo <= 0:
			_start_reload()
			return
		w.ammo -= 1
	fire_cooldown = c.fire_rate
	cam_pitch += 0.02 * c.get("recoil", 0.0) * 500.0 + (0.004 if not c.melee else 0.0)
	var space := get_world_3d().direct_space_state
	var cam_fwd := -cam.global_transform.basis.z
	var cam_hit = null
	var q := PhysicsRayQueryParameters3D.create(cam.global_position,
		cam.global_position + cam_fwd * c.range)
	q.exclude = [get_rid()]
	var res := space.intersect_ray(q)
	if res: cam_hit = res.position
	var muzzle: Vector3 = global_position + Vector3(0, 1.4, 0)
	for p in c.pellets:
		var dir := Aim.fire_direction(cam.global_position, cam_fwd, cam_hit, muzzle, c.range)
		var sp: float = c.ads_spread if aiming else c.spread
		if sp > 0.0:
			dir = dir.rotated(Vector3.UP, randf_range(-sp, sp))
			var axis := dir.cross(Vector3.UP)
			if axis.length_squared() > 1e-6:
				dir = dir.rotated(axis.normalized(), randf_range(-sp, sp))
		var pq := PhysicsRayQueryParameters3D.create(muzzle, muzzle + dir * c.range)
		pq.exclude = [get_rid()]
		var hit := space.intersect_ray(pq)
		if hit and hit.collider.has_method("hit_by_shot"):
			hit.collider.hit_by_shot(Weapons.damage(w.type, w.rarity), hit.position)

func _start_reload() -> void:
	var w: Dictionary = inventory.current()
	var c := Weapons.cfg(w.type)
	if c.melee or w.reloading or w.ammo >= c.mag or w.reserve <= 0: return
	w.reloading = true
	w.reload_end = Time.get_ticks_msec() / 1000.0 + c.reload

func _update_reload() -> void:
	var w: Dictionary = inventory.current()
	if w.reloading and Time.get_ticks_msec() / 1000.0 >= w.reload_end:
		var c := Weapons.cfg(w.type)
		var need: int = c.mag - w.ammo
		var take: int = mini(need, w.reserve)
		w.ammo += take
		w.reserve -= take
		w.reloading = false

func _try_pickup() -> void:
	var best: Node3D = null
	var best_d := 3.0
	for l in get_tree().get_nodes_in_group("loot"):
		var d: float = l.global_position.distance_to(global_position)
		if d < best_d:
			best_d = d
			best = l
	if best:
		inventory.add_weapon(best.type, best.rarity)
		inventory.add_ammo(30)
		best.queue_free()

func take_damage(amount: float) -> void:
	if not alive: return
	var absorbed := minf(shield, amount)
	shield -= absorbed
	health -= amount - absorbed
	if health <= 0.0:
		health = 0.0
		alive = false
		died.emit()
		var gf = _game_flow()
		if gf != null: gf.end_match(false)

func on_match_started() -> void:
	visible = true
	health = 100.0
	shield = 0.0
	alive = true
	gliding = false
	inventory = Inventory.new()
	global_position = Vector3(randf_range(-80, 80), 120, randf_range(-80, 80))
	velocity = Vector3(0, -5, 0)
