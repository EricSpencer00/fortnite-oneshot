class_name Weapons extends RefCounted
enum Type {PICKAXE, AR, SHOTGUN, SMG, SNIPER, PISTOL}
const RARITY_MULT := [1.0, 1.1, 1.2, 1.32, 1.45]
const RARITY_NAMES := ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
const RARITY_COLORS := [Color8(157, 165, 173), Color8(76, 175, 80), Color8(47, 159, 224), Color8(164, 77, 224), Color8(232, 145, 47)]
# verbatim from rust wcfg()
const CFG := {
	Type.PICKAXE: {"name": "Pickaxe", "damage": 20.0, "fire_rate": 0.45, "mag": 0, "reload": 0.0, "spread": 0.0, "ads_spread": 0.0, "range": 3.5, "auto": true, "pellets": 1, "ads_zoom": 1.0, "scope": false, "melee": true, "headshot": 1.0},
	Type.AR: {"name": "Assault Rifle", "damage": 30.0, "fire_rate": 0.135, "mag": 30, "reload": 2.2, "spread": 0.025, "ads_spread": 0.007, "range": 250.0, "auto": true, "pellets": 1, "ads_zoom": 0.72, "scope": false, "melee": false, "headshot": 1.5},
	Type.SHOTGUN: {"name": "Pump Shotgun", "damage": 90.0, "fire_rate": 0.95, "mag": 5, "reload": 3.2, "spread": 0.09, "ads_spread": 0.06, "range": 32.0, "auto": false, "pellets": 9, "ads_zoom": 0.85, "scope": false, "melee": false, "headshot": 1.5},
	Type.SMG: {"name": "SMG", "damage": 17.0, "fire_rate": 0.065, "mag": 35, "reload": 1.9, "spread": 0.045, "ads_spread": 0.02, "range": 90.0, "auto": true, "pellets": 1, "ads_zoom": 0.8, "scope": false, "melee": false, "headshot": 1.5},
	Type.SNIPER: {"name": "Bolt Sniper", "damage": 105.0, "fire_rate": 1.7, "mag": 1, "reload": 2.8, "spread": 0.04, "ads_spread": 0.0, "range": 500.0, "auto": false, "pellets": 1, "ads_zoom": 0.28, "scope": true, "melee": false, "headshot": 2.0},
	Type.PISTOL: {"name": "Pistol", "damage": 26.0, "fire_rate": 0.28, "mag": 12, "reload": 1.6, "spread": 0.02, "ads_spread": 0.008, "range": 120.0, "auto": false, "pellets": 1, "ads_zoom": 0.8, "scope": false, "melee": false, "headshot": 1.5},
}

static func cfg(type: int) -> Dictionary: return CFG[type]
static func rarity_mult(r: int) -> float: return RARITY_MULT[r]
static func damage(type: int, r: int) -> float: return CFG[type].damage * RARITY_MULT[r]
static func roll_rarity(luck: float, rand01: float) -> int:
	var v := rand01 + luck
	if v > 0.97: return 4
	if v > 0.88: return 3
	if v > 0.70: return 2
	if v > 0.45: return 1
	return 0
