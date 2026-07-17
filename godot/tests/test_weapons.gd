static func run(t) -> void:
	var ar := Weapons.cfg(Weapons.Type.AR)
	t.eq(ar.damage, 30.0, "AR damage ported")
	t.eq(ar.mag, 30, "AR mag ported")
	t.ok(Weapons.damage(Weapons.Type.AR, 4) > Weapons.damage(Weapons.Type.AR, 0),
		"rarity scales damage")
	t.eq(Weapons.roll_rarity(0.0, 0.99), 4, "top roll = legendary")
	t.eq(Weapons.roll_rarity(0.0, 0.0), 0, "bottom roll = common")
	t.eq(Weapons.cfg(Weapons.Type.SHOTGUN).pellets, 9, "shotgun pellets")
	t.eq(Weapons.cfg(Weapons.Type.SNIPER).headshot, 2.0, "sniper headshot mult")
