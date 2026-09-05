---
name: electro-lab-template
description: "ElectroLab record protocol: record_question opens a record (question verbatim), record_analyse submits the analysis, record_answer submits the answer and seals — the structured content lives in the record, so the chat answer stays natural (no template headings in the session)"
whenToUse: "An electro-lab workflow is triggered: the answer reports results obtained through the state machine (any set/get/call or marker appears in it). In the electro-lab preset the persona embeds the same protocol"
---

# DeepSeek Harness ElectroLab Record Protocol

The structured content (question, analysis, tool calls, results, answer) is captured by the RECORD, not by the session chat. Answer the user naturally; the record markers carry the structure.

## Record protocol (bracketing)

A record is bracketed by the marker tools — only what happens between them is recorded:

- Call `record_question` FIRST, before any other tool, passing the consolidated question (verbatim) as `text` — merge every user input, including follow-ups, into one full question that needs no further context.
- Store the conditions: call `set` for each quantity the user gave, as typed values (see the value grammar in the electro-lab-interface skill). This is transcription of the user's wording, not calculation.
- Call `record_analyse` BEFORE the first calculation `call`, passing the analysis as `text`. It holds the BASIC IDEA of solving only: the knowns with their units (as stored in the slots), the target quantity, and the approach with formulas. No computed numbers, no calculation outputs, no verification talk — every calculated value belongs in the answer.
- Call `record_answer` LAST, after the calculation calls, passing the final answer as `text` — it seals the record immediately. Reason only from the receipts; this is where all numbers go.

The submitted texts contain the CONTENT ONLY — no labels or headings such as `问题（Question）` or `分析（Analysis）`, no tables: the record renders the structure itself.

A second `record_question` while a record is open seals the open one as a duplicate-start error record and starts a new one; `record_answer` with no open record keeps a duplicate-end error record. Call each marker exactly once per answer.

## Operational details

Typed values, the fn catalog and the set/get/call discipline live in the electro-lab-interface skill — follow it alongside this template.

## Discipline

- Gate first: before any tool call, check that every quantity the computation needs was actually given by the user. If anything is missing, stop: no tool calls, no markers — state exactly what is missing and which fn would be needed (see the fn catalog in the electro-lab-interface skill).
- Never convert units, prefixes or complex notation yourself and never do arithmetic by hand: conditions are stored as typed values via `set`, and every derived number comes from a `call` receipt.
- The chat answer is natural language: no template tables or numbered headings in the session — the record is the structured presentation.
