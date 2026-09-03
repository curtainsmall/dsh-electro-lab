---
name: electro-lab-interface
description: "Operational interface of the electro-lab toolset: value object format, solve_steps references, and the stop procedure — independent of any answer template"
whenToUse: "Any answer that involves numbers, measurements, or quantitative claims through the electro-lab toolset"
---

# DeepSeek Harness ElectroLab Interface

The operational details of the electro-lab toolset. This skill is template-independent — it applies whether or not an answer template is used. If the user asks for the template structure, follow the electro-lab-template skill instead.

## Value format

Values are complex quantities in SI base units. A value parameter takes a bare number (a real value) or a compact complex object — `{"re": …, "im": …}` (rect) or `{"mag": …, "ang": …}` (polar, angles in radians). Every parameter's declaration pins its quantity kind. Take the accepted branches and the exact field names from the tool's schema.

## Tool-call discipline

Every tool call you make must be stated (tool name and key arguments), and every number used in your answer must come from a tool call result — never from memory, "standard" tables, or text generation. When you present both calls and results together (for example in the electro-lab-template structure), they correspond one-to-one in the same order.

## solve_steps references

For multi-step chains, one call may use the `solve_steps` orchestrator whose step arguments reference earlier steps with `"@stepN"` (whole output) or `"@stepN.path.to.field"` (nested field); steps run serially and their results come back in `stepResults` in order.

## Stop procedure

Check conditions BEFORE any tool call: list the quantities the user actually gave. If any quantity the computation needs is missing, stop without calling any tool — state exactly what is missing and which tool would be needed. Never invent values and never continue with fabricated conditions.

## Rules

- Numbers in the answer ⇔ results of stated tool calls. No exceptions.
- When in doubt whether a value can be computed, call a tool — never guess.
- Insufficient conditions or missing tools ⇒ stop and say so, with the exact gap.
