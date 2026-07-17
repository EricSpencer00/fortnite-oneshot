class_name Aim extends RefCounted

## Crosshair-true firing: aim from the muzzle toward the point the camera
## ray actually hit (or a far point along the camera ray when nothing hit).
static func fire_direction(cam_origin: Vector3, cam_forward: Vector3,
		aim_hit: Variant, muzzle: Vector3, max_range: float) -> Vector3:
	var target: Vector3
	if aim_hit != null:
		target = aim_hit
	else:
		target = cam_origin + cam_forward * max_range
	return (target - muzzle).normalized()
