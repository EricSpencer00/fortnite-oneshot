class_name CharacterVisual extends Node3D
## Procedurally-animated blocky character (fallback / default visual).
## set_state drives simple walk-cycle animation; swap for a GLTF rig later.
@export var shirt := Color8(47, 159, 224)
var _phase := 0.0
var _moving := false
var _airborne := false
var _l_arm: MeshInstance3D
var _r_arm: MeshInstance3D
var _l_leg: MeshInstance3D
var _r_leg: MeshInstance3D

func _ready() -> void:
	var skin := Color8(224, 178, 143)
	var pants := Color8(52, 58, 72)
	_box(Vector3(0.55, 0.65, 0.32), Vector3(0, 1.15, 0), shirt)          # torso
	_box(Vector3(0.34, 0.34, 0.34), Vector3(0, 1.68, 0), skin)           # head
	_l_arm = _box(Vector3(0.16, 0.55, 0.16), Vector3(-0.4, 1.2, 0), shirt)
	_r_arm = _box(Vector3(0.16, 0.55, 0.16), Vector3(0.4, 1.2, 0), shirt)
	_l_leg = _box(Vector3(0.2, 0.75, 0.2), Vector3(-0.15, 0.42, 0), pants)
	_r_leg = _box(Vector3(0.2, 0.75, 0.2), Vector3(0.15, 0.42, 0), pants)

func _box(size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := BoxMesh.new()
	m.size = size
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mi.material_override = mat
	mi.position = pos
	add_child(mi)
	return mi

func set_state(moving: bool, _sprinting: bool, airborne: bool, _aiming: bool) -> void:
	_moving = moving
	_airborne = airborne

func _process(dt: float) -> void:
	if _airborne:
		_l_leg.rotation.x = 0.5
		_r_leg.rotation.x = -0.3
		_l_arm.rotation.x = -2.6
		_r_arm.rotation.x = -2.6
		return
	if _moving:
		_phase += dt * 9.0
		var s := sin(_phase)
		_l_leg.rotation.x = s * 0.7
		_r_leg.rotation.x = -s * 0.7
		_l_arm.rotation.x = -s * 0.6
		_r_arm.rotation.x = s * 0.6
	else:
		_phase = 0.0
		for limb in [_l_leg, _r_leg, _l_arm, _r_arm]:
			limb.rotation.x = lerpf(limb.rotation.x, 0.0, minf(dt * 10.0, 1.0))
