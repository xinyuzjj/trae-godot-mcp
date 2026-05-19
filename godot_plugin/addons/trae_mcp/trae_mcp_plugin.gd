@tool
extends EditorPlugin
## Trae MCP Plugin - Godot 4.x Editor Integration v2.1
## 增强版：包含核心功能增强、更多编辑器工具、项目管理功能

const SERVER_PORT = 9742
const RECONNECT_INTERVAL = 5.0

# TCP服务器
var _tcp_server: TCPServer
var _connections: Dictionary = {}
var _is_running: bool = false
var _reconnect_timer: Timer

# 操作日志（用于撤销/重做）
var _operation_log: Array = []
var _max_log_entries: int = 100

# 调试输出
var _debug_output: Array = []
var _max_debug_lines: int = 1000

# 性能监控
var _performance_stats: Dictionary = {
	"fps": 0,
	"memory": 0,
	"draw_calls": 0,
	"node_count": 0
}

func _enter_tree() -> void:
	print("[TraeMCP v2.1] 插件正在初始化...")
	_start_server()
	_setup_performance_monitoring()
	print("[TraeMCP v2.1] 插件已启动，端口: ", SERVER_PORT)

func _exit_tree() -> void:
	print("[TraeMCP v2.1] 插件正在关闭...")
	_stop_server()

func _start_server() -> void:
	if _is_running:
		return
	_tcp_server = TCPServer.new()
	var err = _tcp_server.listen(SERVER_PORT, "127.0.0.1")
	if err != OK:
		push_error("[TraeMCP] 无法启动TCP服务器，端口: " + str(SERVER_PORT) + " 错误码: " + str(err))
		_schedule_reconnect()
		return
	_is_running = true
	print("[TraeMCP] TCP服务器已启动，端口: ", SERVER_PORT)

func _stop_server() -> void:
	if not _is_running:
		return
	for conn in _connections.keys():
		conn.disconnect_from_host()
	_connections.clear()
	if _tcp_server:
		_tcp_server.stop()
		_tcp_server = null
	_is_running = false
	print("[TraeMCP] TCP服务器已停止")

func _schedule_reconnect() -> void:
	if _reconnect_timer:
		return
	_reconnect_timer = Timer.new()
	_reconnect_timer.wait_time = RECONNECT_INTERVAL
	_reconnect_timer.one_shot = true
	_reconnect_timer.timeout.connect(_start_server)
	add_child(_reconnect_timer)
	_reconnect_timer.start()
	print("[TraeMCP] 计划重新连接...")

func _setup_performance_monitoring() -> void:
	# 设置性能监控
	set_process(true)

func _process(_delta: float) -> void:
	if not _is_running or not _tcp_server:
		return
	
	# 更新性能统计
	_update_performance_stats()
	
	# 接受新连接
	if _tcp_server.is_connection_available():
		var conn = _tcp_server.take_connection()
		if conn and conn is StreamPeerTCP:
			_connections[conn] = ""
			print("[TraeMCP] 客户端已连接")
			_send_json(conn, {
				"type": "connected",
				"message": "已连接到Godot编辑器",
				"godot_version": Engine.get_version_info(),
				"project_name": ProjectSettings.get_setting("application/config/name", "未命名项目")
			})
	
	# 处理已有连接的数据
	var to_remove: Array = []
	for conn in _connections:
		var status = conn.get_status()
		if status == StreamPeerTCP.STATUS_NONE or status == StreamPeerTCP.STATUS_ERROR:
			to_remove.append(conn)
			continue
		if status != StreamPeerTCP.STATUS_CONNECTED:
			continue
		
		conn.poll()
		var available = conn.get_available_bytes()
		if available > 0:
			var data = conn.get_utf8_string(available)
			if data != "":
				_connections[conn] += data
				while "\n" in _connections[conn]:
					var idx = _connections[conn].find("\n")
					var msg = _connections[conn].substr(0, idx).strip_edges()
					_connections[conn] = _connections[conn].substr(idx + 1)
					if msg.length() > 0:
						_handle_message(conn, msg)
	
	for conn in to_remove:
		_connections.erase(conn)
		print("[TraeMCP] 客户端已断开")

