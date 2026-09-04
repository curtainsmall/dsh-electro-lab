# ElectroLab Echo Peers

Manual test/demo counterparts for the DeepSeek Harness ElectroLab external-tool
feature. Each peer speaks the plugin's envelope protocol on one transport —
the request is `{requestId, ...params}` and the response must be
`{requestId, result}` with the requestId echoed — and echoes every parameter
back verbatim, so a full registration → restart → model-call round trip can
be verified by eye.

## Independent project

This directory is its **own npm project** (`package.json`, `tsconfig.json`),
not part of the plugin's build: nothing in the plugin's `src/` references it,
the plugin's typecheck/tests/package do not cover it, and the npm artifact
never ships it. It only lives inside the repository for convenience.

- **Zero runtime dependencies.** The peers run on the Node.js standard
  library only, via Node's built-in TypeScript type stripping — no build
  step. Node ≥ 22.18 or ≥ 23.6 runs `.ts` files natively.
- **Own quality gate.** `pnpm typecheck` (after `pnpm install` in this
  directory) checks `src/` under strict settings with `erasableSyntaxOnly`
  — the syntax Node can strip at runtime.

## 1. Run a peer

From this directory (`external-tool-example/`):

```bash
node src/echo.ts http --port 8787
# [http] echo peer listening on http://127.0.0.1:8787/
```

File transport (the host writes `in.<id>.json` there and polls for
`out.<id>.json`):

```bash
node src/echo.ts file --dir C:/elab-inbox
# [file] echo peer watching C:\elab-inbox
```

Or install the dev tooling once and use the npm scripts:

```bash
pnpm install
pnpm echo:http
pnpm echo:file          # uses ./elab-inbox under this directory
```

## 2. Register the declarations

[`register-guide.md`](register-guide.md) lists the two tools with the exact
value for every dialog field. In the Records panel open the **External
tools** tab → **Add external tool** and fill the form accordingly, or ask the
agent in a session to register the tool, pasting the tool's
`agentDeclaration` JSON from the guide; the agent calls `external_tool_add`.
The `echo_file` directory assumes the peer runs with `--dir C:/elab-inbox` —
adapt it to the directory you actually use. Changes apply at the next host
restart.

## 3. Restart the host

Declarations register at plugin start: restart the DSH host process, then
reload the page. `echo_http` and `echo_file` now appear among the model's
tools.

## 4. Call it

Ask the agent to call `echo_http` with a `message`, optional `values` (an
array of numbers — quantities accept bare numbers, `{re, im}` or `{mag, ang}`)
and an optional `flag`. The result the agent sees is exactly what the peer
received, minus the requestId:

```json
{
  "message": "round trip ok",
  "values": [1, 2.5, { "re": 3, "im": -1 }],
  "flag": true
}
```

The Records panel shows the call arguments and the echoed result side by
side, which is the point of the demo. The file transport also exercises the
host's polling and cleanup (both `in.*.json` and `out.*.json` disappear
after the call).

## 5. Self-check without the plugin

HTTP:

```bash
curl -s -X POST http://127.0.0.1:8787/echo \
  -H 'content-type: application/json' \
  -d '{"requestId":"manual-1","message":"hi","values":[1,2],"flag":true}'
```

```json
{ "requestId": "manual-1", "result": { "message": "hi", "values": [1, 2], "flag": true } }
```

A response whose requestId does not match is rejected by the host; malformed
requests get a `400` with an `error` field. GET requests also work, but every
parameter travels as a query string, so values arrive as strings. An endpoint
signals a failed computation by returning
`{ "requestId": "…", "error": "…" }` (a `result` field present alongside is
ignored) — the host raises it as a tool error (code `EXTERNAL_ERROR`), the
same structured error any thrown failure produces.

## Protocol reference

The full declaration grammar (name/description/enabled/parameters/transport/
transportOptions/returns) and the value payload shapes are documented in the
plugin's [`docs/tools.md`](../docs/tools.md) (External tools section) and its
Chinese mirror [`docs/tools.zh-CN.md`](../docs/tools.zh-CN.md).
