static func run(t) -> void:
	# camera behind-right of player; crosshair looks at a point straight ahead
	var cam_o := Vector3(0.9, 2.0, 3.8)
	var fwd := Vector3(0, 0, -1)
	var hit := Vector3(0, 2.0, -50.0)
	var muzzle := Vector3(0.3, 1.4, -0.5)
	var d := Aim.fire_direction(cam_o, fwd, hit, muzzle, 250.0)
	var reach := muzzle + d * (hit - muzzle).length()
	t.ok(reach.distance_to(hit) < 0.01, "bullet converges on crosshair point")
	# no hit: converge at far point along camera ray, not parallel offset
	var d2 := Aim.fire_direction(cam_o, fwd, null, muzzle, 250.0)
	var far := cam_o + fwd * 250.0
	t.ok((muzzle + d2 * (far - muzzle).length()).distance_to(far) < 0.5,
		"fallback converges at range")
