# ElectroLab 回声对端

面向 DeepSeek Harness ElectroLab 外部求解器功能的手动测试/演示对端。对端以某一种传输实现引擎的类型化信封协议——请求是 `{requestId, args}`，其中每个参数都是类型化值；响应是 `{requestId, result}`，携带一个类型化值（void 时为 `result: null`）；它把收到的每个参数都以类型化值形式原样回显，因此「注册 → 重启 → 模型调用」的完整闭环可以用肉眼验证。

## 独立工程

本目录是**独立的 npm 工程**（自带 `package.json`、`tsconfig.json`），不属于插件的构建体系：插件的 `src/` 中没有任何代码引用它，插件的 typecheck/测试/发布包都不覆盖它，npm 发布物也永远不会包含它。它放在仓库里只为方便。

- **零运行时依赖。** 对端只用 Node.js 标准库，经 Node 内置的 TypeScript type stripping 直接运行——无需构建步骤。Node ≥ 22.18 或 ≥ 23.6 可原生运行 `.ts` 文件。
- **自带质量门。** 在本目录执行 `pnpm install` 之后，`pnpm typecheck` 会在严格设置与 `erasableSyntaxOnly` 下检查 `src/`——即 Node 运行时能剥离的那部分语法。

## 1. 启动对端

在本目录（`external-solvers-example/`）下执行：

```bash
node src/echo.ts http --port 8787
# [http] echo peer listening on http://127.0.0.1:8787/
```

file 传输（宿主在其中写入 `in.<id>.json`，并轮询 `out.<id>.json`）：

```bash
node src/echo.ts file --dir C:/elab-inbox
# [file] echo peer watching C:\elab-inbox
```

或一次性安装开发工具后使用 npm 脚本：

```bash
pnpm install
pnpm echo:http
pnpm echo:file          # 使用本目录下的 ./elab-inbox
```

## 2. 注册声明

[`register-guide.zh-CN.md`](register-guide.zh-CN.md) 列出两个求解器及对话框每个字段应填的确切值，包括 **returns** 编辑器（没有显式 returns 的声明只会被存档、永远不会注册）。在记录面板中打开**「外部求解器」页** → **「添加外部求解器」**，按指南填写表单；或在会话中让智能体注册该求解器，把指南中该求解器的 `agentDeclaration` JSON 原文粘贴给它；智能体会调用 `external_solver_add`。`echo_file` 的目录假定对端以 `--dir C:/elab-inbox` 运行——请改成你实际使用的目录。更改在下次宿主重启时生效。

## 3. 重启宿主

声明在引擎启动时注册：重启 DSH 宿主进程，然后刷新页面。`echo_http` 与 `echo_file` 会出现在智能体可 `call` 的引擎求解器中。

## 4. 调用

让智能体调用 `echo_http`，携带 `message`、可选的 `values`（数字数组——quantity 接受裸数字、`{re, im}` 或 `{mag, ang}`）与可选的 `flag`。引擎把结果存入具名 target 槽；`get` 返回的正是对端原样回显的内容——全部是类型化值：

```json
{
  "message": { "type": "string", "value": "round trip ok" },
  "values": {
    "type": "array",
    "value": [
      { "type": "number", "value": 1, "kind": "none" },
      { "type": "number", "value": 2.5, "kind": "none" }
    ]
  },
  "flag": { "type": "boolean", "value": true }
}
```

记录面板会在轨迹中把调用参数与回显结果并排展示——这正是该演示的目的。file 传输还会顺带演练宿主的轮询与清理（调用结束后 `in.*.json` 与 `out.*.json` 都会消失）。

## 5. 不经插件自检

HTTP：

```bash
curl -s -X POST http://127.0.0.1:8787/ \
  -H 'content-type: application/json' \
  -d '{"requestId":"manual-1","args":{"message":{"type":"string","value":"hi"},"flag":{"type":"boolean","value":true}}}'
```

```json
{ "requestId": "manual-1", "result": { "type": "object", "value": { "message": { "type": "string", "value": "hi" }, "flag": { "type": "boolean", "value": true } } } }
```

requestId 不匹配的响应会被宿主拒绝；非 JSON 的请求体会收到 `{error: "…"}` 响应。端点通过返回 `{ "requestId": "…", "error": "…" }` 表示计算失败——宿主会把它提升为 solver 错误（code 为 `EXTERNAL_ERROR`），与任何抛出的失败所产生的是同一种结构化错误。宿主永远只发 **POST**；类型化参数以 JSON 请求体的形式传输。

## 协议参考

完整的声明语法（name/description/enabled/parameters/returns/transport/transportOptions）、类型化值载荷形状与线协议见插件的 [`docs/tools.md`](../docs/tools.md)（ElectroLab 引擎手册——外部求解器章节）及其简体中文镜像 [`docs/tools.zh-CN.md`](../docs/tools.zh-CN.md)。
