class_name Inventory extends RefCounted
var slots: Array = [null, null, null, null, null]
var slot := 0

func _init() -> void:
	slots[0] = _mk(Weapons.Type.PICKAXE, 0)

static func _mk(type: int, rarity: int) -> Dictionary:
	var c := Weapons.cfg(type)
	return {"type": type, "rarity": rarity, "ammo": c.mag, "reserve": c.mag * 4,
		"reloading": false, "reload_end": 0.0}

func current() -> Dictionary: return slots[slot]

func switch(i: int) -> void:
	if i >= 0 and i < 5 and slots[i] != null:
		current().reloading = false
		slot = i

func add_weapon(type: int, rarity: int) -> void:
	for i in range(1, 5):
		if slots[i] == null:
			slots[i] = _mk(type, rarity)
			if slot == 0: slot = i
			return
	var i := 1 if slot == 0 else slot
	slots[i] = _mk(type, rarity)
	slot = i

func add_ammo(n: int) -> void:
	for s in slots:
		if s != null and not Weapons.cfg(s.type).melee:
			s.reserve += n
