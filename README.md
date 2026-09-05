# DeepSeek Harness ElectroLab

An electrical & electronics calculation plugin for the DeepSeek Harness.

[简体中文](README.zh-CN.md)

## Install

```sh
dsh plugin --profile web add dsh-electro-lab
```

## ElectroLab Mode

The plugin works as an agent preset: pick **ElectroLab Mode** when starting a session and ask any electrical or electronics calculation question in plain language. The session is isolated to the plugin's tools — no shell, no file system, no network — so every number in the answer comes from the state machine, and the agent stops and asks when the conditions are insufficient.

All calculation happens inside a deterministic **state machine**. The agent operates it through three primitives — `set` (write a typed value into a slot), `get` (read a slot) and `call` (run one of 38 math functions and store the result) — bracketed by the record markers `record_question` / `record_analyse` / `record_answer`. Typed values carry their own kind, variant and prefix (e.g. `{type: "number", value: 25, kind: "temperature", variant: "degC"}`); the state machine stores them as given and performs SI and unit conversion only at calculation boundaries. Every step lands in a per-record trace file, so each solve is a reproducible process that can be replayed without re-computing.

The function catalog covers expression algebra, series, transfer functions, DSP/DFT, signal quality (THD, jitter, ADC budget), circuits (impedance, resonance, transients, AC power), electronics (op-amps, dividers, LED), RF & Smith chart (reflection, matching networks), transmission lines, noise, and filter design. See the [state machine manual](docs/tools.md).

Settled records are listed in the client panel's **Records** tab (indexed from `record-index.jsonl`, refreshed every 5 s); incomplete records are marked as such. Record bodies are process traces under `~/.dsh-electro-lab/records/`.

## External functions

Beyond the built-in functions you can register your own calculation functions, reached over an **http** or **file** transport. A declaration (name, description, parameters, an explicit **returns** shape, transport options) lives in `~/.dsh-electro-lab/external-tools.jsonl`; at state machine start every enabled declaration is registered as an external function, so changes apply after a host restart. Register through the manager tools (`external_tool_add` / `external_tool_update` / `external_tool_delete`) or the **External tools** tab of the Records panel, which also edits, enables/disables and deletes declarations. The wire protocol is a typed envelope: `{requestId, args}` → `{requestId, result}` (typed value, `null` for void) or `{requestId, error}` — POST only, typed values only, no symbols across the wire.

[`external-tool-example/`](external-tool-example/README.md) is an independent npm project with manual test counterparts for this feature — `node src/echo.ts http` / `file` echoes the envelope protocol back end to end.

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [State machine manual](docs/tools.md) (also in [简体中文](docs/tools.zh-CN.md))
- [external-tool-example](external-tool-example/README.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

MIT © 2026 curtainsmall