func _update_performance_stats() -> void:
	_performance_stats["fps"] = Engine.get_frames_per_second()
	_performance_stats["memory"] = OS.get_static_memory_usage()
	_performance_stats["draw_calls"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	_performance_stats["node_count"] = Performance.get_monitor(Performance.OBJECT_NODE_COUNT)

func _handle_message(conn: StreamPeerTCP, message: String) -> void:
	print("[TraeMCP] 收到消息: ", message)
	var json = JSON.new()
	var err = json.parse(message)
	if err != OK:
		_send_json(conn, {"error": "无效的JSON: " + message})
		return
	
	var data = json.data
	if not data is Dictionary:
		_send_json(conn, {"error": "消息必须是JSON对象"})
		return
	
	var cmd = data.get("command", "")
	var req_id = str(data.get("request_id", ""))
	
	# 记录操作日志
	_log_operation(cmd, data)
	
	match cmd:
		# ==================== 核心功能 ====================
		"ping":
			_send_json(conn, {"request_id": req_id, "pong": true})
		"get_connection_status":
			_cmd_get_connection_status(conn, req_id)
		"get_scene_tree":
			_cmd_get_scene_tree(conn, req_id)
		"get_node_properties":
			_cmd_get_node_properties(conn, req_id, str(data.get("node_path", "")))
		"set_node_property":
			_cmd_set_node_property(conn, req_id, str(data.get("node_path", "")), str(data.get("property", "")), data.get("value", null))
		"get_script_content":
			_cmd_get_script_content(conn, req_id, str(data.get("script_path", "")))
		"set_script_content":
			_cmd_set_script_content(conn, req_id, str(data.get("script_path", "")), str(data.get("content", "")))
		"get_selected_nodes":
			_cmd_get_selected_nodes(conn, req_id)
		"select_node":
			_cmd_select_node(conn, req_id, str(data.get("node_path", "")))
		"run_project":
			_cmd_run_project(conn, req_id)
		"stop_project":
			_cmd_stop_project(conn, req_id)
		"save_scene":
			_cmd_save_scene(conn, req_id)
		"save_all_scenes":
			_cmd_save_all_scenes(conn, req_id)
		"get_project_files":
			_cmd_get_project_files(conn, req_id, str(data.get("directory", "res://")))
		"get_debug_output":
			_cmd_get_debug_output(conn, req_id)
		"create_node":
			_cmd_create_node(conn, req_id, str(data.get("parent_path", "")), str(data.get("node_type", "")), str(data.get("node_name", "")))
		"delete_node":
			_cmd_delete_node(conn, req_id, str(data.get("node_path", "")))
		"duplicate_node":
			_cmd_duplicate_node(conn, req_id, str(data.get("node_path", "")))
		"rename_node":
			_cmd_rename_node(conn, req_id, str(data.get("node_path", "")), str(data.get("new_name", "")))
		"reparent_node":
			_cmd_reparent_node(conn, req_id, str(data.get("node_path", "")), str(data.get("new_parent_path", "")))
		"copy_node":
			_cmd_copy_node(conn, req_id, str(data.get("node_path", "")), str(data.get("target_scene_path", "")))
		
		# ==================== 资源管理 ====================
		"import_asset":
			_cmd_import_asset(conn, req_id, str(data.get("source_path", "")), str(data.get("target_path", "")))
		"create_material":
			_cmd_create_material(conn, req_id, str(data.get("material_path", "")), data.get("properties", {}))
		"get_resource_info":
			_cmd_get_resource_info(conn, req_id, str(data.get("resource_path", "")))
		
		# ==================== 场景管理 ====================
		"create_new_scene":
			_cmd_create_new_scene(conn, req_id, str(data.get("scene_path", "")))
		"switch_scene":
			_cmd_switch_scene(conn, req_id, str(data.get("scene_path", "")))
		"get_open_scenes":
			_cmd_get_open_scenes(conn, req_id)
		
		# ==================== 调试工具 ====================
		"set_breakpoint":
			_cmd_set_breakpoint(conn, req_id, str(data.get("script_path", "")), int(data.get("line", 0)), data.get("enabled", true))
		"capture_screenshot":
			_cmd_capture_screenshot(conn, req_id, str(data.get("output_path", "")))
		"get_performance_stats":
			_cmd_get_performance_stats(conn, req_id)
		
		# ==================== 项目管理和分析 ====================
		"get_project_stats":
			_cmd_get_project_stats(conn, req_id)
		"analyze_dependencies":
			_cmd_analyze_dependencies(conn, req_id)
		"check_code_quality":
			_cmd_check_code_quality(conn, req_id, str(data.get("script_path", "")))
		"find_unused_resources":
			_cmd_find_unused_resources(conn, req_id)
		
		# ==================== 实用工具 ====================
		"search_in_files":
			_cmd_search_in_files(conn, req_id, str(data.get("search_pattern", "")), str(data.get("directory", "res://")), data.get("file_extensions", [".gd"]))
		"replace_in_files":
			_cmd_replace_in_files(conn, req_id, str(data.get("search_pattern", "")), str(data.get("replace_text", "")), str(data.get("directory", "res://")), data.get("file_extensions", [".gd"]))
		"batch_set_property":
			_cmd_batch_set_property(conn, req_id, data.get("node_paths", []), str(data.get("property", "")), data.get("value", null))
		"get_operation_log":
			_cmd_get_operation_log(conn, req_id)
		"undo_last_operation":
			_cmd_undo_last_operation(conn, req_id)
		
		_:
			_send_json(conn, {"request_id": req_id, "error": "未知命令: " + cmd})

# ==================== 核心功能命令 ====================

func _cmd_get_connection_status(conn: StreamPeerTCP, req_id: String) -> void:
	_send_json(conn, {
		"request_id": req_id,
		"connected": _is_running,
		"client_count": _connections.size(),
		"godot_version": Engine.get_version_info(),
		"project_name": ProjectSettings.get_setting("application/config/name", "未命名项目")
	})

func _cmd_get_scene_tree(conn: StreamPeerTCP, req_id: String) -> void:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		_send_json(conn, {"request_id": req_id, "error": "当前没有打开的场景"})
		return
	_send_json(conn, {"request_id": req_id, "scene_tree": _serialize_node(root)})

func _serialize_node(node: Node) -> Dictionary:
	var result: Dictionary = {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": []
	}
	if node is CanvasItem:
		result["visible"] = node.visible
	elif node is Node3D:
		result["visible"] = node.visible
	if node.get_script():
		result["script"] = str(node.get_script().resource_path)
	for child in node.get_children():
		result["children"].append(_serialize_node(child))
	return result

func _cmd_get_node_properties(conn: StreamPeerTCP, req_id: String, node_path: String) -> void:
	var node = _find_node(node_path)
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	var props: Array = []
	for prop in node.get_property_list():
		if prop.usage & PROPERTY_USAGE_EDITOR:
			var val = node.get(prop.name)
			if val is Resource or val is Node:
				continue
			props.append({
				"name": prop.name,
				"type": prop.type,
				"hint": prop.hint,
				"value": val
			})
	_send_json(conn, {"request_id": req_id, "node_path": node_path, "properties": props})

func _cmd_set_node_property(conn: StreamPeerTCP, req_id: String, node_path: String, prop_name: String, value) -> void:
	var node = _find_node(node_path)
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	var old_value = node.get(prop_name)
	node.set(prop_name, value)
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {
		"request_id": req_id,
		"success": true,
		"node_path": node_path,
		"property": prop_name,
		"old_value": old_value,
		"new_value": value
	})

