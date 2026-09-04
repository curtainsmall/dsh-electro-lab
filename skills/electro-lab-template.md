---
name: electro-lab-template
description: "Electro-lab record protocol: record_question opens a record and submits the question, record_analyse submits the analysis, record_answer submits the answer and settles — the structured content lives in the record, so the chat answer stays natural (no template headings in the session)"
whenToUse: "An electro-lab workflow is triggered: the answer reports results obtained through the electro-lab toolset (any tool call appears in it). In the electro-lab preset the persona embeds the same protocol"
---

# DeepSeek Harness ElectroLab Record Protocol

The structured content (question, analysis, tool calls, results, answer) is captured by the RECORD, not by the session chat. Answer the user naturally; the record markers carry the structure.

## Record protocol (bracketing)

A record is bracketed by the marker tools — only what happens between them is recorded:

- Call `record_question` FIRST, before any calculation tool, passing the consolidated question (verbatim) as `text` — merge every user input, including follow-ups, into one full question that needs no further context.
- Reading is tool work: if a quantity in the user's text carries a unit, SI prefix or complex notation (e.g. "100 mF", "1+2j Ω", "220∠30° V", "25 °C"), call `parse_value` on the exact text (or `convert_unit` for unit-family conversions such as °C ↔ °F) right after `record_question` — readings only, not calculations.
- Call `record_analyse` BEFORE the first calculation tool, passing the analysis as `text`. It holds the BASIC IDEA of solving only: the knowns with their units (quoted from the reading-tool outputs), the target quantity, and the approach with formulas. No computed numbers, no calculation outputs, no verification talk — every calculated value belongs in the answer.
- Call `record_answer` LAST, after the tool calls, passing the final answer as `text` — it settles the record immediately. Reason only from the tool results; this is where all numbers go.

The submitted texts contain the CONTENT ONLY — no labels or headings such as `问题（Question）` or `分析（Analysis）`, no tables: the record renders the structure itself.

A second `record_question` while a record is open settles the open one as a duplicate-start error record and starts a new one; `record_answer` with no open record keeps a duplicate-end error record. Call each marker exactly once per answer.

## Operational details

Value formats and `solve_steps` references are in the electro-lab-interface skill — follow it alongside this template.

## Discipline

- Gate first: before any tool call, check that every quantity the computation needs was actually given by the user. If anything is missing, stop: no tool calls, no markers — state exactly what is missing and which tool would be needed (see the stop procedure in the electro-lab-interface skill).
- Never convert units, prefixes or complex notation yourself and never do arithmetic by hand: textual quantities pass through the reading tools first, and every derived number comes from a calculation tool (`calculate` for expressions, the domain tools, or `solve_steps`).
- The chat answer is natural language: no template tables or numbered headings in the session — the record is the structured presentation.
