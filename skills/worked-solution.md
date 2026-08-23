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
   Build networks from primitives: `element_impedance` (one R/L/C at a frequency), `series_impedance` / `parallel_impedance` (combine impedance lists), or `circuit_impedance` (a whole nested network tree in one call). Common recipes are wrapped into single calls: `matched_network` (L/π/T matching with a specified Q), `transient_response` (full RC/RL curves at many time points), `filter_design` (Butterworth low-pass ladder).
4. **Narrate** — go through `stepResults` in order. For each step say: what it computes, the formula, and the result using the output's `mag` and `angDeg` fields (engineers' notation). Never recompute values yourself — read them from stepResults.
5. **Conclude** — summarize the final answer with its unit.

## Rules

- Every intermediate value shown must come from `stepResults` — never recompute by hand.
- If a step failed, report the error message and stop.
