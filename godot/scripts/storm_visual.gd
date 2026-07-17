extends Node3D
## Owns the StormLogic instance; draws the wall; applies storm damage.
var logic := StormLogic.new()
var _wall: MeshInstance3D

func _ready() -> void:
	add_to_group("storm")
	_wall = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 1.0
	cyl.bottom_radius = 1.0
	cyl.height = 240.0
	cyl.radial_segments = 96
	_wall.mesh = cyl
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.55, 0.2, 0.85, 0.14)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_wall.material_override = m
	add_child(_wall)

func on_match_started() -> void:
	logic = StormLogic.new()

func _physics_process(dt: float) -> void:
	if GameFlow.state != GameFlow.State.PLAYING: return
	logic.update(dt)
	_wall.position = Vector3(logic.center.x, 100.0, logic.center.y)
	_wall.scale = Vector3(logic.radius, 1, logic.radius)
	for p in get_tree().get_nodes_in_group("player"):
		if p.alive and logic.outside(p.global_position):
			p.take_damage(logic.dps * dt)
	for b in get_tree().get_nodes_in_group("bots"):
		if logic.outside(b.global_position):
			b.brain.take_damage(logic.dps * dt * 2.0)
			if not b.brain.alive:
				b.queue_free()
