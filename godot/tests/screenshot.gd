# Self-screenshot: loads main scene, captures menu + in-match frames, quits.
# Run WINDOWED (not --headless): godot --path . -s tests/screenshot.gd
extends SceneTree

func _init() -> void:
	_go()

func _go() -> void:
	await process_frame
	var scene: Node = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	for i in 8: await process_frame
	_shot("/tmp/shot_menu.png")
	# start a match programmatically
	scene._start()
	for i in 5: await process_frame
	# teleport past skydive for the in-world shot
	var p: Node3D = get_nodes_in_group("player")[0]
	p.global_position = Vector3(0, Terrain.height(0, 0) + 2.0, 0)
	GameFlow.begin_playing()
	for i in 30: await process_frame
	_shot("/tmp/shot_play.png")
	quit(0)

func _shot(path: String) -> void:
	var img := root.get_viewport().get_texture().get_image()
	img.save_png(path)
	print("saved ", path)
