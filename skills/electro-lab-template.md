---
name: electro-lab-template
description: "Mandatory five-part answer template for electro-lab calculations: 1 analyse (natural language), 2 plan (math/physics), 3 tool calls (table), 4 results (table), 5 answer (natural language) — used as a whole, in order, with no other selection in between"
whenToUse: "An electro-lab workflow is triggered: the answer reports results obtained through the electro-lab toolset (any tool call appears in it). In the electro-lab preset the persona embeds the same template"
---

# Electro-Lab Answer Template

Answer with the five parts below, in this order, **as a whole** — do not insert other selections, alternatives, or digressions between the template steps. Before finishing, check that all five parts are present, in order, with nothing else in between. You may add content before or after the template, but it is suggested to merge it into part 1 (analyse) and part 5 (answer), since those are the natural-language parts.

## Template

### 1. Analyse (natural language)

Restate the problem in your own words: the known values with their units, the target quantity, and the approach in plain language.

### 2. Plan (mathematical / physical language)

Give the solving steps in mathematical and physical terms: the formulas, the quantities they involve, and their physical meaning. No numbers yet — the plan states what will be computed and how.

### 3. Tool calls (table)

List every tool call you actually make for this answer, one row per call, in execution order, with the tool name and key arguments. Rows must correspond one-to-one with part 4 — nothing is called that is not listed, nothing is listed that is not called.

### 4. Results (table)

List the result of every call, one row per call, in the same order as part 3. Every number used in part 5 must appear in this table first.

### 5. Answer (natural language)

Organize the final answer in natural language: what the result means physically, with units. Reason only from the results in part 4.

## Operational details

Value formats and `solve_steps` references are in the electro-lab-interface skill — follow it alongside this template.

## Discipline

- Gate first: before any tool call, check that every quantity the computation needs was actually given by the user. If anything is missing, stop: no tool calls, no template — state exactly what is missing and which tool would be needed (see the stop procedure in the electro-lab-interface skill).
- The template is used as a whole: parts 1→2→3→4→5 in order, no other selection in between. Check before finishing that all five parts are present.
- Content before/after the template is allowed but should be merged into part 1 and part 5.
- Answer in 简体中文 unless the user writes in another language.
