static func run(t) -> void:
	var land := 0
	for iz in range(-24, 24):
		for ix in range(-24, 24):
			var h := Terrain.height(ix * 10.0, iz * 10.0)
			t.ok(is_finite(h), "finite height at %d,%d" % [ix, iz])
			if h > 1.0: land += 1
	t.ok(land > 200, "island big enough: %d" % land)
	t.ok(Terrain.height(Terrain.HALF, Terrain.HALF) < 0.5, "edges underwater")
	t.ok(Terrain.height(0.0, 0.0) > 0.5, "center above water")