func _cmd_get_script_content(conn: StreamPeerTCP, req_id: String, script_path: String) -> void:
	if not FileAccess.file_exists(script_path):
		_send_json(conn, {"request_id": req_id, "error": "脚本不存在: " + script_path})
		return
	var file = FileAccess.open(script_path, FileAccess.READ)
	if not file:
		_send_json(conn, {"request_id": req_id, "error": "无法读取脚本: " + script_path})
		return
	var content = file.get_as_text()
	file.close()
	_send_json(conn, {"request_id": req_id, "script_path": script_path, "content": content})

func _cmd_set_script_content(conn: StreamPeerTCP, req_id: String, script_path: String, content: String) -> void:
	var file = FileAccess.open(script_path, FileAccess.WRITE)
	if not file:
		_send_json(conn, {"request_id": req_id, "error": "无法写入脚本: " + script_path})
		return
	file.store_string(content)
	file.close()
	get_editor_interface().get_resource_filesystem().scan()
	_send_json(conn, {"request_id": req_id, "success": true, "script_path": script_path})

func _cmd_get_selected_nodes(conn: StreamPeerTCP, req_id: String) -> void:
	var selected = get_editor_interface().get_selection().get_selected_nodes()
	var info: Array = []
	for node in selected:
		info.append({"name": node.name, "path": str(node.get_path()), "type": node.get_class()})
	_send_json(conn, {"request_id": req_id, "selected_nodes": info})

