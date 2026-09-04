# DeepSeek Harness ElectroLab

An electrical & electronics calculation plugin for the DeepSeek Harness.

[English](README.md) | [简体中文](docs/README.zh-CN.md)

## Install

```sh
dsh plugin --profile web add dsh-electro-lab
```

## ElectroLab Mode

The plugin works as an agent preset: pick **ElectroLab Mode** when starting a session and ask any electrical or electronics calculation question in plain language. The session is isolated to the plugin's calculation tools — no shell, no file system, no network — so every number in the answer comes from a tool call result, and the agent stops and asks when the conditions are insufficient.

The toolset covers circuit, signal and electronics math with complex numbers, exact unit handling, and solutions that always carry their verification. Tools are invoked by the agent, not typed by you — you describe the problem, it picks the tool, feeds it the conditions, and reports the result. See [tools.md](docs/tools.md).

Every solve is settled to disk and browsable in the client panel: inspect the full record, export it, or delete it. One click turns any settled record into a full technical article through the host LLM and saves it to disk. The article can be generated in two formats:

| Format | Description |
|---|---|
| Markdown | plain article text, readable and editable anywhere |
| LaTeX | XeLaTeX typesetting source, with optional PDF compilation |

## External tools

Beyond the built-in toolset you can register your own calculation tools, reached over an **http** or **file** transport. A declaration (name, description, parameters, transport options) lives in `~/.dsh-electro-lab/external-tools.jsonl`; at plugin start every enabled declaration is compiled into a real tool the agent can call, so changes apply after a host restart. Register through the manager tools (`external_tool_add` / `external_tool_update` / `external_tool_delete`) or the **External tools** tab of the Records panel, which also edits, enables/disables and deletes declarations.

[`external-tool-example/`](external-tool-example/README.md) is an independent npm project with manual test counterparts for this feature — `node src/echo.ts http` / `file` echoes the envelope protocol back end to end.

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [tools.md](docs/tools.md)
- [external-tool-example](external-tool-example/README.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

MIT © 2026 curtainsmall
