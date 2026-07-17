class_name StormLogic extends RefCounted
# {wait, shrink, radius, dps} — verbatim from rust STORM_PHASES
const PHASES := [
	{"wait": 35.0, "shrink": 30.0, "radius": 190.0, "dps": 1.0},
	{"wait": 30.0, "shrink": 28.0, "radius": 130.0, "dps": 2.0},
	{"wait": 25.0, "shrink": 25.0, "radius": 80.0, "dps": 4.0},
	{"wait": 20.0, "shrink": 22.0, "radius": 42.0, "dps": 6.0},
	{"wait": 18.0, "shrink": 20.0, "radius": 14.0, "dps": 8.0},
	{"wait": 15.0, "shrink": 30.0, "radius": 2.0, "dps": 10.0},
]
var center := Vector2.ZERO
var radius := 240.0
var phase := 0
var timer: float = PHASES[0].wait
var shrinking := false
var dps: float = PHASES[0].dps
var target_center := Vector2.ZERO
var target_radius: float = PHASES[0].radius
var finished := false
var _rand := RandomNumberGenerator.new()

func _init() -> void:
	_pick_target()

func _pick_target() -> void:
	var p: Dictionary = PHASES[phase]
	var max_off: float = maxf(radius - p.radius, 0.0) * 0.6
	var a := _rand.randf() * TAU
	target_center = center + Vector2(cos(a), sin(a)) * _rand.randf() * max_off
	target_radius = p.radius

func update(dt: float) -> void:
	if finished: return
	timer -= dt
	var p: Dictionary = PHASES[phase]
	if not shrinking:
		if timer <= 0.0:
			shrinking = true
			timer = p.shrink
	else:
		var k := clampf(1.0 - timer / p.shrink, 0.0, 1.0)
		radius = lerpf(radius, target_radius, k)
		center = center.lerp(target_center, k)
		if timer <= 0.0:
			radius = target_radius
			center = target_center
			phase += 1
			if phase >= PHASES.size():
				finished = true
				return
			dps = PHASES[phase].dps
			shrinking = false
			timer = PHASES[phase].wait
			_pick_target()

func outside(pos: Vector3) -> bool:
	return Vector2(pos.x, pos.z).distance_to(center) > radius

## Seconds until the next state change (for the HUD timer).
func time_left() -> float:
	return maxf(timer, 0.0)