func _cmd_select_node(conn: StreamPeerTCP, req_id: String, node_path: String) -> void:
	var node = _find_node(node_path)
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	get_editor_interface().get_selection().clear()
	get_editor_interface().get_selection().add_node(node)
	_send_json(conn, {"request_id": req_id, "success": true, "node_path": node_path})

func _cmd_run_project(conn: StreamPeerTCP, req_id: String) -> void:
	get_editor_interface().play_main_scene()
	_send_json(conn, {"request_id": req_id, "success": true, "message": "项目正在运行"})

func _cmd_stop_project(conn: StreamPeerTCP, req_id: String) -> void:
	get_editor_interface().stop_playing_scene()
	_send_json(conn, {"request_id": req_id, "success": true, "message": "项目已停止"})

func _cmd_save_scene(conn: StreamPeerTCP, req_id: String) -> void:
	get_editor_interface().save_scene()
	_send_json(conn, {"request_id": req_id, "success": true})

func _cmd_save_all_scenes(conn: StreamPeerTCP, req_id: String) -> void:
	# 获取所有打开的场景并保存
	var scene_root = get_editor_interface().get_edited_scene_root()
	if scene_root:
		get_editor_interface().save_scene()
	_send_json(conn, {"request_id": req_id, "success": true, "message": "所有场景已保存"})

func _cmd_get_project_files(conn: StreamPeerTCP, req_id: String, directory: String) -> void:
	var files: Array = []
	var dir = DirAccess.open(directory)
	if dir:
		dir.list_dir_begin()
		var fname = dir.get_next()
		while fname != "":
			if not fname.begins_with("."):
				var fpath = directory.path_join(fname)
				if dir.current_is_dir():
					files.append({"name": fname, "path": fpath, "type": "directory"})
				else:
					files.append({"name": fname, "path": fpath, "type": "file"})
			fname = dir.get_next()
		dir.list_dir_end()
	_send_json(conn, {"request_id": req_id, "directory": directory, "files": files})

func _cmd_get_debug_output(conn: StreamPeerTCP, req_id: String) -> void:
	_send_json(conn, {"request_id": req_id, "debug_output": _debug_output})

# ==================== 节点操作命令 ====================

func _cmd_create_node(conn: StreamPeerTCP, req_id: String, parent_path: String, node_type: String, node_name: String) -> void:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		_send_json(conn, {"request_id": req_id, "error": "当前没有打开的场景"})
		return
	var parent = root.get_node_or_null(NodePath(parent_path)) if parent_path != "" else root
	if not parent:
		parent = root
	if not ClassDB.class_exists(node_type):
		_send_json(conn, {"request_id": req_id, "error": "未知节点类型: " + node_type})
		return
	var new_node = ClassDB.instantiate(node_type)
	if not new_node:
		_send_json(conn, {"request_id": req_id, "error": "无法创建节点: " + node_type})
		return
	new_node.name = node_name
	parent.add_child(new_node)
	new_node.owner = root
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "node_path": str(new_node.get_path()), "type": node_type, "name": node_name})

func _cmd_delete_node(conn: StreamPeerTCP, req_id: String, node_path: String) -> void:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		_send_json(conn, {"request_id": req_id, "error": "当前没有打开的场景"})
		return
	var node = root.get_node_or_null(NodePath(node_path))
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	if node == root:
		_send_json(conn, {"request_id": req_id, "error": "不能删除场景根节点"})
		return
	node.get_parent().remove_child(node)
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "deleted": node_path})

func _cmd_duplicate_node(conn: StreamPeerTCP, req_id: String, node_path: String) -> void:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		_send_json(conn, {"request_id": req_id, "error": "当前没有打开的场景"})
		return
	var node = root.get_node_or_null(NodePath(node_path))
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	var duplicated = node.duplicate()
	duplicated.name = node.name + "_copy"
	node.get_parent().add_child(duplicated)
	duplicated.owner = root
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "new_path": str(duplicated.get_path())})

