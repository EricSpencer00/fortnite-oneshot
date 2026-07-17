extends Node3D
## Root orchestrator: menu / end screens + match wiring.
var _menu: Control
var _end: Control
var _end_title: Label
var _end_sub: Label
var _drop_in_btn: Button

func _ready() -> void:
	_menu = _panel()
	var title := Label.new()
	title.text = "ONESHOT ROYALE"
	title.add_theme_font_size_override("font_size", 56)
	var sub := Label.new()
	sub.text = "WASD move · Shift sprint · Space jump · Mouse aim/fire · E pickup · R reload · 1-5 slots"
	sub.add_theme_font_size_override("font_size", 14)
	var btn := Button.new()
	btn.text = "  DROP IN  "
	btn.add_theme_font_size_override("font_size", 30)
	btn.pressed.connect(_start)
	_drop_in_btn = btn
	for n in [title, sub, btn]:
		_box_of(_menu).add_child(n)

	_end = _panel()
	_end_title = Label.new()
	_end_title.add_theme_font_size_override("font_size", 52)
	_end_sub = Label.new()
	_end_sub.add_theme_font_size_override("font_size", 22)
	var again := Button.new()
	again.text = "  PLAY AGAIN  "
	again.add_theme_font_size_override("font_size", 26)
	again.pressed.connect(_start)
	for n in [_end_title, _end_sub, again]:
		_box_of(_end).add_child(n)
	_end.visible = false

	GameFlow.match_ended.connect(_on_match_ended)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if "--screenshot" in OS.get_cmdline_user_args():
		_screenshot_run()
	if "--click-test" in OS.get_cmdline_user_args():
		_click_test_run()

## Automated visual check: capture menu + in-match frames, then quit.
func _screenshot_run() -> void:
	for i in 8: await get_tree().process_frame
	_save_shot("/tmp/shot_menu.png")
	_start()
	for i in 5: await get_tree().process_frame
	var p: Node3D = get_tree().get_nodes_in_group("player")[0]
	p.global_position = Vector3(0, Terrain.height(0.0, 0.0) + 2.0, 0)
	GameFlow.begin_playing()
	for i in 40: await get_tree().process_frame
	print("DEBUG terrain(0,0)=", Terrain.height(0.0, 0.0),
		" player=", p.global_position, " on_floor=", p.is_on_floor())
	_save_shot("/tmp/shot_play.png")
	$Storm._wall.visible = false
	for i in 3: await get_tree().process_frame
	_save_shot("/tmp/shot_nostorm.png")
	$Storm._wall.visible = true
	get_tree().quit(0)

## Automated input-pipeline check: synthesize a real mouse click on the
## DROP IN button via push_input and verify the match actually starts.
func _click_test_run() -> void:
	for i in 10: await get_tree().process_frame
	var rect: Rect2 = _drop_in_btn.get_global_rect()
	var pos: Vector2 = rect.get_center()

	var motion := InputEventMouseMotion.new()
	motion.position = pos
	motion.global_position = pos
	get_viewport().push_input(motion)

	var down := InputEventMouseButton.new()
	down.position = pos
	down.global_position = pos
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	get_viewport().push_input(down)

	var up := InputEventMouseButton.new()
	up.position = pos
	up.global_position = pos
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	get_viewport().push_input(up)

	for i in 10: await get_tree().process_frame
	print("CLICK-TEST: state=", GameFlow.state)
	_save_shot("/tmp/shot_clicktest.png")
	if GameFlow.state != GameFlow.State.MENU:
		print("CLICK-TEST: PASS")
		get_tree().quit(0)
	else:
		print("CLICK-TEST: FAIL")
		get_tree().quit(1)

func _save_shot(path: String) -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("saved ", path)

## Fullscreen dim + centered VBox. Returns the outer control; its VBox is
## reachable via _box_of().
func _panel() -> Control:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	var c := Control.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(c)
	var dim := ColorRect.new()
	dim.color = Color(0.05, 0.08, 0.14, 0.75)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.add_child(center)
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 18)
	center.add_child(box)
	c.set_meta("box", box)
	return c

func _box_of(panel: Control) -> VBoxContainer:
	return panel.get_meta("box")

func _start() -> void:
	_menu.visible = false
	_end.visible = false
	for n in get_tree().get_nodes_in_group("bots"): n.queue_free()
	for n in get_tree().get_nodes_in_group("loot"): n.queue_free()
	await get_tree().process_frame
	GameFlow.start_match()
	$World.populate()
	get_tree().call_group("player", "on_match_started")
	get_tree().call_group("storm", "on_match_started")

func _on_match_ended(won: bool) -> void:
	_end_title.text = "VICTORY ROYALE!" if won else "ELIMINATED"
	_end_title.add_theme_color_override("font_color",
		Color8(255, 210, 77) if won else Color8(235, 80, 80))
	_end_sub.text = "Eliminations: %d" % GameFlow.kills
	_end.visible = true

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
