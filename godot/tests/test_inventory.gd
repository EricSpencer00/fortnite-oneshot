static func run(t) -> void:
	var inv := Inventory.new()
	t.eq(inv.slot, 0, "starts on pickaxe")
	inv.add_weapon(Weapons.Type.AR, 0)
	t.eq(inv.slot, 1, "auto-equip first pickup")
	for i in 3: inv.add_weapon(Weapons.Type.SMG, 0)
	for s in inv.slots: t.ok(s != null, "all slots filled")
	inv.add_weapon(Weapons.Type.SNIPER, 3)
	t.eq(inv.current().type, Weapons.Type.SNIPER, "pickup replaces current slot")
	inv.switch(0)
	t.eq(inv.current().type, Weapons.Type.PICKAXE, "switch back to pickaxe")
	inv.switch(4)  # occupied
	t.eq(inv.slot, 4, "switch to occupied slot works")
