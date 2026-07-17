extends Node3D
## Builds terrain mesh/collision, water, lighting, trees, loot, bots.
const STEP := 4.0
const BOT_COUNT := 20
const BOT_NAMES := ["Raptor", "Nomad", "Wildcat", "Drift", "Hollow", "Bonesy",
	"Rook", "Sledge", "Vega", "Onyx", "Kestrel", "Mako", "Fable", "Torque",
	"Ember", "Grit", "Pylon", "Havoc", "Lumen", "Static", "Coil", "Frost", "Saber", "Quill"]

var bot_scene := preload("res://scenes/bot.tscn")
var loot_scene := preload("res://scenes/loot.tscn")

func _ready() -> void:
	add_to_group("world")
	_build_terrain()
	_add_water()
	_add_sun_and_sky()
	_add_trees()

func populate() -> void:
	## Called by GameFlow on match start: loot + bots.
	var rand := RandomNumberGenerator.new()
	for i in 90:
		var p := _rand_land_point(rand)
		var l := loot_scene.instantiate()
		l.type = rand.randi_range(Weapons.Type.AR, Weapons.Type.PISTOL)
		l.rarity = Weapons.roll_rarity(0.0, rand.randf())
		l.position = p + Vector3(0, 0.6, 0)
		add_child(l)
	for i in 24:
		var p := _rand_land_point(rand)
		var l := loot_scene.instantiate()
		l.type = rand.randi_range(Weapons.Type.AR, Weapons.Type.PISTOL)
		l.rarity = Weapons.roll_rarity(0.15, rand.randf())
		l.is_chest = true
		l.position = p + Vector3(0, 0.6, 0)
		add_child(l)
	for i in BOT_COUNT:
		var b := bot_scene.instantiate()
		b.bot_name = BOT_NAMES[i % BOT_NAMES.size()]
		b.position = _rand_land_point(rand) + Vector3(0, 1.2, 0)
		add_child(b)

func _rand_land_point(rand: RandomNumberGenerator) -> Vector3:
	for attempt in 64:
		var x := rand.randf_range(-Terrain.HALF * 0.8, Terrain.HALF * 0.8)
		var z := rand.randf_range(-Terrain.HALF * 0.8, Terrain.HALF * 0.8)
		var h := Terrain.height(x, z)
		if h > 1.0:
			return Vector3(x, h, z)
	return Vector3(0, Terrain.height(0, 0), 0)

func _build_terrain() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := int(Terrain.WORLD_SIZE / STEP)
	for iz in n:
		for ix in n:
			var x0 := -Terrain.HALF + ix * STEP
			var z0 := -Terrain.HALF + iz * STEP
			var p00 := Vector3(x0, Terrain.height(x0, z0), z0)
			var p10 := Vector3(x0 + STEP, Terrain.height(x0 + STEP, z0), z0)
			var p01 := Vector3(x0, Terrain.height(x0, z0 + STEP), z0 + STEP)
			var p11 := Vector3(x0 + STEP, Terrain.height(x0 + STEP, z0 + STEP), z0 + STEP)
			# counter-clockwise seen from above (+Y) so faces aren't culled
			for tri in [[p00, p10, p01], [p10, p11, p01]]:
				var normal: Vector3 = (tri[1] - tri[0]).cross(tri[2] - tri[0]).normalized()
				for v in tri:
					st.set_color(_ground_color(v.y))
					st.set_normal(normal)
					st.add_vertex(v)
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	mi.material_override = mat
	add_child(mi)
	# heightmap collision: robust (two-sided) and cheap vs. a concave mesh
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var hm := HeightMapShape3D.new()
	var pts := n + 1
	var data := PackedFloat32Array()
	data.resize(pts * pts)
	for iz in pts:
		for ix in pts:
			var x := -Terrain.HALF + ix * STEP
			var z := -Terrain.HALF + iz * STEP
			data[iz * pts + ix] = Terrain.height(x, z)
	hm.map_width = pts
	hm.map_depth = pts
	hm.map_data = data
	shape.shape = hm
	shape.scale = Vector3(STEP, 1, STEP)  # heightmap grid spacing is 1m
	body.add_child(shape)
	add_child(body)

func _ground_color(y: float) -> Color:
	if y < 0.6: return Color8(214, 196, 142)
	if y < 12.0: return Color8(88, 148, 74)
	return Color8(126, 130, 138)

func _add_water() -> void:
	var w := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(2000, 2000)
	w.mesh = pm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1.0, 0.0, 0.0, 0.85) if OS.get_cmdline_user_args().has("--debug-water") \
		else Color(0.18, 0.42, 0.66, 0.85)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	w.material_override = m
	add_child(w)

func _add_sun_and_sky() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, 32, 0)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	add_child(sun)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color8(60, 140, 235)
	sky_mat.sky_horizon_color = Color8(180, 210, 235)
	sky_mat.ground_bottom_color = Color8(120, 150, 150)
	sky_mat.ground_horizon_color = Color8(180, 210, 235)
	sky_mat.sun_angle_max = 30.0
	var sky := Sky.new()
	sky.sky_material = sky_mat
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 1.0
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	add_child(env)

func _add_trees() -> void:
	var rand := RandomNumberGenerator.new()
	rand.seed = 12345
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.25
	trunk_mesh.bottom_radius = 0.35
	trunk_mesh.height = 3.0
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color8(101, 74, 48)
	var top_mesh := SphereMesh.new()
	top_mesh.radius = 1.8
	top_mesh.height = 3.2
	var top_mat := StandardMaterial3D.new()
	top_mat.albedo_color = Color8(52, 108, 48)
	for i in 160:
		var x := rand.randf_range(-Terrain.HALF * 0.85, Terrain.HALF * 0.85)
		var z := rand.randf_range(-Terrain.HALF * 0.85, Terrain.HALF * 0.85)
		var h := Terrain.height(x, z)
		if h < 1.5 or h > 14.0: continue
		var trunk := MeshInstance3D.new()
		trunk.mesh = trunk_mesh
		trunk.material_override = trunk_mat
		trunk.position = Vector3(x, h + 1.5, z)
		add_child(trunk)
		var top := MeshInstance3D.new()
		top.mesh = top_mesh
		top.material_override = top_mat
		top.position = Vector3(x, h + 4.2, z)
		add_child(top)
		var body := StaticBody3D.new()
		# trees sit on a separate physics layer so the player's SpringArm3D
		# camera (which only looks at layer 1, the terrain) doesn't collide
		# with foliage and yank the camera into the player's back.
		body.collision_layer = 2
		body.collision_mask = 0
		var col := CollisionShape3D.new()
		var cyl := CylinderShape3D.new()
		cyl.radius = 0.35
		cyl.height = 3.0
		col.shape = cyl
		body.add_child(col)
		body.position = Vector3(x, h + 1.5, z)
		add_child(body)
