# Registering the Example Tools

The peer must be running first (`node src/echo.ts http --port 8787` or
`node src/echo.ts file --dir <directory>`). In the plugin's Records panel
open the **External tools** tab and click **Add external tool**, then fill
the dialog with the values below. Changes apply after a host restart.

Alternatively, ask the agent in a session to register the tool and paste the
tool's `agentDeclaration` JSON; the agent calls `external_tool_add`.

## echo_http

| Dialog field | Enter | Note |
|---|---|---|
| Name | `echo_http` | the tool name the agent will call; starts lowercase, `a-z0-9_` only |
| Transport | `http` | http calls a URL; file exchanges request/response files in a directory |
| Method | `POST` | POST carries the envelope in the request body |
| URL | `http://127.0.0.1:8787/echo` | where the peer listens; `--port` overrides 8787 |
| Timeout (ms) | `10000` | optional; empty keeps the 30000 default |
| Description | `Echo peer over http (ElectroLab external-tool manual test): returns every parameter it receives, verbatim` | what the agent reads to decide when to call the tool |
| Enabled | on | a disabled declaration is kept but not registered |

Parameters — click **Add parameter** once per row:

| Name | Type | Required | Other fields |
|---|---|---|---|
| `message` | string | yes | Description: `a text echoed back verbatim` |
| `values` | array | no | Array items: `quantity` · Quantity kind: `none` · Description: `values echoed back verbatim` |
| `flag` | boolean | no | Description: `a boolean echoed back verbatim` |

`agentDeclaration`:

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

| Dialog field | Enter | Note |
|---|---|---|
| Name | `echo_file` | the tool name the agent will call; starts lowercase, `a-z0-9_` only |
| Transport | `file` | http calls a URL; file exchanges request/response files in a directory |
| Directory | `C:/elab-inbox` | the directory passed to the peer; the host writes `in.<id>.json` there |
| Poll interval (ms) | `200` | optional; empty keeps the 200 default |
| Request / Response file prefix | (empty) | empty keeps the `in` / `out` defaults |
| Timeout (ms) | `10000` | optional; empty keeps the 30000 default |
| Description | `Echo peer over file transport (ElectroLab external-tool manual test): returns every parameter it receives, verbatim` | what the agent reads to decide when to call the tool |
| Enabled | on | a disabled declaration is kept but not registered |

Parameters — click **Add parameter** once per row:

| Name | Type | Required | Other fields |
|---|---|---|---|
| `message` | string | yes | Description: `a text echoed back verbatim` |
| `values` | array | no | Array items: `quantity` · Quantity kind: `none` · Description: `values echoed back verbatim` |
| `flag` | boolean | no | Description: `a boolean echoed back verbatim` |

`agentDeclaration`:

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
