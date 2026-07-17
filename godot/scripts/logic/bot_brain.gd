class_name BotBrain extends RefCounted
enum State {ROAM, ENGAGE, FLEE_STORM}
const ENGAGE_RANGE := 60.0
var health := 100.0
var shield := 0.0
var alive := true
var state := State.ROAM
var wander_target := Vector2.ZERO
var next_wander := 0.0
var accuracy := 0.3

func take_damage(amount: float) -> void:
	if not alive: return
	var absorbed := minf(shield, amount)
	shield -= absorbed
	health -= amount - absorbed
	if health <= 0.0:
		health = 0.0
		alive = false

func think(pos: Vector3, player_pos: Vector3, player_alive: bool,
		storm: StormLogic, t: float, rand: RandomNumberGenerator) -> Dictionary:
	var out := {"move_dir": Vector3.ZERO, "want_fire": false, "look_at": player_pos}
	if storm.outside(pos):
		state = State.FLEE_STORM
		var to_center := Vector3(storm.center.x - pos.x, 0, storm.center.y - pos.z)
		out.move_dir = to_center.normalized()
		return out
	var to_player := player_pos - pos
	if player_alive and to_player.length() < ENGAGE_RANGE:
		state = State.ENGAGE
		out.want_fire = true
		if to_player.length() > 25.0:
			out.move_dir = Vector3(to_player.x, 0, to_player.z).normalized()
		else:
			out.move_dir = Vector3(to_player.z, 0, -to_player.x).normalized() \
				* (1.0 if fposmod(t, 4.0) < 2.0 else -1.0)
		return out
	state = State.ROAM
	if t >= next_wander:
		next_wander = t + rand.randf_range(4.0, 9.0)
		wander_target = Vector2(pos.x, pos.z) \
			+ Vector2(rand.randf_range(-40, 40), rand.randf_range(-40, 40))
	var to_t := Vector3(wander_target.x - pos.x, 0, wander_target.y - pos.z)
	if to_t.length() > 2.0:
		out.move_dir = to_t.normalized()
	return out
