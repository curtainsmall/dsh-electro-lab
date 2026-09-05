# ElectroLab Echo Peer

Manual test/demo counterpart for the DeepSeek Harness ElectroLab external-fn
feature. The peer speaks the state machine's typed envelope protocol on one
transport — the request is `{requestId, args}` where every argument is a
typed value, the response is `{requestId, result}` with a typed value (or
`result: null` for void), and it echoes every argument back as typed values,
so a full register → restart → model-call round trip can be verified by eye.

## Independent project

This directory is its **own npm project** (`package.json`, `tsconfig.json`),
not part of the plugin's build: nothing in the plugin's `src/` references it,
the plugin's typecheck/tests/package do not cover it, and the npm artifact
never ships it. It only lives inside the repository for convenience.

- **Zero runtime dependencies.** The peer runs on the Node.js standard
  library only, via Node's built-in TypeScript type stripping — no build
  step. Node ≥ 22.18 or ≥ 23.6 runs `.ts` files natively.
- **Own quality gate.** `pnpm typecheck` (after `pnpm install` in this
  directory) checks `src/` under strict settings with `erasableSyntaxOnly`
  — the syntax Node can strip at runtime.

## 1. Run a peer

From this directory (`external-fns-example/`):

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

[`register-guide.md`](register-guide.md) lists the two functions with the
exact value for every dialog field, including the **returns** editor (a
declaration without an explicit returns is archived but never registers). In
the Records panel open the **External fns** tab → **Add external fn** and
fill the form accordingly, or ask the agent in a session to register the
function, pasting the fn's `agentDeclaration` JSON from the guide; the
agent calls `external_fns_add`. The `echo_file` directory assumes the peer
runs with `--dir C:/elab-inbox` — adapt it to the directory you actually
use. Changes apply at the next host restart.

## 3. Restart the host

Declarations register at state machine start: restart the DSH host process, then
reload the page. `echo_http` and `echo_file` now appear among the fns the agent
can `call`.

## 4. Call it

Ask the agent to call `echo_http` with a `message`, optional `values` (an
array of numbers — quantities accept bare numbers, `{re, im}` or `{mag, ang}`)
and an optional `flag`. The state machine stores the result in the named target
slot; `get` returns exactly what the peer echoed back, as typed values:

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

The Records panel shows the call arguments and the echoed result side by
side in the trace, which is the point of the demo. The file transport also
exercises the host's polling and cleanup (both `in.*.json` and `out.*.json`
disappear after the call).

## 5. Self-check without the plugin

HTTP:

```bash
curl -s -X POST http://127.0.0.1:8787/ \
  -H 'content-type: application/json' \
  -d '{"requestId":"manual-1","args":{"message":{"type":"string","value":"hi"},"flag":{"type":"boolean","value":true}}}'
```

```json
{ "requestId": "manual-1", "result": { "type": "object", "value": { "message": { "type": "string", "value": "hi" }, "flag": { "type": "boolean", "value": true } } } }
```

A response whose requestId does not match is rejected by the host; a
non-JSON request body gets an `{error: "…"}` response. An endpoint signals a
failed computation by returning `{ "requestId": "…", "error": "…" }` — the
host raises it as the fn error (code `EXTERNAL_ERROR`), the same structured
error any thrown failure produces. The host only ever sends **POST**; the
typed args travel as the JSON body.

## Protocol reference

The full declaration grammar (name/description/enabled/parameters/returns/
transport/transportOptions), the typed-value payload shapes and the wire
protocol are documented in the plugin's [`docs/tools.md`](../docs/tools.md)
(ElectroLab State Machine Manual — External functions section) and its
Chinese mirror [`docs/tools.zh-CN.md`](../docs/tools.zh-CN.md).
