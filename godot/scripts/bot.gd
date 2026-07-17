extends CharacterBody3D
const GRAVITY := 24.0
var brain := BotBrain.new()
var bot_name := "Bot"
var weapon_type := Weapons.Type.AR
var weapon_rarity := 0
var fire_cooldown := 0.0
var _rand := RandomNumberGenerator.new()
var _t := 0.0

@onready var visual: Node3D = $Visual

func _ready() -> void:
	add_to_group("bots")
	weapon_type = _rand.randi_range(Weapons.Type.AR, Weapons.Type.PISTOL)
	weapon_rarity = Weapons.roll_rarity(0.0, _rand.randf())
	brain.accuracy = _rand.randf_range(0.15, 0.5)
	brain.shield = [0.0, 0.0, 25.0, 50.0][_rand.randi_range(0, 3)]

func _physics_process(dt: float) -> void:
	if GameFlow.state != GameFlow.State.PLAYING and GameFlow.state != GameFlow.State.SKYDIVE:
		return
	_t += dt
	var players := get_tree().get_nodes_in_group("player")
	if players.is_empty(): return
	var player: Node3D = players[0]
	var storm: StormLogic = get_tree().get_first_node_in_group("storm").logic \
		if get_tree().get_first_node_in_group("storm") else StormLogic.new()
	var out: Dictionary = brain.think(global_position, player.global_position,
		player.alive, storm, _t, _rand)
	var speed := 5.0
	velocity.x = out.move_dir.x * speed
	velocity.z = out.move_dir.z * speed
	velocity.y = maxf(velocity.y - GRAVITY * dt, -55.0)
	move_and_slide()
	if out.move_dir.length_squared() > 0.01:
		visual.rotation.y = lerp_angle(visual.rotation.y,
			atan2(-out.move_dir.x, -out.move_dir.z) + PI, 1.0 - exp(-10.0 * dt))
	if visual.has_method("set_state"):
		visual.set_state(out.move_dir.length_squared() > 0.01, false, not is_on_floor(), false)
	_maybe_fire(dt, player)

func _maybe_fire(dt: float, player: Node3D) -> void:
	fire_cooldown = maxf(fire_cooldown - dt, 0.0)
	if fire_cooldown > 0.0 or brain.state != BotBrain.State.ENGAGE or not player.alive:
		return
	var c := Weapons.cfg(weapon_type)
	fire_cooldown = c.fire_rate * 2.0  # bots fire at half player cadence
	# line of sight
	var from := global_position + Vector3(0, 1.5, 0)
	var to: Vector3 = player.global_position + Vector3(0, 1.2, 0)
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, to)
	q.exclude = [get_rid()]
	var hit := space.intersect_ray(q)
	if hit and hit.collider == player:
		if _rand.randf() < brain.accuracy:
			player.take_damage(Weapons.damage(weapon_type, weapon_rarity) * 0.5)

func hit_by_shot(dmg: float, hit_pos: Vector3) -> void:
	var headshot := hit_pos.y > global_position.y + 1.45
	brain.take_damage(dmg * (1.5 if headshot else 1.0))
	if not brain.alive:
		GameFlow.kills += 1
		# drop weapon
		var loot := preload("res://scenes/loot.tscn").instantiate()
		loot.type = weapon_type
		loot.rarity = weapon_rarity
		loot.position = global_position + Vector3(0, 0.5, 0)
		get_parent().add_child(loot)
		queue_free()
		# victory check (deferred so this bot is out of the tree)
		get_tree().create_timer(0.05).timeout.connect(func():
			if get_tree() and get_tree().get_nodes_in_group("bots").is_empty():
				GameFlow.end_match(true))

func take_damage(amount: float) -> void:
	hit_by_shot(amount, global_position)
