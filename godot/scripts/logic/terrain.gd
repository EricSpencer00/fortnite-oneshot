class_name Terrain extends RefCounted
const WORLD_SIZE := 480.0
const HALF := WORLD_SIZE / 2.0

# 32-bit wrapping arithmetic emulating rust hash2 (i32 wrapping mul/add).
static func _hash2(ix: int, iz: int) -> float:
	var h := (ix * 374761393 + iz * 668265263 + 1442695040) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	h ^= h >> 16
	return float(h) / 4294967295.0

static func _sstep(x: float) -> float: return x * x * (3.0 - 2.0 * x)

static func _vnoise(x: float, z: float) -> float:
	var ix := int(floor(x))
	var iz := int(floor(z))
	var fx := _sstep(x - floor(x))
	var fz := _sstep(z - floor(z))
	var a := _hash2(ix, iz)
	var b := _hash2(ix + 1, iz)
	var c := _hash2(ix, iz + 1)
	var d := _hash2(ix + 1, iz + 1)
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fz)

static func _fbm(x: float, z: float) -> float:
	var amp := 1.0
	var freq := 1.0
	var sum := 0.0
	var norm := 0.0
	for i in 4:
		sum += amp * _vnoise(x * freq, z * freq)
		norm += amp
		amp *= 0.5
		freq *= 2.0
	return sum / norm

static func height(x: float, z: float) -> float:
	var d := sqrt(x * x + z * z) / HALF
	var falloff := clampf(1.0 - pow(d, 3.2), 0.0, 1.0)
	var n := _fbm(x * 0.008 + 50.0, z * 0.008 + 50.0)
	return (2.5 + pow(n, 1.4) * 26.0) * falloff - 1.5
