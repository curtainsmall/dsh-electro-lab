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

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [tools.md](docs/tools.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

MIT © 2026 curtainsmall
