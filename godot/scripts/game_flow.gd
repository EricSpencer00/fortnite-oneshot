extends Node
## Autoload: match state machine + input map setup.
enum State {MENU, SKYDIVE, PLAYING, ENDED}
signal match_ended(victory: bool)

var state := State.MENU
var kills := 0
var victory := false

func _ready() -> void:
	_setup_input()

func _setup_input() -> void:
	var defs := {
		"move_forward": KEY_W, "move_back": KEY_S,
		"move_left": KEY_A, "move_right": KEY_D,
		"jump": KEY_SPACE, "sprint": KEY_SHIFT,
		"reload": KEY_R, "interact": KEY_E,
	}
	for action in defs:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			var ev := InputEventKey.new()
			ev.physical_keycode = defs[action]
			InputMap.action_add_event(action, ev)
	for pair in [["fire", MOUSE_BUTTON_LEFT], ["aim", MOUSE_BUTTON_RIGHT]]:
		if not InputMap.has_action(pair[0]):
			InputMap.add_action(pair[0])
			var mb := InputEventMouseButton.new()
			mb.button_index = pair[1]
			InputMap.action_add_event(pair[0], mb)
	for i in 5:
		var action := "slot_%d" % (i + 1)
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			var ev := InputEventKey.new()
			ev.physical_keycode = KEY_1 + i
			InputMap.action_add_event(action, ev)

func start_match() -> void:
	kills = 0
	state = State.SKYDIVE
	get_tree().call_group("match_listeners", "on_match_started")
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func begin_playing() -> void:
	state = State.PLAYING

func end_match(won: bool) -> void:
	if state == State.ENDED: return
	state = State.ENDED
	victory = won
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	match_ended.emit(won)
