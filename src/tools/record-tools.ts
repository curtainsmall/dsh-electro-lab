/**
 * Record marker tools: `record_start` and `record_end` bracket one five-step
 * calculation in the conversation. They are no-ops — the RecordManager reads
 * the tool/call events themselves: the event `arguments` (the model's raw
 * JSON text) are parsed by the manager. Exactly one `record_start` per
 * answer: a second one settles the open record as a duplicate-start error
 * record and opens a new one.
 */
import { defineJsonTool } from './helpers.ts'

export const RECORD_START_TOOL = 'record_start'
export const RECORD_END_TOOL = 'record_end'

export const recordTools = [
  defineJsonTool({
    name: RECORD_START_TOOL,
    description: 'Open a new electro-lab record: everything between this call and the next record_end is recorded (question/analysis texts, tool calls and results, answer). Call it once at the start of a five-step calculation — a second record_start while a record is open settles the open record as a duplicate-start error record and opens a new one.',
    parameters: {},
    execute: () => ({ ok: true }),
  }),
  defineJsonTool({
    name: RECORD_END_TOOL,
    description: 'Close the current electro-lab record: it is settled and stored as-is. Call it after the tool calls of a five-step calculation. Tool-phase models write their final texts after the last tool call, so pass the final texts here, copied verbatim: `question` (template part 1), `analyse` (part 2) and `answer` (part 5). A field left out falls back to the texts written between the markers.',
    parameters: {
      question: { type: 'string', description: 'the consolidated full question (template part 1), verbatim' },
      analyse: { type: 'string', description: 'the analysis with formulas (template part 2), verbatim' },
      answer: { type: 'string', description: 'the final answer (template part 5), verbatim' },
    },
    execute: () => ({ ok: true }),
  }),
]
