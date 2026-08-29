/**
 * Record marker tools: `record_start` and `record_end` bracket one five-step
 * calculation in the conversation. They are no-ops — the RecordManager reads
 * the tool/call events themselves; the model calls them so the protocol is
 * explicit and survives session replay (tool events are native DSH events).
 * Exactly one `record_start` per answer: a second one settles the open
 * record as a duplicate-start error record and opens a new one.
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
    description: 'Close the current electro-lab record: it is settled and stored as-is. Call it after the final answer text of a five-step calculation.',
    parameters: {},
    execute: () => ({ ok: true }),
  }),
]
