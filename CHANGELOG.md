# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-29

### Added

- Client **Records** panel: a sidebar nav entry toggles a panel listing every settled record across all sessions, read through the same-origin endpoint `/api/dsh-electro-lab/records` (polled every 5 s).
- Records are stored as **one immutable JSONL line per settle** in `~/.dsh-electro-lab/records.jsonl` (outside `$DSH_HOME`; override with `DSH_ELECTRO_LAB_HOME`), surviving session deletion and restarts; an interrupted open record is persisted to `open-record.json` and restored by the constructor on restart. Records are built from sessions but never feed back into them.
- Five-step answer template (question, analysis with formulas, tool calls, results, answer) in the template skill and the packaged preset persona; the record schema mirrors it — `question`/`analyse`/`answer` paragraphs plus structured `calls`/`results` arrays (raw arguments JSON, full outputs, error identity).

### Changed

- **Record protocol**: `record_question` opens a record and submits the question, `record_analyse` submits the analysis, `record_answer` submits the answer and settles. Only bracketed content is recorded; the marker calls never appear in `calls`. Disorder semantics keep error records with data preserved (`duplicate-start`, `duplicate-end`, `incomplete`); a merged five-part template in the answer text is split into the fields automatically. The RecordManager owns all record state (JSONL archive + open snapshot), reads the real dsh-session event shapes, and the plugin mounts once.

### Removed

- The interactive Smith chart and the session-header button from the client (the impedance/reflection math remains available through the RF tools).

## [0.4.0] - 2026-08-28

### Added

- `series_sum` — arithmetic, geometric (finite or convergent infinite) and power sums (Σk, Σk², Σk³) selected by a `kind` discriminator.
- Signal-quality tools: `thd` (total harmonic distortion from sampled signals, spectral-folding aware), `jitter_snr` (clock-jitter SNR ceiling −20·log₁₀(2π·f·tⱼ)) and the `adc_budget` combo (quantization + jitter + thermal noise → total SNR and ENOB).

### Changed

- Unit conversion is now the `convert` primitive: per-family math functions (temperature affine, real only; pressure/energy/power/length/mass/angle linear, complex-capable; log ratio ↔ dB) dispatched by one tool through an O(1) family lookup. Angle conversion is degree → radian only — angles are always radians.
- Ratio kinds renamed `power`/`voltage` → `linear`/`quadratic` (10·log₁₀ vs 20·log₁₀), keeping the log conversion general outside any electronics context.
- npm publishing uses OIDC trusted publishing exclusively — the `NPM_TOKEN` fallback is removed.

### Removed

- `convert_unit` — superseded by `convert` (same families, plus ratio ↔ dB).
- `db_convert` and `decibel_ratio`, along with the dB level-unit layer (W/dBm/dBW/V/dBu/dBµV references) — level conversion adds no algorithm beyond a series of `convert` calls; `thermal_noise` returns watts only.

## [0.3.0] - 2026-08-26

### Removed

- `series_impedance` and `parallel_impedance` merge into `equivalent_impedance` — combine a set of complex impedances with a `topology` discriminator (`series` | `parallel`).

## [0.2.0] - 2026-08-26

### Added

- Series-RLC transient: `transient_response` now accepts kind `rlc` (resistance + inductance + capacitance) and returns the full second-order charge/discharge curve — closed form by damping regime (underdamped / critical / overdamped, ζ = (R/2)·√(C/L)) with alpha, omega0, dampingRatio and damping metadata, honoring both initial conditions (capacitor voltage, inductor current).

### Removed

- Redundant single-point primitives, superseded by existing tools: `rc_transient` and `rl_transient` (use `transient_response` with `times: [t]`), `element_impedance` (use `circuit_impedance` with a leaf node), `window_function` (the window is applied by `discrete_fourier_transform` / `signal_analysis` directly).

## [0.1.1] - 2026-08-26

### Changed

- GitHub Release bodies now carry the matching `CHANGELOG.md` entry instead of the bare tag name (read with the guard-verified version; validation stays in the guard).

## [0.1.0] - 2026-08-26

### Added

- DSH host plugin mounting ElectroLab: calculation tools, packaged skills, and the `electro-lab` agent preset (synced into the DSH user preset root on apply).
- Expression engine with complex-number arithmetic, inverse trigonometric functions `asin`/`acos`/`atan` (complex domain), two-argument `atan2(y, x) = arg(x + j·y)`, and symbol bindings.
- Transfer-function core: `rational_coefficients` ratio form with symbol bindings, poles/zeros, partial fractions, frequency (Bode) and step responses, z-domain power-series expansion.
- Digital signal processing: DFT/IDFT (radix-2 FFT with direct-sum fallback), Fourier series, window functions, difference equations, signal statistics.
- Circuit tools: driving-point impedance of nested networks, L/π/T matching networks, Butterworth low-pass ladder design, RC/RL transient curves, LC resonance.
- Electronics tools: op-amp configurations, voltage dividers, LED series resistors, time constants, transmission-line primitives (wavelength/frequency, coaxial characterization, quarter-wave transformer, rise time/bandwidth), reflection coefficient/VSWR/return loss.
- Noise and dB tools: thermal noise, Friis cascade noise figure, quantization SNR, dB level conversions (dBm/dBu/dBµV/dBW) and power/voltage ratio conversions.
- Unit conversion: `convert_unit` maps common non-SI units to their SI base quantities — temperature (°C/°F → K), pressure (bar/psi/atm → Pa), energy (cal/kWh → J), power (hp → W), length (inch/mile → m), mass (lb/oz → kg).
- `solve_steps` multi-step solver with `@stepN` result references and nested field paths.
- Client UI: panel and interactive Smith chart.
- Packaged skills and preset: `electro-lab-template` (mandatory five-part answer template) and `electro-lab-interface` (toolset interface); the preset persona gates every request before any tool call — missing conditions stop with no tool call.
- CI: typecheck/test/build on pull requests and `develop` pushes; release workflow guards that a `v*` tag is on `main` and consistent across `package.json`, `dsh.plugin.json` and the latest `CHANGELOG.md` entry, publishes to npm (OIDC trusted publishing with `NPM_TOKEN` fallback; prereleases on the `beta` dist-tag) and creates a GitHub Release.
- Documentation: dual-language README and contributing guide (en-US + zh-CN).

### Changed

- Tool surface normalized to SI quantity naming: arguments and outputs are named by quantity instead of by unit for SI quantities (`phaseAngle`, `phase`, `snr`, `returnLoss`…), while dB quantities keep the `Db` suffix (`noiseFigureDb`, `gainDb`, `magnitudeDb`, `returnLossDb`…) — dB is a log scale that can represent values beyond the linear number range, so it is not implied by the kind. Units stay documented in the descriptions and in the value `kind`.
- Angles are radians everywhere on the tool boundary (SI): the polar value form carries `angRad` only, `ac_power.phaseAngle` and the Bode `phase` output are in radians.

## [0.1.0-beta.1] - 2026-08-26

### Added

- First public beta of ElectroLab: the complete feature set listed under [0.1.0] above, published to npm under the `beta` dist-tag.

[0.5.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.5.0
[0.4.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.4.0
[0.3.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.3.0
[0.2.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.2.0
[0.1.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.1
[0.1.0-beta.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0-beta.1
[0.1.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0
