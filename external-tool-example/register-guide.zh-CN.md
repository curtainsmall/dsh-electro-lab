# 注册示例函数

对端必须先行启动（`node src/echo.ts http --port 8787` 或 `node src/echo.ts file --dir <目录>`）。在插件的记录面板中打开**「外部函数」页**，点击**「添加外部函数」**，然后按下表填写对话框。更改在宿主重启后生效。

另一种方式是：在会话中让智能体注册该函数，并把该函数的 `agentDeclaration` JSON 原文粘贴给它；智能体会调用 `external_fns_add`。

## echo_http

| 对话框字段 | 填写 | 说明 |
|---|---|---|
| 名称 | `echo_http` | 智能体将调用的 fn 名称；小写字母开头，仅 `a-z0-9_` |
| 传输 | `http` | http 调用一个 URL；file 通过目录交换请求/响应文件 |
| 方法 | `POST` | 宿主恒发 POST——类型化信封随请求体传输 |
| URL | `http://127.0.0.1:8787/` | 对端监听地址；`--port` 可覆盖 8787 |
| 超时（毫秒） | `10000` | 可选；留空保持默认 30000 |
| 描述 | `Echo peer over http (ElectroLab external-fn manual test): returns every parameter it receives, verbatim` | 智能体据此判断何时调用该 fn |
| 启用 | 开 | 停用的声明会被保留，但不会被注册 |

参数——每一行先点击一次「添加参数」：

| 名称 | 类型 | 必填 | 其他字段 |
|---|---|---|---|
| `message` | string | 是 | 说明：`a text echoed back verbatim` |
| `values` | array | 否 | 数组元素：`quantity` · 数量类别：`none` · 说明：`values echoed back verbatim` |
| `flag` | boolean | 否 | 说明：`a boolean echoed back verbatim` |

Returns——**Returns** 区域（必填；没有 Returns 的声明永远不会注册）：类型选 `object`，然后为每个返回键添加一个字段：

| 字段名 | 类型 | 其他字段 |
|---|---|---|
| `message` | string | |
| `values` | array | 数组元素：`quantity` · 数量类别：`none` |
| `flag` | boolean | |

`agentDeclaration`：

```json
{
  "name": "echo_http",
  "description": "Echo peer over http (ElectroLab external-fn manual test): returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values": { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag": { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "returns": {
    "type": "object",
    "fields": {
      "message": { "type": "string" },
      "values": { "type": "array", "items": { "type": "quantity", "kind": "none" } },
      "flag": { "type": "boolean" }
    }
  },
  "transport": "http",
  "transportOptions": { "url": "http://127.0.0.1:8787/", "method": "POST" },
  "timeoutMs": 10000
}
```

## echo_file

| 对话框字段 | 填写 | 说明 |
|---|---|---|
| 名称 | `echo_file` | 智能体将调用的 fn 名称；小写字母开头，仅 `a-z0-9_` |
| 传输 | `file` | http 调用一个 URL；file 通过目录交换请求/响应文件 |
| 目录 | `C:/elab-inbox` | 传给对端的目录；宿主在其中写入 `in.<id>.json` |
| 轮询间隔（毫秒） | `200` | 可选；留空保持默认 200 |
| 请求/响应文件前缀 | （留空） | 留空保持 `in` / `out` 默认值 |
| 超时（毫秒） | `10000` | 可选；留空保持默认 30000 |
| 描述 | `Echo peer over file transport (ElectroLab external-fn manual test): returns every parameter it receives, verbatim` | 智能体据此判断何时调用该 fn |
| 启用 | 开 | 停用的声明会被保留，但不会被注册 |

参数与 Returns：与上文 `echo_http` 的行相同。

`agentDeclaration`：

```json
{
  "name": "echo_file",
  "description": "Echo peer over file transport (ElectroLab external-fn manual test): returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values": { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag": { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "returns": {
    "type": "object",
    "fields": {
      "message": { "type": "string" },
      "values": { "type": "array", "items": { "type": "quantity", "kind": "none" } },
      "flag": { "type": "boolean" }
    }
  },
  "transport": "file",
  "transportOptions": { "directory": "C:/elab-inbox", "pollMs": 200 },
  "timeoutMs": 10000
}
```

## 线协议速览

```
request:  { "requestId": "…", "args": { "message": { "type": "string", "value": "hi" }, … } }
response: { "requestId": "…", "result": { "type": "object", "value": { "message": { "type": "string", "value": "hi" }, … } } }
failure:  { "requestId": "…", "error": "…" }
```

对端把收到的每个参数都以类型化值形式回显在一个对象结果里；不是类型化值的值会被包成字符串。完整协议见 [`docs/tools.md`](../docs/tools.md)。
