/**
 * ElectroLab run records: a session-projection unit that folds committed
 * session events into settled runs of electro-lab tool calls — the
 * five-step process (analyse → plan → tool calls → results → answer).
 *
 * Pure functions only (init/apply/view, no subscriptions, no I/O): the
 * projection registry drives them eagerly over every committed event and
 * replays them deterministically from the persisted log, so the fold is
 * identical on live sessions, resume and checkpoint restore.
 *
 * Each record carries the question/answer pair:
 * - `questionInputs` — the raw user messages that led to the run (follow-up
 *   questions accumulate; multiple inputs are allowed),
 * - `question` — the LLM-summarized full question, attached by the host
 *   summarizer once the summary lands (see src/index.ts). The summary never
 *   enters the session log — the session persistence read path refuses
 *   unknown out-of-repo event types — and never touches this fold: settled
 *   runs are persisted by the host into the plugin-owned record store, and
 *   the store update carries the question back.
 * - `answerTexts` — the assistant texts inside the run window, i.e. the
 *   five-step texts (analyse/plan interleave with tool calls in one turn).
 *
 * Run ids embed the first call's `time` and `seq` (`run-<time>-<seq>`), which
 * makes them unique across sessions so stored records can key by run id
 * alone even though the fold never sees the session id.
 *
 * A run opens with the first electro-lab tool call — promoting the pending
 * pre-analysis window (`context`) collected since the first user message —
 * and closes when:
 * - the turn ends (`turn/end`),
 * - a new user message arrives (`user/message`),
 * - a non-electro-lab tool is called in between (the flow moved on),
 * - no electro-lab activity arrives within {@link SETTLE_WINDOW_MS}.
 * Assistant messages do NOT close a run.
 */
import { ALL_TOOLS } from './tools/index.ts'
import { filterTool } from './tools/filter-tool.ts'

/** A run closes when no electro-lab activity arrives within this window. */
export const SETTLE_WINDOW_MS = 30 * 60_000
/** Settled runs retained in state (newest kept). */
export const MAX_RUNS = 50
/** Per-message text cap when collecting inputs/answers. */
export const MAX_TEXT_CHARS = 2000
/** Collected user inputs per question window. */
export const MAX_INPUTS = 5
/** Collected assistant texts per run (the five-step texts). */
export const MAX_TEXTS = 8

/** Every tool the electro-lab plugin registers (ALL_TOOLS + the separately-registered pair). */
export const ELECTRO_LAB_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ALL_TOOLS.map((tool) => tool.name),
  filterTool.name,
  'solve_steps',
])

/** One tool's usage inside a run. */
export interface ElectroLabToolUsage {
  name: string
  calls: number
}

/** A settled run: the closed record shown in the panel. */
export interface ElectroLabRun {
  id: string
  startedAt: number
  settledAt: number
  toolCalls: number
  errors: number
  tools: ElectroLabToolUsage[]
  /** LLM-summarized full question; merged from the ledger when available. */
  question?: string
  /** Raw user texts that led to the run (follow-ups accumulate). */
  questionInputs: string[]
  /** Assistant texts inside the run window — the five-step texts. */
  answerTexts: string[]
  /** Exact tool outputs (`tool/result` content) — the five-step results. */
  results: string[]
}

/** The still-open run, when the session is mid-process. */
export interface ElectroLabOpenRun {
  id: string
  startedAt: number
  lastAt: number
  toolCalls: number
  errors: number
  tools: ElectroLabToolUsage[]
  questionInputs: string[]
  answerTexts: string[]
  results: string[]
}

/** The wire payload for the `electro-lab` projection key. */
export interface ElectroLabProjectionValue {
  runs: ElectroLabRun[]
  open: ElectroLabOpenRun | null
}

/** Pre-analysis window: user inputs + assistant texts before the first tool call. */
interface ContextState {
  startedAt: number
  lastAt: number
  questionInputs: string[]
  answerTexts: string[]
}

/** Internal per-call bookkeeping of the open run. */
interface OpenRunState {
  id: string
  startedAt: number
  lastAt: number
  calls: number
  errors: number
  toolOrder: string[]
  toolCalls: Record<string, number>
  pending: string[]
  questionInputs: string[]
  answerTexts: string[]
  results: string[]
}

/** The unit's fold state: plain JSON, ready for the persisted cache. */
export interface ElectroLabProjectionState {
  open: OpenRunState | null
  context: ContextState | null
  settled: ElectroLabRun[]
}

/**
 * The session-event shape this unit reads. Loose on purpose: only the leaf
 * fields the fold needs are read (the runtime provides the real dsh-session
 * event union, which structurally satisfies this view).
 */
export interface ElectroLabSessionEvent {
  type: string
  seq: number
  time: number
  data: {
    name?: string
    callId?: string
    error?: { name: string; code: string }
    content?: unknown
    /** tool/result: `message.content[0]` is the ToolResultBlock carrying the output blocks. */
    message?: unknown
  }
}

/** State for the empty log. */
export function initElectroLabProjection(): ElectroLabProjectionState {
  return { open: null, context: null, settled: [] }
}

/** Join the text blocks of a message content array (TextBlock shape, loose). */
function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string' && text.length > 0) parts.push(text)
    }
  }
  return parts.join('\n').slice(0, MAX_TEXT_CHARS)
}

