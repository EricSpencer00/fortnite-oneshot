extends Node3D
var type: int = Weapons.Type.AR
var rarity := 0
var is_chest := false

func _ready() -> void:
	add_to_group("loot")
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.9, 0.6, 0.5) if is_chest else Vector3(0.7, 0.25, 0.25)
	mi.mesh = box
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Weapons.RARITY_COLORS[rarity]
	mat.emission_enabled = true
	mat.emission = Weapons.RARITY_COLORS[rarity]
	mat.emission_energy_multiplier = 0.6
	mi.material_override = mat
	add_child(mi)

func _process(dt: float) -> void:
	rotate_y(dt * 1.5)
