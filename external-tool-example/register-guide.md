# Registering the Example Functions

The peer must be running first (`node src/echo.ts http --port 8787` or
`node src/echo.ts file --dir <directory>`). In the plugin's Records panel
open the **External fns** tab and click **Add external fn**, then fill
the dialog with the values below. Changes apply after a host restart.

Alternatively, ask the agent in a session to register the function and paste
the tool's `agentDeclaration` JSON; the agent calls `external_fns_add`.

## echo_http

| Dialog field | Enter | Note |
|---|---|---|
| Name | `echo_http` | the fn name the agent will call; starts lowercase, `a-z0-9_` only |
| Transport | `http` | http calls a URL; file exchanges request/response files in a directory |
| Method | `POST` | the host always sends POST — the typed envelope rides the request body |
| URL | `http://127.0.0.1:8787/` | where the peer listens; `--port` overrides 8787 |
| Timeout (ms) | `10000` | optional; empty keeps the 30000 default |
| Description | `Echo peer over http (ElectroLab external-fn manual test): returns every parameter it receives, verbatim` | what the agent reads to decide when to call the fn |
| Enabled | on | a disabled declaration is kept but not registered |

Parameters — click **Add parameter** once per row:

| Name | Type | Required | Other fields |
|---|---|---|---|
| `message` | string | yes | Description: `a text echoed back verbatim` |
| `values` | array | no | Array items: `quantity` · Quantity kind: `none` · Description: `values echoed back verbatim` |
| `flag` | boolean | no | Description: `a boolean echoed back verbatim` |

Returns — the **Returns** section (required; a declaration without it never
registers): type `object`, then add one field per returned key:

| Field name | Type | Other fields |
|---|---|---|
| `message` | string | |
| `values` | array | Array items: `quantity` · Quantity kind: `none` |
| `flag` | boolean | |

`agentDeclaration`:

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

| Dialog field | Enter | Note |
|---|---|---|
| Name | `echo_file` | the fn name the agent will call; starts lowercase, `a-z0-9_` only |
| Transport | `file` | http calls a URL; file exchanges request/response files in a directory |
| Directory | `C:/elab-inbox` | the directory passed to the peer; the host writes `in.<id>.json` there |
| Poll interval (ms) | `200` | optional; empty keeps the 200 default |
| Request / Response file prefix | (empty) | empty keeps the `in` / `out` defaults |
| Timeout (ms) | `10000` | optional; empty keeps the 30000 default |
| Description | `Echo peer over file transport (ElectroLab external-fn manual test): returns every parameter it receives, verbatim` | what the agent reads to decide when to call the fn |
| Enabled | on | a disabled declaration is kept but not registered |

Parameters and Returns: the same rows as `echo_http` above.

`agentDeclaration`:

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

## The wire protocol, at a glance

```
request:  { "requestId": "…", "args": { "message": { "type": "string", "value": "hi" }, … } }
response: { "requestId": "…", "result": { "type": "object", "value": { "message": { "type": "string", "value": "hi" }, … } } }
failure:  { "requestId": "…", "error": "…" }
```

The peer echoes every argument back as a typed value inside an object
result; values that are not typed values are wrapped as strings. See
[`docs/tools.md`](../docs/tools.md) for the full protocol.
