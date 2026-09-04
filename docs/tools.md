# Tool Catalog

All tools of the DeepSeek Harness ElectroLab plugin, grouped by domain. Every tool speaks the same value contract: a value parameter is a bare number (a real value) or a compact complex object — `{re, im}` (rectangular) or `{mag, ang}` (polar, angles in radians). Every parameter declaration pins its quantity kind. Outputs are `{re, im, kind, mag, ang}` snapshots in SI base units. ✅ marks combination tools that orchestrate several math kernels in one call.

[简体中文](tools.zh-CN.md)

## Expression & algebra

| Tool | Purpose |
|---|---|
| `calculate` | Complex expression evaluation (arithmetic, functions, symbol bindings) |
| `rational_coefficients` | Expression → rational numerator/denominator coefficient pair |

## Series sums

| Tool | Purpose |
|---|---|
| `series_sum` | Arithmetic, geometric (finite or convergent infinite) and power sums (Σk, Σk², Σk³) |

## Transfer functions & frequency domain

| Tool | Purpose |
|---|---|
| `poles_zeros` | Poles and zeros of a transfer function |
| `partial_fraction` | Partial-fraction expansion with polynomial part |
| `transfer_function_response` | Transfer function evaluated at frequency points |
| `step_response` | Step response in the s domain |
| `difference_equation_response` | Difference-equation recursion (Laurent a/b convention) |
| ✅ `bode_response` | Logarithmic grid + response + dB/phase conversion in one call |
| `power_series_expansion` | z⁻¹ series of a ratio = impulse response h[n] |

## Digital signal processing

| Tool | Purpose |
|---|---|
| `discrete_fourier_transform` | DFT (radix-2 FFT with direct-sum fallback), window applied internally |
| `inverse_discrete_fourier_transform` | IDFT via conjugation |
| `fourier_series_coefficients` | Coefficients of standard periodic waveforms |
| ✅ `signal_analysis` | Statistics (RMS/peak/DC) + windowed spectrum in one call |

## Signal quality

| Tool | Purpose |
|---|---|
| `thd` | Total harmonic distortion from sampled signals (spectral folding aware) |
| `jitter_snr` | Clock-jitter SNR ceiling: −20·log10(2π·f·tⱼ) |
| ✅ `adc_budget` | Quantization + jitter + thermal noise → total SNR and ENOB |

## Circuits

| Tool | Purpose |
|---|---|
| `equivalent_impedance` | Combine complex impedances in series or parallel |
| ✅ `circuit_impedance` | Driving-point impedance of a nested network tree |
| `resonance` | LC resonance: f₀, Q, bandwidth |
| `ac_power` | Apparent / real / reactive power and power factor |
| ✅ `transient_response` | First-/second-order transients (rc/rl/rlc kinds, damping regimes) |

## Electronics

| Tool | Purpose |
|---|---|
| ✅ `opamp_configurations` | Seven ideal op-amp configurations (per-configuration dispatch) |
| `time_constant` | τ = RC or L/R with cutoff frequency |
| `voltage_divider` | Resistive divider, loaded or unloaded |
| `led_resistor` | LED series resistor with dissipated power |

## RF & Smith chart

| Tool | Purpose |
|---|---|
| `impedance_to_reflection` | Impedance → reflection coefficient Γ |
| `reflection_to_vswr` | Γ → VSWR |
| `return_loss` | Γ → return loss in dB |
| `quarter_wave_transformer` | Z1 = √(Z0·ZL) |
| ✅ `matched_network` | L/π/T matching networks with reactance→L/C conversions |

## Transmission lines

| Tool | Purpose |
|---|---|
| `wavelength_frequency` | λ = c·vf/f |
| `coaxial_parameters` | Coaxial-line impedance, velocity factor, C′/L′ per metre |
| `rise_time_bandwidth` | tr ≈ 0.35/BW conversion |

## Noise

| Tool | Purpose |
|---|---|
| `thermal_noise` | Johnson noise power k·T·B (W) |
| `cascade_noise_figure` | Friis cascade of stages |
| `quantization_noise` | Ideal quantizer SNR: 6.02·N + 1.76 dB |

## Filters

| Tool | Purpose |
|---|---|
| ✅ `filter_design` | Butterworth low-pass ladder design with attenuation checks |

## Unit conversion

| Tool | Purpose |
|---|---|
| `convert_unit` | Convert a value to any unit of the same family (°C/°F/K, bar/psi/atm/Pa, cal/kWh/J, hp/W, inch/mile/m, lb/oz/kg, degree→radian, ratio ↔ dB) |

## Text ↔ value codec

| Tool | Purpose |
|---|---|
| `parse_value` | Parse a text quantity into the canonical value payload in SI base units: SI prefixes p…T, units (Hz, Ω/ohm, F, H, V, A, W, s, rad, °/deg, K, °C, °F, dB), complex `1+2j` and polar `3 ∠ 0.5` |
| `format_value` | Render a value payload as text: engineering prefix (auto/none/explicit) and unit by kind, e.g. `0.1 F` → `100 mF`, `1 + 2j Ω`, `3 ∠ 0.5 rad V` |

## Orchestration

| Tool | Purpose |
|---|---|
| `solve_steps` | Meta-tool: runs a chain of steps serially with `@stepN` references |

## Records

| Tool | Purpose |
|---|---|
| `record_question` | Open a record and submit the consolidated question; a second open settles the open record as a duplicate-start error record |
| `record_analyse` | Submit the analysis text into the open record |
| `record_answer` | Submit the answer text and settle the record; a merged template in the text is split automatically |

## External tools

External tools are user-owned calculation tools that the host reaches over an http or file transport. Declarations live in `external-tools.jsonl` under the plugin home (`~/.dsh-electro-lab`); at plugin start every declaration that is not explicitly disabled is compiled and registered as a tool, so a change applies only after a host restart. Declarations use the same value dialect as the built-in tools: a quantity parameter accepts a bare number or a compact complex object — `{re, im}` (rectangular) or `{mag, ang}` (polar, angles in radians) — and an array parameter declares homogeneous items. Saving a declaration is the authorization for its transport. The manager tools edit the declaration archive; the Records panel's External tools tab offers the same actions.

Failures share **one error path** with the built-in tools. An external endpoint reports a failed computation by returning `{requestId, error: "…"}` — a `result` field present alongside is ignored — and the host raises the error content as a `ToolError` with code `EXTERNAL_ERROR`. Transport failures are raised by the host itself with `EXTERNAL_HTTP` (http status), `EXTERNAL_TIMEOUT` and `EXTERNAL_RESPONSE` (protocol violations: a mismatched requestId, a missing result, a non-string error). Whatever the source — a thrown error or one of these response shapes — the call surfaces as the same structured error result to the agent and is recorded with its name/code.

| Tool | Purpose |
|---|---|
| `external_tool_add` | Register a new external tool declaration (fails when the name already exists) |
| `external_tool_update` | Replace an existing external tool declaration (fails when it does not exist) |
| `external_tool_delete` | Remove an external tool declaration by name |
