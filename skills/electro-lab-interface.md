---
name: electro-lab-interface
description: "ElectroLab engine manual: typed values, the set/get/call primitives, receipts and errors, the solver catalog — independent of any answer protocol"
whenToUse: "Any session that operates the ElectroLab engine (set/get/call, record markers)"
---

# DeepSeek Harness ElectroLab — Engine Manual

All calculation happens inside one deterministic engine. You operate it with three primitives and the record markers; the engine keeps a variable table, converts values at calculation boundaries and records every step. You never parse text into numbers and never convert units yourself — you pass typed values and the engine resolves everything against the solver signatures.

## Typed values

A typed value is a JSON object. kind is part of a quantity:

- `{ "type": "number", "value": 25, "kind": "temperature", "variant": "degC" }`
- `{ "type": "number", "value": 1500, "kind": "resistance", "prefix": "kilo" }`
- `{ "type": "complex", "value": { "re": 1, "im": 2 } | { "mag": 3, "ang": 0.5 }, "kind": "voltage" }` (angles in radians)
- `{ "type": "string", "value": "…" }`, `{ "type": "boolean", "value": true }`
- `{ "type": "array", "value": [<typed values>] }`, `{ "type": "object", "value": { <field>: <typed value> } }`
- `{ "type": "slot", "value": "name" }` — a slot reference (call arguments only; never stored or returned)

kind names: time, frequency, resistance, capacitance, inductance, voltage, current, power, temperature, angle, pressure, energy, length, mass, log, none, … A bare number is kind `none`; log is a plain ratio. Omit the variant field for the SI base representation; omit prefix for multiplier 1.

variant words: degC/degF (temperature), deg (angle), bar/psi/atm (pressure), cal/Wh (energy), hp (power), inch/foot/yard/mile (length), lb/oz (mass). prefix words: pico/nano/micro/milli/kilo/mega/giga/tera. A prefix is only valid without a variant. Words are ASCII; symbols never enter values.

## Primitives

- `set { name, value }` — write one slot. `value: null` deletes the slot (idempotent). Re-writing with a different kind than the pinned slot kind fails.
- `get { name }` — read one slot; you receive the value exactly as written.
- `call { solver, args, target }` — call one registered solver. Every argument is a typed value or a slot reference — `{ "type": "slot", "value": "name" }` with the full slot path (`"name"` or `"name.field"`). A value solver requires a named `target` (overwriting bumps the slot revision); a void solver takes `target: null`.
- `solver_info { solver }` — inspect one registered solver before its first use: the parameter signature (names, quantity kinds, allowed enums, optional flags, nested items) and `returns` (a spec, or null for void), straight from the registry.

Every call returns a receipt: `{ ok: true, … }` or `{ ok: false, code, error }`. Failed calls have no side effects; read values only through `get`. Read `solver_info` before the first call of a solver you have not used — guessing parameters from the one-line catalog is how retries happen.

## Record markers

- `record_question { text }` — open a record (table cleared). A re-open seals the previous record as duplicate-start.
- `record_analyse { text }` — the analysis: knowns and the approach with formulas. No computed numbers here.
- `record_answer { text }` — the final answer; seals the record.

Conditions from the question are stored with `set` as typed values (translate the user's wording into typed values yourself — transcription, not calculation). Computed numbers appear only after the `call` that produced them; answers quote slot values or `get` results.

## Solver catalog

| solver | purpose |
|---|---|
| `ac_power` | AC power from RMS values: apparent = V·I, real = apparent·cosφ, reactive = apparent·sinφ, powerFactor = cosφ; phaseAngle (radians) is the V–I phase angle |
| `adc_budget` | ADC noise budget: quantization, jitter and optional thermal SNR into a total SNR and ENOB |
| `bode_response` | Bode plot of a ratio-form transfer function on a logarithmic frequency grid |
| `calculate` | Evaluate a string math expression and return the complex result |
| `cascade_noise_figure` | Total noise figure of cascaded stages (Friis) from per-stage noise figures and gains in dB |
| `circuit_impedance` | Total driving-point impedance of a nested series/parallel network at a frequency (network as JSON text of a tree of element leaves and groups) |
| `coaxial_parameters` | Coaxial-line characterization from geometry (impedance, velocity factor, per-meter C and L) |
| `difference_equation_response` | Difference-equation recursion output y[n] (Laurent a/b convention) |
| `discrete_fourier_transform` | DFT of a complex sample sequence (optionally windowed) |
| `equivalent_impedance` | Total impedance of a set of impedances combined in series or parallel |
| `filter_design` | Butterworth low-pass ladder design with attenuation checks |
| `fourier_series_coefficients` | Fourier series coefficients (a₀, aₙ, bₙ) of standard waveforms |
| `impedance_to_reflection` | Reflection coefficient Γ = (Z − Z0)/(Z + Z0) |
| `inverse_discrete_fourier_transform` | IDFT of a spectrum (round-trip of the DFT) |
| `jitter_snr` | SNR ceiling set by sampling-clock jitter |
| `led_resistor` | LED series resistor and its dissipation |
| `matched_network` | Matching network between two real resistances (l/pi/t) |
| `opamp_configurations` | Ideal op-amp gain and output for inverting/non-inverting/follower/difference/integrator/differentiator |
| `partial_fraction` | Partial-fraction expansion of a ratio-form transfer function |
| `poles_zeros` | Poles and zeros of a ratio-form transfer function |
| `power_series_expansion` | Power-series expansion of a z-domain transfer function (impulse response) |
| `quantization_noise` | Ideal SNR of a uniform quantizer in dB |
| `quarter_wave_transformer` | Quarter-wave transformer characteristic impedance |
| `rational_coefficients` | Expression → rational numerator/denominator coefficients |
| `reflection_to_vswr` | VSWR from a reflection coefficient (|Γ| = 1 throws: no infinity in the value universe) |
| `resonance` | Series/parallel LC resonance: frequency, Q, bandwidth |
| `return_loss` | Return loss in dB from a reflection coefficient (|Γ| = 0 throws: no infinity) |
| `rise_time_bandwidth` | tr ≈ 0.35/BW conversion |
| `series_sum` | Arithmetic/geometric/power sums |
| `signal_analysis` | Statistics (RMS/peak/DC) plus the windowed spectrum |
| `step_response` | Step response of a continuous transfer function |
| `thd` | Total harmonic distortion of a sampled signal |
| `thermal_noise` | Thermal noise power k·T·B |
| `time_constant` | τ = RC or τ = L/R and the cutoff frequency |
| `transfer_function_response` | Transfer function at frequency points (s or z) |
| `transient_response` | First-/second-order transients at a list of time points |
| `voltage_divider` | Resistive divider with optional load (plus Thévenin output resistance) |
| `wavelength_frequency` | Wavelength from frequency (velocity factor aware) |

## Discipline

- Numbers in an answer ⇔ slot values produced by `call` results (or conditions stored by `set`).
- Transcription of user wording into typed values is yours; every numerical rule application (prefix, variant, complex conversion) happens inside the engine at the call boundary — never convert in prose or in arguments by hand.
- A failed receipt (`ok: false`) leaves no state behind: read the code, fix the call, retry.
