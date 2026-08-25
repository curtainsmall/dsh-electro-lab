---
name: worked-solution
description: "Worked electrical/electronics solutions: analyse, plan, run solve_steps, narrate each step"
whenToUse: "The user asks for a worked calculation with exact numbers, shown step by step"
---

# Worked Solution

Use when the user asks for a worked electrical/electronics calculation (exact numbers, shown step by step). Pure conceptual questions do not need it.

## Process

1. **Analyse** — restate the problem in your own words; list the known values with their units and the target quantity.
2. **Plan** — say which quantities you will compute and in what order (human-readable, no formulas yet).
3. **Execute** — call `solve_steps` with one step per calculation. Every value is a complex value object:
   - rectangular: `{"form": "rect", "re": …, "im": 0, "unit": "frequency"}`
   - polar: `{"form": "polar", "mag": …, "angDeg": …, "unit": "frequency"}` (or `angRad` in radians)
   Values are SI base units; `unit` is the semantic category (`frequency`, `resistance`, `capacitance`, `inductance`, `voltage`, `current`, `power`, `time`, `none`, `angle`, `log`).
   To pass the full output of an earlier step into a later one, use the string `"@stepN"` (e.g. `"@step0"`) as that argument.
4. **Narrate** — go through `stepResults` in order. For each step say: what it computes, the formula, and the result using the output's `mag` and `angDeg` fields (engineers' notation). Never recompute values yourself — read them from stepResults.
5. **Conclude** — summarize the final answer with its unit.

## Tools

### Arithmetic and expressions — never compute by hand

- `calculate` — evaluate a string math expression (complex-aware): `2*pi*1e6*10e-6`, `(1+j)*(3-4j)`, `sqrt(2)`, `x^2+2*x+1` with variable bindings. Use it for ALL intermediate arithmetic.
- `rational_coefficients` — reduce an expression in one variable to a single ratio: `"s^2+3*s+2"` → numerator `[1,3,2]`, denominator `[1]`; `"(s+1)/(s^2+3*s+2)"` → `[1,1]`/`[1,3,2]`; negative powers and nested divisions normalize automatically; symbols like `RC` are bound via variables. **This is the entry point for every transfer-function chain.**

### Circuits

- `element_impedance` (one R/L/C at a frequency), `series_impedance` / `parallel_impedance` (combine impedance lists), `circuit_impedance` (a whole nested network tree).
- `resonance` (f₀, Q, bandwidth), `ac_power` (S/P/Q/power factor), `rc_transient` / `rl_transient` (single point), `transient_response` (full RC/RL curve at many time points).
- `time_constant` (τ = RC or L/R with cutoff), `voltage_divider` (loaded/unloaded), `led_resistor`, `opamp_configurations` (7 ideal configurations, integrator/differentiator in the frequency domain).

### Matching and transmission lines

- `matched_network` — L/π/T matching between two resistances (topology `"l"` uses the implied Q; `"pi"`/`"t"` need a specified Q). Each solution lists elements with role, reactance and L/C values.
- `impedance_to_reflection`, `reflection_to_vswr`, `return_loss`, `quarter_wave_transformer`.
- `wavelength_frequency`, `coaxial_parameters`, `rise_time_bandwidth`.

### Signals and systems — the ratio chain

Any transfer function starts with `rational_coefficients` (or the z-domain Laurent form for `difference_equation_response`), then:

- `poles_zeros` — poles (denominator roots) and zeros (numerator roots); stability: s-poles in the left half-plane, z-poles inside the unit circle.
- `transfer_function_response` — H(jω) for variable `"s"`, H(e^(jωT)) for `"z"` (sampleTime required), at frequency points.
- `bode_response` — magnitude (dB) and phase (degrees) on a logarithmic grid in one call.
- `step_response` — y(t) of a continuous system (numerator degree ≤ denominator degree).
- `partial_fraction` — residues for symbolic inverse transforms: H(s) = polynomial + Σ residue/(s−pole)^order; invert each term yourself (e^{pt}, t·e^{pt}, …).
- `power_series_expansion` — z-domain impulse response h[n] as the z⁻¹ series of a ratio.
- `difference_equation_response` — y[n] from Laurent a/b coefficients and an input sequence.
- `discrete_fourier_transform` / `inverse_discrete_fourier_transform`, `fourier_series_coefficients`, `window_function`, `signal_analysis` (RMS/peak/DC + spectrum in one call).

### Noise and dB

- `thermal_noise` (k·T·B), `cascade_noise_figure` (Friis), `quantization_noise` (6.02N+1.76).
- `db_convert` (any level to watts/dBm/dBW/volts/dBu/dBµV), `decibel_ratio` (ratio ↔ dB).

### Combo recipes (one call instead of several)

- `filter_design` — Butterworth low-pass ladder: order/cutoff/resistance → element list + attenuation.
- `transient_response` — RC/RL curve at many time points.
- `bode_response` — full Bode plot of a ratio.
- `signal_analysis` — statistics + spectrum of a sample sequence.

## Example: RC low-pass analysis

Given R = 1 kΩ, C = 100 nF (τ = 100 µs), asked for cutoff, poles, step response and Bode plot:

```
step0: calculate("1e3*100e-9")                              → 1e-4 s        (τ)
step1: rational_coefficients("1/(1+s*1e-4)", "s")           → [1]/[1, 1e-4] (H(s))
step2: poles_zeros(numerator @step1.numerator, denominator @step1.denominator)
                                                             → pole −1e4     (stable)
step3: calculate("1/(2*pi*1e-4)")                           → 1591.5 Hz     (f₀)
step4: bode_response(numerator @step1.numerator, denominator @step1.denominator,
                     variable "s", frequencyStart 10, frequencyEnd 1e6, pointsPerDecade 10)
                                                             → −3 dB at f₀, −20 dB/decade slope
step5: step_response(numerator @step1.numerator, denominator @step1.denominator,
                     times [0, 5e-5, 1e-4, 3e-4])
                                                             → 0, 0.393, 0.632, 0.950 (V)
```

Narrate each step with the formula and the stepResults values; never recompute.

## Rules

- Every intermediate value shown must come from `stepResults` — never recompute by hand.
- If a step failed, report the error message and stop.
