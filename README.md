# dsh-electro-lab

**ElectroLab** — a DeepSeek Harness plugin for electrical & electronics problem solving.

[English](README.md) | [简体中文](docs/README.zh-CN.md)

## Features

- **Calculation engine** — expression evaluation with complex numbers (`calculate`, `rational_coefficients`), inverse trigonometric functions and two-argument `atan2`.
- **Transfer-function core** — poles/zeros, partial fractions, Bode and step responses, z-domain power-series expansion.
- **Digital signal processing** — DFT/IDFT (radix-2 FFT), Fourier series, window functions, difference equations, signal statistics.
- **Circuit tools** — nested-network impedance, L/π/T matching networks, Butterworth filter design, RC/RL transients, resonance.
- **Electronics tools** — op-amp configurations, voltage dividers, LED resistors, time constants, transmission-line primitives (coaxial, quarter-wave transformer, rise time/bandwidth), reflection coefficient/VSWR/return loss.
- **Noise & dB** — thermal noise, Friis cascade, quantization SNR, dB level and ratio conversions.
- **`solve_steps`** — multi-step solver chaining tool results with `@stepN` references.
- **Client UI** — workbench panel and interactive Smith chart.
- **Packaged agent preset & skills** — the `electro-lab` preset gates every request before any tool call; skills `electro-lab-template` and `electro-lab-interface` ship with the plugin.

## Install

```sh
dsh plugin --profile web add dsh-electro-lab
```

Published on npm — stable releases on the `latest` dist-tag, prereleases on `beta`.

## Usage

The plugin registers its tools, skills, and the `electro-lab` agent preset on mount. Pick the preset when starting a session: all numeric values must come from tool calls, and the preset stops when conditions are insufficient.

## Development

See [Contributing](.github/CONTRIBUTING.md) for the development setup, commit conventions, and release process.

## Docs

- [Contributing](.github/CONTRIBUTING.md)
- [简体中文](docs/README.zh-CN.md)

## License

MIT © 2026 curtainsmall
