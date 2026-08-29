---
name: electro-lab-template
description: "Mandatory five-part answer template for electro-lab calculations: 1 question (consolidated restatement), 2 analysis (approach with formulas), 3 tool calls (table), 4 results (table), 5 answer (natural language) — used as a whole, in order, with no other selection in between, bracketed by one record_start / one record_end marker call"
whenToUse: "An electro-lab workflow is triggered: the answer reports results obtained through the electro-lab toolset (any tool call appears in it). In the electro-lab preset the persona embeds the same template"
---

# Electro-Lab Answer Template

Answer with the five parts below, in this order, **as a whole** — do not insert other selections, alternatives, or digressions between the template steps. Before finishing, check that all five parts are present, in order, with nothing else in between. You may add content before or after the template, but it is suggested to merge it into part 1 (question) and part 5 (answer), since those are the natural-language parts.

## Template

### 1. Question (natural language)

Restate the complete question being solved, in one consolidated form: merge every user input — including follow-ups and refinements — into a single full question that needs no further context. This is what the rest of the answer solves.

### 2. Analysis (approach with formulas)

The known values with their units, the target quantity, and the solving approach: the formulas in mathematical and physical terms, what each quantity means, and how the computation proceeds. No computed numbers yet — only the given knowns and the plan to reach the target.

### 3. Tool calls (table)

List every tool call you actually make for this answer, one row per call, in execution order, with the tool name and key arguments. Rows must correspond one-to-one with part 4 — nothing is called that is not listed, nothing is listed that is not called.

### 4. Results (table)

List the result of every call, one row per call, in the same order as part 3. Every number used in part 5 must appear in this table first.

### 5. Answer (natural language)

Organize the final answer in natural language: what the result means physically, with units. Reason only from the results in part 4.

## Record protocol (bracketing)

Every answer is bracketed by two marker-tool calls — only the content between them is recorded (question/analysis texts, tool calls, results, answer):

- Call `record_question` FIRST, before any calculation tool, passing the consolidated question (template part 1, verbatim) as `text`.
- Call `record_analyse` once between the tool calls, passing the analysis (template part 2, verbatim) as `text`.
- Call `record_answer` LAST, after the tool calls, passing the final answer (template part 5, verbatim) as `text` — it settles the record immediately.

A second `record_question` while a record is open settles the open one as a duplicate-start error record and starts a new one; `record_answer` with no open record keeps a duplicate-end error record. Call each marker exactly once per answer.

## Operational details

Value formats and `solve_steps` references are in the electro-lab-interface skill — follow it alongside this template.

## Discipline

- Gate first: before any tool call, check that every quantity the computation needs was actually given by the user. If anything is missing, stop: no tool calls, no template — state exactly what is missing and which tool would be needed (see the stop procedure in the electro-lab-interface skill).
- The template is used as a whole: parts 1→2→3→4→5 in order, no other selection in between. Check before finishing that all five parts are present.
- Content before/after the template is allowed but should be merged into part 1 and part 5.
- Answer in 简体中文 unless the user writes in another language.
