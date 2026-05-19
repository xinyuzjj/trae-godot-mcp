# Trae Godot MCP - 实时Godot编辑器集成

这是一个增强版的MCP（Model Context Protocol）服务器，让Trae AI助手能够实时与Godot编辑器进行交互。

## 功能特性

### 实时场景编辑
- **查看场景树** - 获取当前场景的完整节点结构
- **获取节点属性** - 查看任意节点的所有可编辑属性
- **修改节点属性** - 实时修改节点属性值
- **选择节点** - 在编辑器中高亮选中指定节点

### 脚本编辑
- **读取脚本** - 获取GDScript文件内容
- **修改脚本** - 实时更新脚本内容并自动重载

### 节点管理
- **创建节点** - 在场景中创建新节点
- **删除节点** - 删除指定节点
- **复制节点** - 复制现有节点

### 项目控制
- **运行项目** - 启动游戏预览
- **停止项目** - 停止运行中的项目
- **保存场景** - 保存当前场景
- **重载场景** - 重新加载当前场景

### 调试支持
- **获取调试输出** - 查看游戏运行时的输出日志
- **获取错误信息** - 查看编译错误和警告
- **浏览项目文件** - 列出项目目录中的文件

## 安装步骤

### 1. 安装Godot编辑器插件

将 `godot_plugin/addons/trae_mcp` 文件夹复制到你的Godot项目的 `addons` 目录中：

```
your-project/
├── addons/
│   └── trae_mcp/
│       ├── plugin.cfg
│       └── trae_mcp_plugin.gd
├── project.godot
└── ...
```

然后在Godot编辑器中：
1. 打开 **项目设置** > **插件**
2. 找到 **"Trae MCP Integration"**
3. 点击 **启用**
4. 重启Godot编辑器

### 2. 安装MCP服务器

```bash
# 克隆仓库
git clone https://github.com/xinyuzjj/trae-godot-mcp.git
cd trae-godot-mcp/mcp-server

# 安装依赖
npm install

# 构建项目
npm run build

# 链接到全局（可选）
npm link
```

### 3. 配置Trae

在Trae的设置中添加MCP服务器配置：

**Windows:**
```json
{
  "mcpServers": {
    "trae-godot": {
      "command": "node",
      "args": ["E:\\path\\to\\trae-godot-mcp\\mcp-server\\build\\index.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

**macOS/Linux:**
```json
{
  "mcpServers": {
    "trae-godot": {
      "command": "node",
      "args": ["/path/to/trae-godot-mcp/mcp-server/build/index.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

## 使用方法

### 检查连接状态
```
使用 check_godot_connection 工具确认是否已连接到Godot编辑器
```

### 查看场景树
```
使用 get_scene_tree 工具获取当前场景的完整节点结构
```

### 修改节点属性
```
使用 set_node_property 工具修改节点属性
参数：
- nodePath: 节点路径 (如 "root/Player/Sprite2D")
- property: 属性名 (如 "position")
- value: 属性值 (如 {"x": 100, "y": 200})
```

### 编辑脚本
```
使用 get_script_content 获取脚本内容
使用 set_script_content 更新脚本内容
```

### 运行项目
```
使用 run_project 工具启动游戏
使用 stop_project 工具停止游戏
```

## 可用工具列表

| 工具名 | 描述 |
|--------|------|
| `check_godot_connection` | 检查与Godot编辑器的连接状态 |
| `get_scene_tree` | 获取场景树结构 |
| `get_node_properties` | 获取节点属性列表 |
| `set_node_property` | 设置节点属性值 |
| `get_selected_nodes` | 获取当前选中的节点 |
| `select_node` | 选中指定节点 |
| `get_script_content` | 获取脚本内容 |
| `set_script_content` | 设置脚本内容 |
| `create_node` | 创建新节点 |
| `delete_node` | 删除节点 |
| `duplicate_node` | 复制节点 |
| `run_project` | 运行项目 |
| `stop_project` | 停止项目 |
| `save_scene` | 保存场景 |
| `reload_scene` | 重载场景 |
| `get_debug_output` | 获取调试输出 |
| `get_errors` | 获取错误信息 |
| `get_project_files` | 获取项目文件列表 |

## 系统架构

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Trae AI   │ ◄────────────────► │  Godot Editor   │
│   (MCP)     │     Port 9742      │  (Plugin)       │
└─────────────┘                    └─────────────────┘
       │                                    │
       │         MCP Protocol               │
       │                                    │
┌─────────────┐                    ┌─────────────────┐
│ MCP Server  │                    │  Scene Tree     │
│ (Node.js)   │                    │  Inspector      │
└─────────────┘                    └─────────────────┘
```

## 故障排除

### 无法连接到Godot编辑器
1. 确认插件已正确安装并启用
2. 检查Godot编辑器是否正在运行
3. 检查端口9742是否被占用
4. 查看Godot编辑器的输出面板是否有错误信息

### 脚本修改后没有生效
1. 确认脚本路径正确
2. 检查Godot编辑器中是否有语法错误提示
3. 尝试使用 `reload_scene` 工具重载场景

### 节点属性修改失败
1. 确认节点路径正确
2. 检查属性名是否拼写正确
3. 确认属性值类型正确

## 开发计划

- [ ] 支持更多节点类型
- [ ] 添加资源导入功能
- [ ] 支持场景预览截图
- [ ] 添加性能监控工具
- [ ] 支持多项目同时连接

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
