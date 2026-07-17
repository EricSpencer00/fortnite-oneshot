static func run(t) -> void:
	var p := PlayerController.new()
	p.cam_yaw = 0.0  # forward = -Z in Godot
	p.simulate_move(Vector2(0, 1), false, false, 0.016)  # W
	t.ok(p.velocity.z < -1.0, "W moves toward -Z: %s" % p.velocity)
	t.ok(absf(p.velocity.x) < 0.5, "no lateral drift")
	p.simulate_move(Vector2(1, 0), false, false, 0.016)  # D
	t.ok(p.velocity.x > 1.0, "D strafes +X: %s" % p.velocity)
	# sprint multiplies speed
	p.velocity = Vector3.ZERO
	p.simulate_move(Vector2(0, 1), false, false, 0.016)
	var walk := Vector2(p.velocity.x, p.velocity.z).length()
	p.simulate_move(Vector2(0, 1), true, false, 0.016)
	t.ok(Vector2(p.velocity.x, p.velocity.z).length() > walk * 1.3, "sprint faster")
	# ADS slows
	p.aiming = true
	p.simulate_move(Vector2(0, 1), false, false, 0.016)
	t.ok(Vector2(p.velocity.x, p.velocity.z).length() < walk, "ADS slower")
	# aiming forbids sprint
	p.simulate_move(Vector2(0, 1), true, false, 0.016)
	t.ok(Vector2(p.velocity.x, p.velocity.z).length() < walk, "no sprint while aiming")
	# gravity accumulates when airborne (not on floor in headless)
	var vy0 := p.velocity.y
	p.simulate_move(Vector2.ZERO, false, true, 0.016)  # jump ignored mid-air
	t.ok(p.velocity.y < vy0, "no double jump; gravity applies")
	p.free()