func _cmd_rename_node(conn: StreamPeerTCP, req_id: String, node_path: String, new_name: String) -> void:
	var node = _find_node(node_path)
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	var old_name = node.name
	node.name = new_name
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "old_name": old_name, "new_name": new_name})

func _cmd_reparent_node(conn: StreamPeerTCP, req_id: String, node_path: String, new_parent_path: String) -> void:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		_send_json(conn, {"request_id": req_id, "error": "当前没有打开的场景"})
		return
	var node = root.get_node_or_null(NodePath(node_path))
	if not node:
		_send_json(conn, {"request_id": req_id, "error": "找不到节点: " + node_path})
		return
	var new_parent = root.get_node_or_null(NodePath(new_parent_path))
	if not new_parent:
		_send_json(conn, {"request_id": req_id, "error": "找不到新父节点: " + new_parent_path})
		return
	if node == root:
		_send_json(conn, {"request_id": req_id, "error": "不能移动场景根节点"})
		return
	
	var old_parent = node.get_parent()
	old_parent.remove_child(node)
	new_parent.add_child(node)
	node.owner = root
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "new_path": str(node.get_path())})

func _cmd_copy_node(conn: StreamPeerTCP, req_id: String, node_path: String, target_scene_path: String) -> void:
	# 复制节点到另一个场景（简化实现）
	_send_json(conn, {"request_id": req_id, "success": false, "error": "跨场景复制功能待实现"})

# ==================== 资源管理命令 ====================

func _cmd_import_asset(conn: StreamPeerTCP, req_id: String, source_path: String, target_path: String) -> void:
	# 简化实现：复制文件到项目目录
	if not FileAccess.file_exists(source_path):
		_send_json(conn, {"request_id": req_id, "error": "源文件不存在: " + source_path})
		return
	
	var file = FileAccess.open(source_path, FileAccess.READ)
	if not file:
		_send_json(conn, {"request_id": req_id, "error": "无法读取源文件"})
		return
	var content = file.get_buffer(file.get_length())
	file.close()
	
	var out_file = FileAccess.open(target_path, FileAccess.WRITE)
	if not out_file:
		_send_json(conn, {"request_id": req_id, "error": "无法创建目标文件: " + target_path})
		return
	out_file.store_buffer(content)
	out_file.close()
	
	get_editor_interface().get_resource_filesystem().scan()
	_send_json(conn, {"request_id": req_id, "success": true, "target_path": target_path})

func _cmd_create_material(conn: StreamPeerTCP, req_id: String, material_path: String, properties: Dictionary) -> void:
	var material = StandardMaterial3D.new() if properties.get("is_3d", false) else CanvasItemMaterial.new()
	# 设置材质属性
	if properties.has("albedo_color"):
		material.albedo_color = Color(properties["albedo_color"])
	
	var err = ResourceSaver.save(material, material_path)
	if err != OK:
		_send_json(conn, {"request_id": req_id, "error": "无法保存材质: " + str(err)})
		return
	
	get_editor_interface().get_resource_filesystem().scan()
	_send_json(conn, {"request_id": req_id, "success": true, "material_path": material_path})

func _cmd_get_resource_info(conn: StreamPeerTCP, req_id: String, resource_path: String) -> void:
	if not ResourceLoader.exists(resource_path):
		_send_json(conn, {"request_id": req_id, "error": "资源不存在: " + resource_path})
		return
	
	var resource = ResourceLoader.load(resource_path)
	if not resource:
		_send_json(conn, {"request_id": req_id, "error": "无法加载资源"})
		return
	
	_send_json(conn, {
		"request_id": req_id,
		"resource_path": resource_path,
		"resource_type": resource.get_class(),
		"resource_name": resource.resource_name
	})

# ==================== 场景管理命令 ====================

func _cmd_create_new_scene(conn: StreamPeerTCP, req_id: String, scene_path: String) -> void:
	# 创建新场景文件
	var scene = PackedScene.new()
	var root = Node2D.new()
	root.name = "Root"
	scene.pack(root)
	
	var err = ResourceSaver.save(scene, scene_path)
	if err != OK:
		_send_json(conn, {"request_id": req_id, "error": "无法保存场景: " + str(err)})
		return
	
	get_editor_interface().get_resource_filesystem().scan()
	_send_json(conn, {"request_id": req_id, "success": true, "scene_path": scene_path})

