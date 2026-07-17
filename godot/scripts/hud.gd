extends CanvasLayer
var _health: ProgressBar
var _shield: ProgressBar
var _ammo: Label
var _slots: HBoxContainer
var _storm_label: Label
var _kills: Label
var _cross: Control
var _msg: Label

func _ready() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var bottom := VBoxContainer.new()
	bottom.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	bottom.position = Vector2(24, -110)
	bottom.custom_minimum_size = Vector2(260, 0)
	root.add_child(bottom)
	_shield = _bar(Color8(47, 159, 224))
	_health = _bar(Color8(94, 205, 96))
	bottom.add_child(_shield)
	bottom.add_child(_health)

	_ammo = Label.new()
	_ammo.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_ammo.position = Vector2(-160, -80)
	_ammo.add_theme_font_size_override("font_size", 26)
	root.add_child(_ammo)

	_slots = HBoxContainer.new()
	_slots.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_slots.position = Vector2(-150, -46)
	root.add_child(_slots)
	for i in 5:
		var r := ColorRect.new()
		r.custom_minimum_size = Vector2(52, 34)
		r.color = Color(0, 0, 0, 0.4)
		_slots.add_child(r)

	_storm_label = Label.new()
	_storm_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_storm_label.position = Vector2(-80, 14)
	_storm_label.add_theme_font_size_override("font_size", 18)
	root.add_child(_storm_label)

	_kills = Label.new()
	_kills.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_kills.position = Vector2(-140, 14)
	_kills.add_theme_font_size_override("font_size", 18)
	root.add_child(_kills)

	_msg = Label.new()
	_msg.set_anchors_preset(Control.PRESET_CENTER)
	_msg.position = Vector2(-160, -140)
	_msg.add_theme_font_size_override("font_size", 24)
	root.add_child(_msg)

	_cross = Control.new()
	_cross.set_anchors_preset(Control.PRESET_CENTER)
	_cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_cross)
	for i in 4:
		var tick := ColorRect.new()
		tick.color = Color(1, 1, 1, 0.9)
		tick.name = "t%d" % i
		_cross.add_child(tick)

func _bar(col: Color) -> ProgressBar:
	var b := ProgressBar.new()
	b.max_value = 100
	b.show_percentage = false
	b.custom_minimum_size = Vector2(260, 16)
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	b.add_theme_stylebox_override("fill", sb)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.45)
	b.add_theme_stylebox_override("background", bg)
	return b

func _process(_dt: float) -> void:
	visible = GameFlow.state == GameFlow.State.PLAYING or GameFlow.state == GameFlow.State.SKYDIVE
	var players := get_tree().get_nodes_in_group("player")
	if players.is_empty(): return
	var p = players[0]
	_health.value = p.health
	_shield.value = p.shield
	var w: Dictionary = p.inventory.current()
	var c := Weapons.cfg(w.type)
	if c.melee:
		_ammo.text = c.name
	elif w.reloading:
		_ammo.text = "Reloading..."
	else:
		_ammo.text = "%d / %d" % [w.ammo, w.reserve]
	for i in 5:
		var r: ColorRect = _slots.get_child(i)
		var s = p.inventory.slots[i]
		if s == null:
			r.color = Color(0, 0, 0, 0.35)
		else:
			var col: Color = Weapons.RARITY_COLORS[s.rarity]
			col.a = 0.95 if i == p.inventory.slot else 0.5
			r.color = col
	_kills.text = "Eliminations: %d   Alive: %d" % [GameFlow.kills,
		get_tree().get_nodes_in_group("bots").size() + 1]
	var storm_node := get_tree().get_first_node_in_group("storm")
	if storm_node:
		var sl: StormLogic = storm_node.logic
		var what := "shrinking!" if sl.shrinking else "shrinks in %ds" % int(sl.time_left())
		_storm_label.text = "Storm %s" % what
	if GameFlow.state == GameFlow.State.SKYDIVE:
		var alt: float = p.global_position.y - Terrain.height(p.global_position.x, p.global_position.z)
		_msg.text = "%dm — %s" % [int(maxf(alt, 0)), "gliding" if p.gliding else "skydiving"]
	else:
		_msg.text = ""
	# crosshair
	var sp: float = p.spread
	var ticks := _cross.get_children()
	ticks[0].position = Vector2(-1.5, -sp - 8); ticks[0].size = Vector2(3, 8)
	ticks[1].position = Vector2(-1.5, sp); ticks[1].size = Vector2(3, 8)
	ticks[2].position = Vector2(-sp - 8, -1.5); ticks[2].size = Vector2(8, 3)
	ticks[3].position = Vector2(sp, -1.5); ticks[3].size = Vector2(8, 3)
