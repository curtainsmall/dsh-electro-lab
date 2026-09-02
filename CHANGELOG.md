# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2026-09-02

### Added

- Cross-platform Open file / Open directory: the launcher follows the host's OS — explorer.exe on Windows, `open` with `-R` reveal on macOS, xdg-open on Linux (reveal opens the containing folder, since xdg-open has no select). Previously non-Windows returned "not supported on this platform".
- Spawn error detection: a missing opener binary (ENOENT, with a `/usr/bin` fallback for xdg-open) or a nonexistent target path is now reported to the client instead of silently succeeding.

## [0.8.0] - 2026-09-02

### Added

- Article generation through the host LLM: the record detail page gains a Generate action; the setup dialog picks the output directory through a host-driven lazy directory browser (pure HTTP — works locally and remotely), the file name (default `electro-lab-<record-id>.md`) and the article language; the host writes a proper technical article (exact H1/author line, H2 section headings, formulas and calculations on their own lines, numbers only from tool outputs) to disk.
- Explicit article language in the generation setup: follow the question (default), Simplified Chinese, or English — a forced language is pinned in both the system and the user prompt; the choice is remembered together with the output directory (state.json, migrated from the legacy plain-text file).
- Progress dialog with stage text and an elapsed timer, cancel while running, and Open file (default application) / Open directory (Explorer reveal) actions on completion.
- Minimizable generation progress: the dialog collapses into a corner status pill (running / done / error) that survives any navigation — the records list, the session chat, even closing the panel. Generation state lives in a module-level client store rendered in a body-level overlay root, so the job keeps polling and stays visible anywhere.
- Fixed-size (380×190) progress dialog with both-axis centered content; generation errors display in the same dialog; the setup dialog shows inline validation for an empty output directory.
- Unified dialog shell and button language across the records page: a right action rail starting at the title row, an inline SVG icon set (no emoji or system glyphs), and reusable ghost/primary button components.
- Cross-panel center-column eviction: opening ElectroLab closes the SSH and task-board views and their controllers (and vice versa).

## [0.7.0] - 2026-08-30

### Added

- Markdown export of a record (save-file picker with a download fallback): a localized H1, the id and timestamps as separate paragraphs, the five steps as unnumbered H2 sections, and each tool call as an H3 block with `Parameters` / `Result` H4 headings — value objects render in compact mathematical notation (`100 Ω`, `100 + 25j Ω`, `1 ∠ 0 rad`) and the outermost JSON braces are dropped.
- Compact mathematical display for value objects in the records page: rect/polar inputs and serialized outputs (`{re, im, kind, …}`) render as one math line with the unit from `kind` and no expansion; numbers use standard notation (6 significant digits, scientific for extreme magnitudes).
- Tool calls and results merged into one collapsible panel per call in the detail page (name → parameters → result); strings that embed JSON unwrap into trees.
- Record cards show the record id beneath the title (11 px monospace).
- Multi-select mode: a select button toggles selection of settled records — selected cards get the accent border plus a tint heavier than hover; a delete button batch-deletes the selection through a confirm dialog.
- Visible scrollbars in both themes (label-colored thumbs with the padding-box rounding trick) now that the page-level blur root cause is gone.
- Persona hard rules: value parameters must be value objects, never stringified JSON or bare numbers; the model must read the electro-lab-template skill before any tool call; `record_analyse` must precede the first calculation tool and hold only the conditions and the approach — every computed value belongs in `record_answer`.

### Changed

- The in-chat five-part template is dropped — records carry the structure, the chat answer stays natural; the template skill is now the record protocol.
- Circuit network leaves are complex value objects (`{form, re, im, kind}` with kind `resistance` | `inductance` | `capacitance`); the bare-number `{kind, value}` leaf DSL is rejected by validation.
- Records page polish: the Config tab and the header hint are gone (a single tab remains, styled like the dsh-ssh panel tabs); record cards are borderless ghosts that highlight only their border on hover; buttons and hover borders use solid label colors visible in both themes.
- Exported blocks switch from `json` to `text` fences, since value objects are rendered as math lines rather than raw JSON.

### Removed

- The single-record delete button on cards — batch delete covers deletion.

## [0.6.0] - 2026-08-29

### Added

