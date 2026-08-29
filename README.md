# DeepSeek Harness ElectroLab

An electrical & electronics calculation plugin for the DeepSeek Harness: circuit analysis, transients, filters, signal quality, noise and unit conversion — every value a self-describing complex object in SI base units.

[English](README.md) | [简体中文](docs/README.zh-CN.md)

## Features

- **ElectroLab Mode** — the **ElectroLab 模式** agent preset isolates the session to the plugin's calculation tools: no shell, no file system, no network.
- **Calculations you can trust** — every number comes from a tool call result, never from memory or hand arithmetic.
- **Records for inspection** — every five-step solve is settled to disk and browsable in the client panel.

All tools are listed in [tools.md](docs/tools.md).

## Install

```sh
dsh plugin --profile web add dsh-electro-lab
```

Published on npm — stable releases on the `latest` dist-tag, prereleases on `beta`.

## Usage

The plugin registers its tools, skills and the **ElectroLab 模式** agent preset on mount. Pick the preset when starting a session: all numeric values must come from tool calls, and the preset stops when conditions are insufficient.

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [tools.md](docs/tools.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

MIT © 2026 curtainsmall
