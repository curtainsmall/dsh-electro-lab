# DeepSeek Harness ElectroLab

An electrical & electronics calculation plugin for the DeepSeek Harness: circuit analysis, transients, filters, signal quality, noise and unit conversion — every value a self-describing complex object in SI base units.

[English](README.md) | [简体中文](docs/README.zh-CN.md)

## Features

- **Calculation** — complex expression evaluation, rational-coefficient algebra and series sums.
- **Circuits** — impedance networks, matching, filters, transients and resonance.
- **Electronics** — op-amp configurations, dividers and LED drive.
- **RF & transmission** — Smith chart, reflections, matching and line parameters.
- **Signal quality** — distortion, jitter and ADC budgets.
- **Noise & dB** — noise sources and dB conversions.
- **DSP** — transforms, statistics and transfer functions.
- **Unit conversion** — any unit to any unit of the same family.
- **Workflow** — multi-step orchestration, a client panel (settled run records) and a packaged agent preset.

All tools are listed in [tools.md](docs/tools.md).

## Install

```sh
dsh plugin --profile web add dsh-electro-lab
```

Published on npm — stable releases on the `latest` dist-tag, prereleases on `beta`.

## Usage

The plugin registers its tools, skills and the `electro-lab` agent preset on mount. Pick the preset when starting a session: all numeric values must come from tool calls, and the preset stops when conditions are insufficient.

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [tools.md](docs/tools.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

MIT © 2026 curtainsmall
