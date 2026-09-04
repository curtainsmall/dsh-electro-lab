/**
 * Record marker tools: one calculation is bracketed by
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
import { defineJsonTool } from '../tool.ts'

export const RECORD_QUESTION_TOOL = 'record_question'
export const RECORD_ANALYSE_TOOL = 'record_analyse'
export const RECORD_ANSWER_TOOL = 'record_answer'

const textParam = { type: 'string' as const, description: 'the segment text, verbatim', required: true as const }

export const recordTools = [
  defineJsonTool({
    name: RECORD_QUESTION_TOOL,
    description: 'Open a new ElectroLab record and submit the consolidated question (verbatim). Call it FIRST, before any calculation tool — a second record_question while a record is open settles the open record as a duplicate-start error record and opens a new one.',
    returns: { type: 'any' },
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
  defineJsonTool({
    name: RECORD_ANALYSE_TOOL,
    description: 'Submit the analysis text of the current record (verbatim). Call it once before the calculation tools — knowns/conditions and the approach only, no computed numbers; it has no effect without an open record.',
    returns: { type: 'any' },
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
  defineJsonTool({
    name: RECORD_ANSWER_TOOL,
    description: 'Submit the final answer text (verbatim) and CLOSE the current record: it is settled and stored as-is. Call it LAST, after the tool calls. If you merge the whole template into this text instead of splitting it, the parts are recovered automatically.',
    returns: { type: 'any' },
    parameters: { text: textParam },
    execute: () => ({ ok: true }),
  }),
]
