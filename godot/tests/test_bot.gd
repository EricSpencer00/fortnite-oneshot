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
	var rand := RandomNumberGenerator.new()
	rand.seed = 7
	var out: Dictionary = brain.think(Vector3.ZERO, Vector3(10, 0, 0), true, storm, 1.0, rand)
	t.ok(brain.state == BotBrain.State.ENGAGE, "engages nearby player")
	t.ok(out.want_fire, "fires when engaging")
	t.ok(out.move_dir.length() <= 1.001, "move_dir normalized")
	var far := Vector3(storm.center.x + storm.radius + 50.0, 0, storm.center.y)
	brain.think(far, Vector3(9999, 0, 9999), true, storm, 2.0, rand)
	t.ok(brain.state == BotBrain.State.FLEE_STORM, "flees storm")
	var roam_out: Dictionary = brain.think(Vector3.ZERO, Vector3(9999, 0, 9999), true, storm, 3.0, rand)
	t.ok(brain.state == BotBrain.State.ROAM, "roams when player far")