- Dual-language UI: every panel and records-page string moves into zh/en dictionaries registered into the DSH locale service; components re-render when the user switches language.
- Collapsible result panels in the detail page, matching the tool-call sections: one panel per result (titled by the matching call), outputs as a recursive collapsible JSON tree when parseable.
- Record error messages translate with the UI; error codes and tool error identifiers stay raw.

### Changed

- The angle key is `ang` everywhere — input and output — since the phase angle is always radians (SI); the old `angRad` name is gone.
- The preset persona and skills no longer force Simplified Chinese — the model follows the user language.

## [0.5.1] - 2026-08-29

### Added

- Record detail as a tab-covering page: a back header with the record title, id and timestamps, a left table of contents that jumps to each section heading, and ONE shared scroll area where the five part headings stick to the top while scrolling (plain text only, no nested scrollbars).
- Collapsible tool-call panels in the detail page: one panel per call (expanded by default), arguments rendered as a recursive collapsible JSON tree.

### Changed

- Detail texts use the session-chat font size; id/timestamps, the table of contents and the record-card title/timestamp use the navbar size. The back-to-record button matches the back-to-session button, with the title on its own line beneath; the panel back button now reads 返回会话.

## [0.5.0] - 2026-08-29

### Added

- Client **Records** panel: a sidebar nav entry toggles a panel listing every settled record across all sessions, read through the same-origin endpoint `/api/dsh-electro-lab/records` (polled every 5 s).
- Records are stored as **one immutable JSONL line per settle** in `~/.dsh-electro-lab/records.jsonl` (outside `$DSH_HOME`; override with `DSH_ELECTRO_LAB_HOME`), surviving session deletion and restarts; an interrupted open record is persisted to `open-record.json` and restored by the constructor on restart. Records are built from sessions but never feed back into them.
- Five-step answer template (question, analysis with formulas, tool calls, results, answer) in the template skill and the packaged preset persona; the record schema mirrors it — `question`/`analyse`/`answer` paragraphs plus structured `calls`/`results` arrays (raw arguments JSON, full outputs, error identity).
- Record deletion: the endpoint serves DELETE ?id= to remove one settled record (the JSONL archive is rewritten without it), confirmed through a themed popup dialog (works in embedded webviews).
- The panel and records page use the dsw theme tokens (same system as the SSH panel), so they follow light/dark themes and skins; record cards highlight on hover, titles stay on one truncated line with an ellipsis, and the expanded card shows the full five steps in a grid.

### Changed

- **Record protocol**: `record_question` opens a record and submits the question, `record_analyse` submits the analysis, `record_answer` submits the answer and settles. Only bracketed content is recorded; the marker calls never appear in `calls`. Disorder semantics keep error records with data preserved (`duplicate-start`, `duplicate-end`, `incomplete`); a merged five-part template in the answer text is split into the fields automatically. Part-title lines are stripped from the record texts (`1. 分析（Analyse）`, `2. 计划（Plan）`, …) both when split out of a merged template and when submitted directly. The RecordManager owns all record state (JSONL archive + open snapshot), reads the real dsh-session event shapes, and the plugin mounts once.

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

- Tool surface normalized to SI quantity naming: arguments and outputs are named by quantity instead of by unit for SI quantities (`phaseAngle`, `phase`, `snr`, `returnLoss`…), while dB quantities keep the `Db` suffix (
oiseFigureDb`, `gainDb`, `magnitudeDb`, `returnLossDb`…) — dB is a log scale that can represent values beyond the linear number range, so it is not implied by the kind. Units stay documented in the descriptions and in the value `kind`.
- Angles are radians everywhere on the tool boundary (SI): the polar value form carries `angRad` only, `ac_power.phaseAngle` and the Bode `phase` output are in radians.

## [0.1.0-beta.1] - 2026-08-26

### Added

- First public beta of ElectroLab: the complete feature set listed under [0.1.0] above, published to npm under the `beta` dist-tag.

[0.8.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.8.1
[0.8.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.8.0
[0.7.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.7.0
[0.6.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.6.0
[0.5.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.5.1
[0.5.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.5.0
[0.4.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.4.0
[0.3.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.3.0
[0.2.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.2.0
[0.1.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.1
[0.1.0-beta.1]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0-beta.1
[0.1.0]: https://github.com/curtainsmall/dsh-electro-lab/releases/tag/v0.1.0
