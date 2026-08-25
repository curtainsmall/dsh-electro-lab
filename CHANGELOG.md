# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-26

### Added

- DSH host plugin mounting the ElectroLab workbench: calculation tools, packaged skills, and the `electro-lab` agent preset (synced into the DSH user preset root on apply).
- Expression engine with complex-number arithmetic, inverse trigonometric functions `asin`/`acos`/`atan` (complex domain), two-argument `atan2(y, x) = arg(x + j·y)`, and symbol bindings.
- Transfer-function core: `rational_coefficients` ratio form with symbol bindings, poles/zeros, partial fractions, frequency (Bode) and step responses, z-domain power-series expansion.
- Digital signal processing: DFT/IDFT (radix-2 FFT with direct-sum fallback), Fourier series, window functions, difference equations, signal statistics.
- Circuit tools: driving-point impedance of nested networks, L/π/T matching networks, Butterworth low-pass ladder design, RC/RL transient curves, LC resonance.
- Electronics tools: op-amp configurations, voltage dividers, LED series resistors, time constants, transmission-line primitives (wavelength/frequency, coaxial characterization, quarter-wave transformer, rise time/bandwidth), reflection coefficient/VSWR/return loss.
- Noise and dB tools: thermal noise, Friis cascade noise figure, quantization SNR, dB level conversions (dBm/dBu/dBµV/dBW) and power/voltage ratio conversions.
- `solve_steps` multi-step solver with `@stepN` result references and nested field paths.
- Client UI: workbench panel and interactive Smith chart.
- Packaged skills and preset: `electro-lab-template` (mandatory five-part answer template) and `electro-lab-interface` (toolset interface); the preset persona gates every request before any tool call — missing conditions stop with no tool call, textbook defaults are never assumed.
- CI: typecheck/test/build on pull requests and `develop` pushes; release workflow that verifies a `v*` tag sits on `main` and matches `package.json` version, then publishes to npm.

[0.1.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0
