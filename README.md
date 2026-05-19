# Trae Godot MCP v2.1 - 实时Godot编辑器集成

这是一个增强版的MCP（Model Context Protocol）服务器，让Trae AI助手能够实时与Godot编辑器进行深度交互。

## 功能特性

### 核心功能
- **连接状态监控** - 实时检查与Godot编辑器的连接状态
- **操作日志系统** - 记录所有操作历史，支持查询和导出
- **错误恢复机制** - 自动重连和错误处理

### 实时场景编辑
- **查看场景树** - 获取当前场景的完整节点结构
- **获取节点属性** - 查看任意节点的所有可编辑属性
- **修改节点属性** - 实时修改节点属性值
- **选择节点** - 在编辑器中高亮选中指定节点
- **重命名节点** - 修改节点名称
- **重新父级节点** - 将节点移动到新的父节点下

### 脚本编辑
- **读取脚本** - 获取GDScript文件内容
- **修改脚本** - 实时更新脚本内容并自动重载
- **代码质量检查** - 分析脚本中的潜在问题

### 节点管理
- **创建节点** - 在场景中创建新节点
- **删除节点** - 删除指定节点
- **复制节点** - 复制现有节点
- **批量设置属性** - 同时修改多个节点的属性

### 资源管理
- **导入资源** - 导入图片、音频等资源文件
- **获取资源信息** - 查看资源的详细信息
- **创建材质** - 创建新的材质资源

### 场景管理
- **创建新场景** - 创建并打开新场景文件
- **切换场景** - 打开指定场景文件
- **获取打开的场景** - 列出所有已打开的场景
- **保存所有场景** - 批量保存所有打开的场景
- **保存场景** - 保存当前场景
- **重载场景** - 重新加载当前场景

### 项目控制
- **运行项目** - 启动游戏预览
- **停止项目** - 停止运行中的项目

### 调试支持
- **获取调试输出** - 查看游戏运行时的输出日志
- **获取错误信息** - 查看编译错误和警告
- **捕获截图** - 捕获游戏运行时的画面
- **性能统计** - 获取FPS、内存使用、绘制调用等性能数据

### 项目管理
- **浏览项目文件** - 列出项目目录中的文件
- **项目统计** - 获取项目文件数量、代码行数等统计信息

### 实用工具
- **文件搜索** - 在项目中搜索文件内容
- **批量替换** - 在多个文件中替换文本
- **操作日志** - 查看和导出操作历史

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

### 节点操作
```
# 重命名节点
使用 rename_node 工具
参数：nodePath (当前路径), newName (新名称)

# 重新父级节点
使用 reparent_node 工具
参数：nodePath (当前路径), newParentPath (新父节点路径)

# 批量设置属性
使用 batch_set_property 工具
参数：nodePaths (节点路径数组), property (属性名), value (属性值)
```

### 场景管理
```
# 创建新场景
使用 create_new_scene 工具
参数：scenePath (场景文件路径)

# 切换场景
使用 switch_scene 工具
参数：scenePath (场景文件路径)

# 获取打开的场景
使用 get_open_scenes 工具

# 保存所有场景
使用 save_all_scenes 工具
```

### 资源管理
```
# 导入资源
使用 import_asset 工具
参数：sourcePath (源文件路径), targetPath (目标路径), assetType (资源类型)

# 获取资源信息
使用 get_resource_info 工具
参数：resourcePath (资源路径)

# 创建材质
使用 create_material 工具
参数：materialPath (材质路径), materialType (材质类型)
```

### 调试工具
```
# 捕获截图
使用 capture_screenshot 工具
参数：outputPath (输出路径)

# 获取性能统计
使用 get_performance_stats 工具
返回：FPS、内存使用、绘制调用、节点数量

# 检查代码质量
使用 check_code_quality 工具
参数：scriptPath (脚本路径)
```

### 实用工具
```
# 文件搜索
使用 search_in_files 工具
参数：searchPattern (搜索模式), filePattern (文件模式), path (搜索路径)

# 批量替换
使用 replace_in_files 工具
参数：searchPattern (搜索模式), replacement (替换内容), path (路径)

# 获取操作日志
使用 get_operation_log 工具
参数：limit (返回条目数), operationType (操作类型过滤)
```

## 可用工具列表

### 基础工具
| 工具名 | 描述 |
|--------|------|
| `check_godot_connection` | 检查与Godot编辑器的连接状态 |
| `get_connection_status` | 获取详细的连接状态信息 |
| `get_scene_tree` | 获取场景树结构 |
| `get_node_properties` | 获取节点属性列表 |
| `set_node_property` | 设置节点属性值 |
| `get_selected_nodes` | 获取当前选中的节点 |
| `select_node` | 选中指定节点 |

### 节点操作
| 工具名 | 描述 |
|--------|------|
| `create_node` | 创建新节点 |
| `delete_node` | 删除节点 |
| `duplicate_node` | 复制节点 |
| `rename_node` | 重命名节点 |
| `reparent_node` | 重新父级节点 |
| `batch_set_property` | 批量设置节点属性 |

### 脚本编辑
| 工具名 | 描述 |
|--------|------|
| `get_script_content` | 获取脚本内容 |
| `set_script_content` | 设置脚本内容 |
| `check_code_quality` | 检查代码质量 |

### 场景管理
| 工具名 | 描述 |
|--------|------|
| `save_scene` | 保存场景 |
| `reload_scene` | 重载场景 |
| `create_new_scene` | 创建新场景 |
| `switch_scene` | 切换场景 |
| `get_open_scenes` | 获取打开的场景列表 |
| `save_all_scenes` | 保存所有场景 |

### 资源管理
| 工具名 | 描述 |
|--------|------|
| `import_asset` | 导入资源 |
| `get_resource_info` | 获取资源信息 |
| `create_material` | 创建材质 |

### 项目控制
| 工具名 | 描述 |
|--------|------|
| `run_project` | 运行项目 |
| `stop_project` | 停止项目 |
| `get_project_files` | 获取项目文件列表 |
| `get_project_stats` | 获取项目统计信息 |

### 调试工具
| 工具名 | 描述 |
|--------|------|
| `get_debug_output` | 获取调试输出 |
| `get_errors` | 获取错误信息 |
| `capture_screenshot` | 捕获截图 |
| `get_performance_stats` | 获取性能统计 |

### 实用工具
| 工具名 | 描述 |
|--------|------|
| `search_in_files` | 在文件中搜索 |
| `replace_in_files` | 在文件中替换 |
| `get_operation_log` | 获取操作日志 |

## 系统架构

```
┌─────────────┐     TCP Socket      ┌─────────────────┐
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

## 版本历史

### v2.1 (当前版本)
- 新增35+个MCP工具和Godot命令
- 添加连接状态监控和操作日志系统
- 支持节点重命名、重新父级、批量操作
- 新增资源管理功能（导入、创建材质）
- 新增场景管理功能（创建、切换、批量保存）
- 新增调试工具（截图、性能统计）
- 新增项目管理功能（统计、代码质量检查）
- 新增实用工具（搜索、替换、操作日志）

### v2.0
- 初始增强版本
- 基础场景编辑功能
- 脚本编辑功能
- 节点管理功能
- 项目控制功能

## 开发计划

- [ ] 支持更多节点类型
- [ ] 添加资源导入功能
- [ ] 支持场景预览截图
- [ ] 添加性能监控工具
- [ ] 支持多项目同时连接
- [ ] AI辅助代码补全
- [ ] 智能代码重构建议

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
