/**
 * Record marker tools: one five-step calculation is bracketed by
 * `record_question` (opens the record AND submits the question text) and
 * `record_answer` (submits the answer text AND settles the record), with
 * `record_analyse` submitting the analysis in between. They are no-ops —
 * the RecordManager reads the tool/call events themselves: the event
 * `arguments` (the model's raw JSON text) are parsed by the manager.
 *
 * Exactly one `record_question` per answer: a second one settles the open
 * record as a duplicate-start error record and opens a new one.
 * `record_answer` with no open record keeps a duplicate-end error record.
 */
import { defineJsonTool } from './helpers.ts'

export const RECORD_QUESTION_TOOL = 'record_question'
export const RECORD_ANALYSE_TOOL = 'record_analyse'
export const RECORD_ANSWER_TOOL = 'record_answer'

const textParam = { type: 'string' as const, description: 'the segment text, verbatim', required: true as const }

export const recordTools = [
  defineJsonTool({
    name: RECORD_QUESTION_TOOL,
    description: 'Open a new electro-lab record and submit the consolidated question (template part 1, verbatim). Call it FIRST, before any calculation tool — a second record_question while a record is open settles the open record as a duplicate-start error record and opens a new one.',
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
  defineJsonTool({
    name: RECORD_ANALYSE_TOOL,
    description: 'Submit the analysis text of the current record (template part 2, verbatim). Call it once between the tool calls; it has no effect without an open record.',
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
  defineJsonTool({
    name: RECORD_ANSWER_TOOL,
    description: 'Submit the final answer text (template part 5, verbatim) and CLOSE the current record: it is settled and stored as-is. Call it LAST, after the tool calls. If you merge the whole five-part template into this text instead of splitting it, the parts are recovered automatically.',
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
]
