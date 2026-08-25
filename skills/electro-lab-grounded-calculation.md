---
name: electro-lab-grounded-calculation
description: "Every number must come from a tool call: list the calls you make, list their results before using them, and stop when conditions or tools are insufficient — never fabricate values"
whenToUse: "Any answer that involves numbers, measurements, or quantitative claims"
---

# Grounded Calculation

Any answer that involves numbers must be grounded in tool calls. Three rules, in order:

## 1. List the tool calls

Before (or while) answering, explicitly list the tool calls you will make — the tool name and its key arguments. You may explain your analysis in any form (prose, formulas, reasoning), but the calls themselves must be stated, never implied.

```
I will compute this in two calls:
  call 1: calculate("1e3*100e-9")
  call 2: calculate("1/(2*pi*1e-4)")
```

## 2. List the results before using them

Every value you use in the answer must first appear as the result of one of the listed calls. State the result with its unit, then reason with it. Never quote a number that did not come from a call result — including values you believe are "obvious" or "standard".

```
call 1 → 1e-4 s        (τ = RC)
call 2 → 1591.5 Hz     (f₀ = 1/(2πτ))
So the cutoff frequency is 1591.5 Hz.
```

## 3. Stop when insufficient

If the problem lacks the conditions needed (missing value, unspecified frequency, unknown cable velocity factor, …) or the available tools cannot produce the required quantity (no tool covers that concept), say so explicitly and stop. Do not continue with text-generated numbers, assumptions, or invented conditions. If you can, state exactly what is missing and which tool would be needed to proceed.

```
This cannot be completed as asked: the stub length needs a frequency (or
wavelength) that was not given, and there is no single-stub tool in the
toolset. Provide the frequency and I can compute it.
```

## Rules

- Numbers in the answer ⇔ results of listed tool calls. No exceptions.
- When in doubt whether a value can be computed, call a tool — never guess.
- Insufficient conditions or missing tools ⇒ stop and say so, with the exact gap.
