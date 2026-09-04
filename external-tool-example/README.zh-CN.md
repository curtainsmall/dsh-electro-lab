# ElectroLab 回声对端（Echo Peers）

面向 DeepSeek Harness ElectroLab 外部工具功能的手动测试/演示对端。每个对端以某一种传输实现插件的信封协议——请求为 `{requestId, …参数}`，响应必须为 `{requestId, result}` 且回显 requestId——并把收到的每个参数原样回显，从而可以肉眼验证「注册 → 重启 → 模型调用」的完整闭环。

## 独立工程

本目录是**独立的 npm 工程**（自带 `package.json`、`tsconfig.json`），不属于插件的构建体系：插件的 `src/` 没有任何代码引用它，插件的 typecheck/测试/发布包都不覆盖它，npm 发布物永远不会包含它。放在仓库里只为方便。

- **零运行时依赖。** 对端只用 Node.js 标准库，经 Node 内置的 TypeScript type stripping 直接运行——无构建步骤。Node 22.18 及以上或 23.6 及以上可原生运行 `.ts` 文件。
- **自带质量门。** 在本目录执行 `pnpm install` 后，`pnpm typecheck` 以严格配置 + `erasableSyntaxOnly` 检查 `src/`——即 Node 运行时能剥离的那部分语法。

## 1. 启动对端

在本目录（`external-tool-example/`）执行：

```bash
node src/echo.ts http --port 8787
# [http] echo peer listening on http://127.0.0.1:8787/
```

file 传输（宿主在其中写入 `in.<id>.json`，并轮询 `out.<id>.json`）：

```bash
node src/echo.ts file --dir C:/elab-inbox
# [file] echo peer watching C:\elab-inbox
```

或安装一次开发依赖后用 npm 脚本：

```bash
pnpm install
pnpm echo:http
pnpm echo:file          # 使用本目录下的 ./elab-inbox
```

## 2. 注册声明

[`register-guide.zh-CN.md`](register-guide.zh-CN.md) 列出两个工具及对话框每个字段应填的确切值。在记录面板（「外部工具」页 →「添加外部工具」）按该文件填写表单；或在会话中把指南中该工具的 `agentDeclaration` JSON 原文粘贴给智能体，由它调用 `external_tool_add`。`echo_file` 的目录假定对端以 `--dir C:/elab-inbox` 运行——请改成你实际使用的目录。更改在下次重启宿主时生效。

## 3. 重启宿主

声明在插件启动时注册：重启 DSH 宿主进程，然后刷新页面。`echo_http` 与 `echo_file` 会出现在模型可用的工具列表中。

## 4. 调用

让智能体调用 `echo_http`，携带 `message`、可选的 `values`（数字数组——数量参数接受裸数字、`{re, im}` 或 `{mag, ang}`）与可选的 `flag`。智能体看到的结果就是对端收到的内容去掉 requestId 后的原样回显：

```json
{
  "message": "round trip ok",
  "values": [1, 2.5, { "re": 3, "im": -1 }],
  "flag": true
}
```

记录面板会把调用参数与回显结果并排展示，这正是演示的目的。file 传输还会顺带验证宿主的轮询与清理（调用结束后 `in.*.json` 与 `out.*.json` 都会消失）。

## 5. 不经插件自检

http：

```bash
curl -s -X POST http://127.0.0.1:8787/echo \
  -H 'content-type: application/json' \
  -d '{"requestId":"manual-1","message":"hi","values":[1,2],"flag":true}'
```

```json
{ "requestId": "manual-1", "result": { "message": "hi", "values": [1, 2], "flag": true } }
```

requestId 不匹配的响应会被宿主拒绝；畸形请求返回带 `error` 字段的 `400`。GET 请求同样可用，但所有参数都走查询串，数值会以字符串到达。端点表达「计算失败」时返回 `{ "requestId": "…", "error": "…" }`（若同时带有 `result` 字段则被忽略）——宿主将其提升为工具错误（code `EXTERNAL_ERROR`），与任何抛出的失败呈现为同一种结构化错误。

## 协议参考

完整的声明语法（name/description/enabled/parameters/transport/transportOptions/returns）与值载荷形状见插件的 [`docs/tools.md`](../docs/tools.md) 外部工具章节及其中文镜像 [`docs/tools.zh-CN.md`](../docs/tools.zh-CN.md)。