function pushCapped(list: string[], text: string, cap: number): string[] {
  const next = [...list, text]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/** Extract the tool-output text from a `tool/result` payload (message.content[0] is the ToolResultBlock). */
function textFromResultData(data: ElectroLabSessionEvent['data']): string {
  const message = data.message as { content?: unknown[] } | undefined
  const block = message?.content?.[0] as { type?: unknown; content?: unknown } | undefined
  return block?.type === 'tool-result' ? textFromContent(block.content) : ''
}

function settleOpen(state: ElectroLabProjectionState, settledAt: number): ElectroLabProjectionState {
  const open = state.open
  if (open === null) return state
  const run: ElectroLabRun = {
    id: open.id,
    startedAt: open.startedAt,
    settledAt,
    toolCalls: open.calls,
    errors: open.errors,
    tools: open.toolOrder.map((name) => ({ name, calls: open.toolCalls[name] ?? 0 })),
    questionInputs: open.questionInputs,
    answerTexts: open.answerTexts,
    results: open.results,
  }
  return { open: null, context: state.context, settled: [run, ...state.settled].slice(0, MAX_RUNS) }
}

function clearContext(state: ElectroLabProjectionState): ElectroLabProjectionState {
  return state.context === null ? state : { ...state, context: null }
}

function openRun(event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  return {
    id: `run-${event.time}-${event.seq}`,
    startedAt: event.time,
    lastAt: event.time,
    calls: 1,
    errors: 0,
    toolOrder: [name],
    toolCalls: { [name]: 1 },
    pending: callId === undefined ? [] : [callId],
    questionInputs: [],
    answerTexts: [],
    results: [],
  }
}

function promoteContext(context: ContextState, event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  return {
    id: `run-${event.time}-${event.seq}`,
    startedAt: context.startedAt,
    lastAt: event.time,
    calls: 1,
    errors: 0,
    toolOrder: [name],
    toolCalls: { [name]: 1 },
    pending: callId === undefined ? [] : [callId],
    questionInputs: context.questionInputs,
    answerTexts: context.answerTexts,
    results: [],
  }
}

function extendRun(open: OpenRunState, event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  const toolCalls = { ...open.toolCalls, [name]: (open.toolCalls[name] ?? 0) + 1 }
  const toolOrder = open.toolCalls[name] === undefined ? [...open.toolOrder, name] : open.toolOrder
  return {
    ...open,
    lastAt: event.time,
    calls: open.calls + 1,
    toolCalls,
    toolOrder,
    pending: callId === undefined ? open.pending : [...open.pending, callId],
  }
}

/**
 * Pure transition: previous state + one committed event → next state.
 * Returns the same reference for events that do not change the unit.
 */
export function applyElectroLabProjection(
  state: ElectroLabProjectionState,
  event: ElectroLabSessionEvent,
): ElectroLabProjectionState {
  let next = state
  // An idle gap closes the open run and the stale question window before the
  // event is processed.
  if (next.open !== null && event.time - next.open.lastAt > SETTLE_WINDOW_MS) {
    next = settleOpen(next, event.time)
  }
  if (next.context !== null && event.time - next.context.lastAt > SETTLE_WINDOW_MS) {
    next = clearContext(next)
  }
  switch (event.type) {
    case 'user/message': {
      const text = textFromContent(event.data.content)
      if (next.open !== null) next = settleOpen(next, event.time)
      if (text.length === 0) return next
      if (next.context !== null) {
        // Follow-up question: accumulate into the same window.
        return { ...next, context: { ...next.context, lastAt: event.time, questionInputs: pushCapped(next.context.questionInputs, text, MAX_INPUTS) } }
      }
      return { ...next, context: { startedAt: event.time, lastAt: event.time, questionInputs: [text], answerTexts: [] } }
    }
    case 'assistant/message': {
      const text = textFromContent(event.data.content)
      if (text.length === 0) return next
      if (next.open !== null) {
        return { ...next, open: { ...next.open, answerTexts: pushCapped(next.open.answerTexts, text, MAX_TEXTS) } }
      }
      if (next.context !== null) {
        return { ...next, context: { ...next.context, lastAt: event.time, answerTexts: pushCapped(next.context.answerTexts, text, MAX_TEXTS) } }
      }
      return next
    }
    case 'tool/call': {
      const name = event.data.name
      if (name === undefined || !ELECTRO_LAB_TOOL_NAMES.has(name)) {
        // A foreign tool between electro-lab calls closes the run.
        return next.open === null ? next : settleOpen(next, event.time)
      }
      if (next.open !== null) return { ...next, open: extendRun(next.open, event, name) }
      if (next.context !== null) {
        // First electro-lab call: promote the pre-analysis window into the run.
        return { ...next, open: promoteContext(next.context, event, name), context: null }
      }
      return { ...next, open: openRun(event, name) }
    }
    case 'tool/result': {
      const open = next.open
      const callId = event.data.callId
      if (open === null || callId === undefined || !open.pending.includes(callId)) return next
      const errors = open.errors + (event.data.error === undefined ? 0 : 1)
      const resultText = textFromResultData(event.data)
      const results = resultText.length === 0 ? open.results : pushCapped(open.results, resultText, MAX_TEXTS)
      return { ...next, open: { ...open, errors, results, pending: open.pending.filter((id) => id !== callId) } }
    }
    case 'turn/end': {
      if (next.open !== null) next = settleOpen(next, event.time)
      return clearContext(next)
    }
    default:
      return next
  }
}

/** State → wire payload (newest runs first); open-run serialization for the records page. */
export function viewElectroLabProjection(state: ElectroLabProjectionState): ElectroLabProjectionValue {
  const openState = state.open
  const open = openState === null
    ? null
    : {
        id: openState.id,
        startedAt: openState.startedAt,
        lastAt: openState.lastAt,
        toolCalls: openState.calls,
        errors: openState.errors,
        tools: openState.toolOrder.map((name) => ({ name, calls: openState.toolCalls[name] ?? 0 })),
        questionInputs: openState.questionInputs,
        answerTexts: openState.answerTexts,
        results: openState.results,
      }
  return { runs: state.settled, open }
}
