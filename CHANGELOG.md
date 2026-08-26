# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-08-26

### Changed

- GitHub Release bodies now carry the matching `CHANGELOG.md` entry instead of the bare tag name (read with the guard-verified version; validation stays in the guard).

## [0.1.0] - 2026-08-26

### Added

- DSH host plugin mounting the ElectroLab workbench: calculation tools, packaged skills, and the `electro-lab` agent preset (synced into the DSH user preset root on apply).
- Expression engine with complex-number arithmetic, inverse trigonometric functions `asin`/`acos`/`atan` (complex domain), two-argument `atan2(y, x) = arg(x + j·y)`, and symbol bindings.
- Transfer-function core: `rational_coefficients` ratio form with symbol bindings, poles/zeros, partial fractions, frequency (Bode) and step responses, z-domain power-series expansion.
- Digital signal processing: DFT/IDFT (radix-2 FFT with direct-sum fallback), Fourier series, window functions, difference equations, signal statistics.
- Circuit tools: driving-point impedance of nested networks, L/π/T matching networks, Butterworth low-pass ladder design, RC/RL transient curves, LC resonance.
- Electronics tools: op-amp configurations, voltage dividers, LED series resistors, time constants, transmission-line primitives (wavelength/frequency, coaxial characterization, quarter-wave transformer, rise time/bandwidth), reflection coefficient/VSWR/return loss.
- Noise and dB tools: thermal noise, Friis cascade noise figure, quantization SNR, dB level conversions (dBm/dBu/dBµV/dBW) and power/voltage ratio conversions.
- Unit conversion: `convert_unit` maps common non-SI units to their SI base quantities — temperature (°C/°F → K), pressure (bar/psi/atm → Pa), energy (cal/kWh → J), power (hp → W), length (inch/mile → m), mass (lb/oz → kg).
- `solve_steps` multi-step solver with `@stepN` result references and nested field paths.
- Client UI: workbench panel and interactive Smith chart.
- Packaged skills and preset: `electro-lab-template` (mandatory five-part answer template) and `electro-lab-interface` (toolset interface); the preset persona gates every request before any tool call — missing conditions stop with no tool call.
- CI: typecheck/test/build on pull requests and `develop` pushes; release workflow guards that a `v*` tag is on `main` and consistent across `package.json`, `dsh.plugin.json` and the latest `CHANGELOG.md` entry, publishes to npm (OIDC trusted publishing with `NPM_TOKEN` fallback; prereleases on the `beta` dist-tag) and creates a GitHub Release.
- Documentation: dual-language README and contributing guide (en-US + zh-CN).

### Changed

- Tool surface normalized to SI quantity naming: arguments and outputs are named by quantity instead of by unit for SI quantities (`phaseAngle`, `phase`, `snr`, `returnLoss`…), while dB quantities keep the `Db` suffix (`noiseFigureDb`, `gainDb`, `magnitudeDb`, `returnLossDb`…) — dB is a log scale that can represent values beyond the linear number range, so it is not implied by the kind. Units stay documented in the descriptions and in the value `kind`.
- Angles are radians everywhere on the tool boundary (SI): the polar value form carries `angRad` only, `ac_power.phaseAngle` and the Bode `phase` output are in radians.

## [0.1.0-beta.1] - 2026-08-26

### Added

- First public beta of the ElectroLab workbench: the complete feature set listed under [0.1.0] above, published to npm under the `beta` dist-tag.

[0.1.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.1
[0.1.0-beta.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0-beta.1
[0.1.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0
