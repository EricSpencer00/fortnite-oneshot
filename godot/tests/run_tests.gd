# Headless test runner: godot --headless -s tests/run_tests.gd
extends SceneTree

class T:
	var failures: Array[String] = []
	var count := 0
	func ok(cond: bool, msg: String) -> void:
		count += 1
		if not cond: failures.append(msg)
	func eq(a, b, msg: String) -> void:
		var same: bool = a == b
		if a is float and b is float:
			same = absf(a - b) < 1e-4
		ok(same, "%s (got %s, want %s)" % [msg, a, b])

func _init() -> void:
	var t := T.new()
	var dir := DirAccess.open("res://tests")
	dir.list_dir_begin()
	var f := dir.get_next()
	var names: Array[String] = []
	while f != "":
		if f.begins_with("test_") and f.ends_with(".gd"):
			names.append(f)
		f = dir.get_next()
	names.sort()
	var load_errors: Array[String] = []
	for n in names:
		print("== ", n)
		var script: Script = load("res://tests/" + n)
		if script == null:
			load_errors.append("%s: failed to load (compile/parse error — check SCRIPT ERROR output above)" % n)
			continue
		if not script.has_method("run"):
			load_errors.append("%s: does not define static func run(t)" % n)
			continue
		var count_before := t.count
		script.run(t)
		if t.count == count_before:
			load_errors.append("%s: run(t) added 0 assertions — it likely failed to execute (a referenced class may have failed to compile; check SCRIPT ERROR output above)" % n)
	if not load_errors.is_empty():
		for m in load_errors: printerr("LOAD FAIL: " + m)
		printerr("FAIL: %d test file(s) failed to load or run — see LOAD FAIL lines above" % load_errors.size())
		quit(1)
		return
	if t.failures.is_empty():
		print("OK: %d assertions" % t.count)
		quit(0)
	else:
		for m in t.failures: printerr("FAIL: " + m)
		quit(1)
