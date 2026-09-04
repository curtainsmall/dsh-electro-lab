# 注册示例工具

先启动对端（`node src/echo.ts http --port 8787` 或 `node src/echo.ts file --dir <目录>`）。在插件的记录面板中打开「外部工具」页，点击「添加外部工具」，按下表填写对话框。更改在下次重启宿主时生效。

另一种方式：在会话中让智能体注册该工具，并把下方该工具的 `agentDeclaration` JSON 原文粘贴给它；智能体会调用 `external_tool_add`。

## echo_http

| 对话框字段 | 填写 | 说明 |
|---|---|---|
| 名称 | `echo_http` | 智能体调用时使用的工具名；小写字母开头，仅 `a-z0-9_` |
| 传输 | `http` | http 调用 URL；file 通过目录交换请求/响应文件 |
| 方法 | `POST` | POST 以请求体携带信封 |
| URL | `http://127.0.0.1:8787/echo` | 对端监听地址；`--port` 可覆盖 8787 |
| 超时（毫秒） | `10000` | 可选；留空保持默认 30000 |
| 描述 | `Echo peer over http (ElectroLab external-tool manual test): returns every parameter it receives, verbatim` | 智能体据此判断何时调用该工具 |
| 启用 | 开 | 停用的声明会保留但不会被注册 |

参数——每行先点一次「添加参数」：

| 名称 | 类型 | 必填 | 其他字段 |
|---|---|---|---|
| `message` | string | 是 | 说明：`a text echoed back verbatim` |
| `values` | array | 否 | 数组元素：`quantity` · 数量类别：`none` · 说明：`values echoed back verbatim` |
| `flag` | boolean | 否 | 说明：`a boolean echoed back verbatim` |

`agentDeclaration`：

```json
{
  "name": "echo_http",
  "description": "Echo peer over http (ElectroLab external-tool manual test): returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values": { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag": { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "transport": "http",
  "transportOptions": { "url": "http://127.0.0.1:8787/echo", "method": "POST" },
  "timeoutMs": 10000
}
```

## echo_file

| 对话框字段 | 填写 | 说明 |
|---|---|---|
| 名称 | `echo_file` | 智能体调用时使用的工具名；小写字母开头，仅 `a-z0-9_` |
| 传输 | `file` | http 调用 URL；file 通过目录交换请求/响应文件 |
| 目录 | `C:/elab-inbox` | 传给对端的目录；宿主在其中写入 `in.<id>.json` |
| 轮询间隔（毫秒） | `200` | 可选；留空保持默认 200 |
| 请求/响应文件前缀 | （留空） | 留空保持 `in` / `out` 默认值 |
| 超时（毫秒） | `10000` | 可选；留空保持默认 30000 |
| 描述 | `Echo peer over file transport (ElectroLab external-tool manual test): returns every parameter it receives, verbatim` | 智能体据此判断何时调用该工具 |
| 启用 | 开 | 停用的声明会保留但不会被注册 |

参数——每行先点一次「添加参数」：

| 名称 | 类型 | 必填 | 其他字段 |
|---|---|---|---|
| `message` | string | 是 | 说明：`a text echoed back verbatim` |
| `values` | array | 否 | 数组元素：`quantity` · 数量类别：`none` · 说明：`values echoed back verbatim` |
| `flag` | boolean | 否 | 说明：`a boolean echoed back verbatim` |

`agentDeclaration`：

```json
{
  "name": "echo_file",
  "description": "Echo peer over file transport (ElectroLab external-tool manual test): returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values": { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag": { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "transport": "file",
  "transportOptions": { "directory": "C:/elab-inbox", "pollMs": 200 },
  "timeoutMs": 10000
}
```
