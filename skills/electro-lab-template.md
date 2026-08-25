---
name: electro-lab-template
description: "Mandatory five-part answer template for any electro-lab workflow: 1 analyse (natural language), 2 plan (math/physics), 3 tool calls (table), 4 results (table), 5 answer (natural language) — used as a whole, in order, with no other selection in between"
whenToUse: "Any answer that involves numbers, measurements, or quantitative claims through the electro-lab toolset"
---

# Electro-Lab Answer Template

This template replaces earlier guidance. Once an electro-lab workflow is triggered (in the electro-lab preset or any other preset using this toolset), answer with the five parts below, in this order, **as a whole** — do not insert other selections, alternatives, or digressions between the template steps. You may add content before or after the template, but it is suggested to merge it into part 1 (analyse) and part 5 (answer), since those are the natural-language parts.

## Template

### 1. Analyse (natural language)

Restate the problem in your own words: the known values with their units, the target quantity, and the approach in plain language.

### 2. Plan (mathematical / physical language)

Give the solving steps in mathematical and physical terms: the formulas, the quantities they involve, and their physical meaning. No numbers yet — the plan states what will be computed and how.

### 3. Tool calls (table)

List every tool call you will make, one row per call, in execution order:

| # | Tool | Arguments |
|---|------|-----------|
| 1 | `calculate` | `expression: "1e3*100e-9"` |
| 2 | `rational_coefficients` | `expression: "1/(1+s*1e-4)"`, `variable: "s"` |
| 3 | `bode_response` | `numerator: @step2.numerator`, `denominator: @step2.denominator`, `frequencyStart: 10`, `frequencyEnd: 1e6` |

Rows must correspond one-to-one with part 4 — nothing is called that is not listed, nothing is listed that is not called.

Values are complex value objects in SI base units: rectangular `{"form": "rect", "re": …, "im": 0, "kind": "frequency"}` or polar `{"form": "polar", "mag": …, "angDeg": …, "kind": "frequency"}` (or `angRad`). `kind` is the quantity category (`frequency`, `resistance`, `capacitance`, `inductance`, `voltage`, `current`, `power`, `time`, `none`, `angle`, `log`).

For multi-step chains, one row may call the `solve_steps` orchestrator whose step arguments reference earlier steps with `"@stepN"` (whole output) or `"@stepN.path.to.field"` (nested field); steps run serially and their results come back in `stepResults` in order.

### 4. Results (table)

List the result of every call, one row per call, in the same order:

| # | Result |
|---|--------|
| 1 | 1e-4 s (τ = RC) |
| 2 | numerator [1], denominator [1, 1e-4] |
| 3 | −3.01 dB at 1591.5 Hz, −45° … |

Every number used in part 5 must appear in this table first. Never quote values from memory, "standard" tables, or text generation.

### 5. Answer (natural language)

Organize the final answer in natural language: what the result means physically, with units. Reason only from the results in part 4.

## Discipline

- The template is used **as a whole**: parts 1→2→3→4→5 in order, no other selection in between.
- Every tool call must be listed in part 3 and its result in part 4 — nothing else is called.
- If the problem lacks the conditions needed, or no available tool can produce the required quantity: stop in part 3 (list no calls), state exactly what is missing and which tool would be needed. Do not invent values or continue with fabricated conditions.
- Content before/after the template is allowed but should be merged into part 1 and part 5.
- Answer in 简体中文 unless the user writes in another language.
