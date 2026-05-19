@tool
extends EditorPlugin
## Trae MCP Plugin - Godot 4.x Editor Integration
## 通过TCP服务器与Trae AI助手实时通信

const SERVER_PORT = 9742

# TCP服务器
var _tcp_server: TCPServer
var _connections: Dictionary = {}  # {StreamPeerTCP: buffer_string}
var _is_running: bool = false

# 调试输出
var _debug_output: Array = []
var _max_debug_lines: int = 1000

func _enter_tree() -> void:
	print("[TraeMCP] 插件正在初始化...")
	_start_server()
	print("[TraeMCP] 插件已启动，端口: ", SERVER_PORT)

func _exit_tree() -> void:
	print("[TraeMCP] 插件正在关闭...")
	_stop_server()

func _start_server() -> void:
	if _is_running:
		return
	_tcp_server = TCPServer.new()
	var err = _tcp_server.listen(SERVER_PORT, "127.0.0.1")
	if err != OK:
		push_error("[TraeMCP] 无法启动TCP服务器，端口: " + str(SERVER_PORT) + " 错误码: " + str(err))
		return
	_is_running = true
	print("[TraeMCP] TCP服务器已启动，端口: ", SERVER_PORT)

func _stop_server() -> void:
	if not _is_running:
		return
	for conn in _connections.keys():
		conn.disconnect_from_host()
	_connections.erase(conn)
	if _tcp_server:
		_tcp_server.stop()
		_tcp_server = null
	_is_running = false
	print("[TraeMCP] TCP服务器已停止")

func _process(_delta: float) -> void:
	if not _is_running or not _tcp_server:
		return

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
		if conn.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			to_remove.append(conn)
			continue
		conn.poll()
		var available = conn.get_available_bytes()
		if available > 0:
			var data = conn.get_utf8_string(available)
			if data != "":
				_connections[conn] += data
				# 尝试解析完整的JSON消息（以换行符分隔）
				while "\n" in _connections[conn]:
					var idx = _connections[conn].find("\n")
					var msg = _connections[conn].substr(0, idx).strip_edges()
					_connections[conn] = _connections[conn].substr(idx + 1)
					if msg.length() > 0:
						_handle_message(conn, msg)

	for conn in to_remove:
		_connections.erase(conn)
		print("[TraeMCP] 客户端已断开")

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

	match cmd:
		"ping":
			_send_json(conn, {"request_id": req_id, "pong": true})
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
		"get_project_files":
			_cmd_get_project_files(conn, req_id, str(data.get("directory", "res://")))
		"get_debug_output":
			_cmd_get_debug_output(conn, req_id)
		"create_node":
			_cmd_create_node(conn, req_id, str(data.get("parent_path", "")), str(data.get("node_type", "")), str(data.get("node_name", "")))
		"delete_node":
			_cmd_delete_node(conn, req_id, str(data.get("node_path", "")))
		_:
			_send_json(conn, {"request_id": req_id, "error": "未知命令: " + cmd})

# ==================== 命令处理 ====================

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
			# 跳过无法序列化的类型
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
	node.set(prop_name, value)
	get_editor_interface().mark_scene_as_unsaved()
	_send_json(conn, {"request_id": req_id, "success": true, "node_path": node_path, "property": prop_name})

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

# ==================== 辅助方法 ====================

func _find_node(node_path: String) -> Node:
	var root = get_editor_interface().get_edited_scene_root()
	if not root:
		return null
	if node_path == "" or node_path == "/":
		return root
	return root.get_node_or_null(NodePath(node_path))

func _send_json(conn: StreamPeerTCP, data: Dictionary) -> void:
	if not conn or conn.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	var json_str = JSON.stringify(data) + "\n"
	conn.put_data(json_str.to_utf8_buffer())