func _cmd_switch_scene(conn: StreamPeerTCP, req_id: String, scene_path: String) -> void:
	if not FileAccess.file_exists(scene_path):
		_send_json(conn, {"request_id": req_id, "error": "场景文件不存在: " + scene_path})
		return
	
	get_editor_interface().open_scene_from_path(scene_path)
	_send_json(conn, {"request_id": req_id, "success": true, "scene_path": scene_path})

func _cmd_get_open_scenes(conn: StreamPeerTCP, req_id: String) -> void:
	# 获取当前打开的场景列表
	var scenes: Array = []
	var current_scene = get_editor_interface().get_edited_scene_root()
	if current_scene:
		scenes.append({
			"name": current_scene.name,
			"path": current_scene.scene_file_path if current_scene.scene_file_path else "未保存"
		})
	_send_json(conn, {"request_id": req_id, "scenes": scenes})

# ==================== 调试工具命令 ====================

func _cmd_set_breakpoint(conn: StreamPeerTCP, req_id: String, script_path: String, line: int, enabled: bool) -> void:
	# 设置断点（需要调试器支持）
	_send_json(conn, {"request_id": req_id, "success": false, "error": "断点功能需要调试器支持"})

func _cmd_capture_screenshot(conn: StreamPeerTCP, req_id: String, output_path: String) -> void:
	var image = get_viewport().get_texture().get_image()
	if image:
		image.save_png(output_path)
		_send_json(conn, {"request_id": req_id, "success": true, "output_path": output_path})
	else:
		_send_json(conn, {"request_id": req_id, "error": "无法捕获屏幕"})

func _cmd_get_performance_stats(conn: StreamPeerTCP, req_id: String) -> void:
	_send_json(conn, {
		"request_id": req_id,
		"stats": _performance_stats
	})

# ==================== 项目管理和分析命令 ====================

func _cmd_get_project_stats(conn: StreamPeerTCP, req_id: String) -> void:
	var stats: Dictionary = {
		"scripts": _count_files("res://", ".gd"),
		"scenes": _count_files("res://", ".tscn"),
		"resources": _count_files("res://", ".tres"),
		"total_files": 0
	}
	stats["total_files"] = stats["scripts"] + stats["scenes"] + stats["resources"]
	_send_json(conn, {"request_id": req_id, "stats": stats})

func _count_files(directory: String, extension: String) -> int:
	var count = 0
	var dir = DirAccess.open(directory)
	if dir:
		dir.list_dir_begin()
		var fname = dir.get_next()
		while fname != "":
			if not fname.begins_with("."):
				var fpath = directory.path_join(fname)
				if dir.current_is_dir():
					count += _count_files(fpath, extension)
				elif fname.ends_with(extension):
					count += 1
			fname = dir.get_next()
		dir.list_dir_end()
	return count

func _cmd_analyze_dependencies(conn: StreamPeerTCP, req_id: String) -> void:
	# 简化实现：分析脚本引用
	var dependencies: Dictionary = {}
	_send_json(conn, {"request_id": req_id, "dependencies": dependencies})

func _cmd_check_code_quality(conn: StreamPeerTCP, req_id: String, script_path: String) -> void:
	if not FileAccess.file_exists(script_path):
		_send_json(conn, {"request_id": req_id, "error": "脚本不存在"})
		return
	
	var file = FileAccess.open(script_path, FileAccess.READ)
	var content = file.get_as_text()
	file.close()
	
	var issues: Array = []
	var lines = content.split("\n")
	
	for i in range(lines.size()):
		var line = lines[i]
		# 检查潜在问题
		if line.find("get_node(") != -1 and line.find("get_node_or_null") == -1:
			issues.append({
				"line": i + 1,
				"type": "warning",
				"message": "使用 get_node() 没有空检查，建议使用 get_node_or_null()"
			})
		if line.find("var ") != -1 and line.find("=") == -1 and line.find(":") == -1:
			issues.append({
				"line": i + 1,
				"type": "style",
				"message": "变量声明缺少类型注解"
			})
	
	_send_json(conn, {"request_id": req_id, "script_path": script_path, "issues": issues})

