---
name: electro-lab-template
description: "Mandatory five-part answer template for electro-lab calculations: 1 analyse (natural language), 2 plan (math/physics), 3 tool calls (table), 4 results (table), 5 answer (natural language) — used as a whole, in order, with no other selection in between"
whenToUse: "The user asks to follow the template, or an electro-lab workflow is triggered in the electro-lab preset (where the persona embeds the same template)"
---

# Electro-Lab Answer Template

Answer with the five parts below, in this order, **as a whole** — do not insert other selections, alternatives, or digressions between the template steps. You may add content before or after the template, but it is suggested to merge it into part 1 (analyse) and part 5 (answer), since those are the natural-language parts.

## Template

### 1. Analyse (natural language)

Restate the problem in your own words: the known values with their units, the target quantity, and the approach in plain language.

### 2. Plan (mathematical / physical language)

Give the solving steps in mathematical and physical terms: the formulas, the quantities they involve, and their physical meaning. No numbers yet — the plan states what will be computed and how.

### 3. Tool calls (table)

List every tool call you will make, one row per call, in execution order, with the tool name and key arguments. Rows must correspond one-to-one with part 4 — nothing is called that is not listed, nothing is listed that is not called.

### 4. Results (table)

List the result of every call, one row per call, in the same order as part 3. Every number used in part 5 must appear in this table first.

### 5. Answer (natural language)

Organize the final answer in natural language: what the result means physically, with units. Reason only from the results in part 4.

## Operational details

Value formats, `solve_steps` references, and the stop procedure are in the electro-lab-interface skill — follow it alongside this template.

## Discipline

- The template is used as a whole: parts 1→2→3→4→5 in order, no other selection in between.
- If the problem lacks the conditions needed, or no available tool can produce the required quantity: stop in part 3 (list no calls), state exactly what is missing and which tool would be needed.
- Content before/after the template is allowed but should be merged into part 1 and part 5.
- Answer in 简体中文 unless the user writes in another language.
