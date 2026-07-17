static func run(t) -> void:
	var s := StormLogic.new()
	var r0 := s.radius
	for i in 60 * 60 * 10:
		s.update(1.0 / 60.0)
	t.ok(s.finished, "storm finishes all phases")
	t.ok(s.radius < 3.0, "final radius small: %f" % s.radius)
	t.ok(s.radius < r0, "storm shrank")
	t.ok(s.outside(Vector3(1000, 0, 1000)), "far point is outside")
	t.ok(is_finite(s.center.x) and is_finite(s.center.y), "center finite")