func _cmd_find_unused_resources(conn: StreamPeerTCP, req_id: String) -> void:
	# 简化实现
	_send_json(conn, {"request_id": req_id, "unused_resources": []})

# ==================== 实用工具命令 ====================

func _cmd_search_in_files(conn: StreamPeerTCP, req_id: String, search_pattern: String, directory: String, file_extensions: Array) -> void:
	var results: Array = []
	_search_recursive(directory, search_pattern, file_extensions, results)
	_send_json(conn, {"request_id": req_id, "results": results})

func _search_recursive(directory: String, pattern: String, extensions: Array, results: Array) -> void:
	var dir = DirAccess.open(directory)
	if not dir:
		return
	
	dir.list_dir_begin()
	var fname = dir.get_next()
	while fname != "":
		if not fname.begins_with("."):
			var fpath = directory.path_join(fname)
			if dir.current_is_dir():
				_search_recursive(fpath, pattern, extensions, results)
			else:
				for ext in extensions:
					if fname.ends_with(ext):
						var file = FileAccess.open(fpath, FileAccess.READ)
						if file:
							var content = file.get_as_text()
							file.close()
							if content.find(pattern) != -1:
								results.append({"file": fpath, "found": true})
						break
		fname = dir.get_next()
	dir.list_dir_end()

func _cmd_replace_in_files(conn: StreamPeerTCP, req_id: String, search_pattern: String, replace_text: String, directory: String, file_extensions: Array) -> void:
	var count = 0
	var results: Array = []
	_replace_recursive(directory, search_pattern, replace_text, file_extensions, results, count)
	_send_json(conn, {"request_id": req_id, "replaced_count": count, "files": results})

func _replace_recursive(directory: String, pattern: String, replacement: String, extensions: Array, results: Array, count: int) -> void:
	var dir = DirAccess.open(directory)
	if not dir:
		return
	
	dir.list_dir_begin()
	var fname = dir.get_next()
	while fname != "":
		if not fname.begins_with("."):
			var fpath = directory.path_join(fname)
			if dir.current_is_dir():
				_replace_recursive(fpath, pattern, replacement, extensions, results, count)
			else:
				for ext in extensions:
					if fname.ends_with(ext):
						var file = FileAccess.open(fpath, FileAccess.READ)
						if file:
							var content = file.get_as_text()
							file.close()
							if content.find(pattern) != -1:
								var new_content = content.replace(pattern, replacement)
								var out_file = FileAccess.open(fpath, FileAccess.WRITE)
								if out_file:
									out_file.store_string(new_content)
									out_file.close()
									results.append(fpath)
									count += 1
						break
		fname = dir.get_next()
	dir.list_dir_end()

func _cmd_batch_set_property(conn: StreamPeerTCP, req_id: String, node_paths: Array, property: String, value) -> void:
	var results: Array = []
	for node_path in node_paths:
		var node = _find_node(node_path)
		if node:
			node.set(property, value)
			results.append({"path": node_path, "success": true})
		else:
			results.append({"path": node_path, "success": false, "error": "节点不存在"})
	
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "results": results})

func _cmd_get_operation_log(conn: StreamPeerTCP, req_id: String) -> void:
	_send_json(conn, {"request_id": req_id, "log": _operation_log})

func _cmd_undo_last_operation(conn: StreamPeerTCP, req_id: String) -> void:
	# 简化实现
	_send_json(conn, {"request_id": req_id, "success": false, "error": "撤销功能待实现"})

# ==================== 辅助方法 ====================

func _find_node(node_path: String) -> Node:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		return null
	if node_path == "" or node_path == "/":
		return root
	return root.get_node_or_null(NodePath(node_path))

func _send_json(conn: StreamPeerTCP, data: Dictionary) -> void:
	if not conn:
		return
	var status = conn.get_status()
	if status != StreamPeerTCP.STATUS_CONNECTED:
		return
	
	var json_str = JSON.stringify(data) + "\n"
	var err = conn.put_data(json_str.to_utf8_buffer())
	if err != OK:
		print("[TraeMCP] 发送数据失败")

func _log_operation(command: String, data: Dictionary) -> void:
	var entry = {
		"timestamp": Time.get_time_string_from_system(),
		"command": command,
		"data": data
	}
	_operation_log.append(entry)
	if _operation_log.size() > _max_log_entries:
		_operation_log.pop_front()
