# Tool Catalog

All tools of the DeepSeek Harness ElectroLab plugin, grouped by domain. Every tool speaks the same value-object contract: inputs are `{form, re, im, kind}` (rect) or `{form, mag, ang, kind}` (polar) in SI base units, outputs are `{re, im, kind, mag, ang}` snapshots. ✅ marks combination tools that orchestrate several math kernels in one call.

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
| `convert` | Convert a value to any unit of the same family (°C/°F/K, bar/psi/atm/Pa, cal/kWh/J, hp/W, inch/mile/m, lb/oz/kg, degree→radian, ratio ↔ dB) |

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
