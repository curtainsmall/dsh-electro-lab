/**
 * ElectroLab run records: a session-projection fold that traces committed
 * session events into settled runs of electro-lab tool calls — the
 * five-step process (question → analysis → tool calls → results → answer).
 *
 * Pure functions only (no subscriptions, no I/O): the host feeds every
 * committed session event through the fold and persists each settled run
 * one-shot to the plugin-owned record store (see src/index.ts). The fold
 * never touches the session — no appends, no custom event types.
 *
 * Record shape:
 * - `question` — one paragraph: the template's part 1, the consolidated full
 *   question the run solves,
 * - `analyse` — one paragraph: the template's part 2, the approach with
 *   formulas,
 * - `answer` — one paragraph: the template's part 5, the final answer,
 * - `calls` — structured tool calls in execution order, keeping the raw
 *   arguments JSON, and `results` — structured tool outputs in call order,
 *   keeping the full output text and error identity. Everything else
 *   (tool counts, error counts) is derivable from these two arrays.
 *
 * Run ids are deterministic UUIDv5 values over the first call's `time:seq`
 * (see {@link runUuid}): UUID-shaped, replay-stable, and globally unique
 * across sessions even though the fold never sees the session id.
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
import { createHash } from 'node:crypto'
import { ALL_TOOLS } from './tools/index.ts'
import { filterTool } from './tools/filter-tool.ts'

/** A run closes when no electro-lab activity arrives within this window. */
export const SETTLE_WINDOW_MS = 30 * 60_000
/** Settled runs retained in state (newest kept). */
export const MAX_RUNS = 50
/** Per-paragraph text cap for question/analyse/answer and per-message caps. */
export const MAX_TEXT_CHARS = 2000
/** Collected pre/post-tool assistant texts per run (joined into paragraphs). */
export const MAX_TEXTS = 8
/** Structured calls/results kept per run. */
export const MAX_CALLS = 32
export const MAX_RESULTS = 32

/**
 * Deterministic UUIDv5 for a run id: hashing the first call's `time:seq`
 * keeps the fold pure and replay-stable (a random UUIDv4 would mint a fresh
 * id on every log replay, duplicating records after a restart) while giving
 * the standard UUID shape. Globally unique because time+seq is.
 */
function runUuid(time: number, seq: number): string {
  const digest = createHash('sha1').update(`dsh-electro-lab:${time}:${seq}`).digest()
  digest[6] = (digest[6]! & 0x0f) | 0x50 // version 5
  digest[8] = (digest[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = digest.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Every tool the electro-lab plugin registers (ALL_TOOLS + the separately-registered pair). */
export const ELECTRO_LAB_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ALL_TOOLS.map((tool) => tool.name),
  filterTool.name,
  'solve_steps',
])

/** One structured tool call, keeping the raw arguments. */
export interface ElectroLabCall {
  callId: string
  name: string
  /** Raw arguments JSON string exactly as the model produced it. */
  arguments: string
}

/** One structured tool result, keeping the full output and error identity. */
export interface ElectroLabResult {
  callId: string
  /** The tool-output text (may be empty when the tool returned no text). */
  content: string
  error?: { name: string; code: string }
}

/** A settled run: the closed record shown in the panel. */
export interface ElectroLabRun {
  id: string
  startedAt: number
  settledAt: number
  /** One paragraph — the consolidated full question (template part 1). */
  question: string
  /** One paragraph — the approach with formulas (template part 2). */
  analyse: string
  /** One paragraph — the final answer (template part 5). */
  answer: string
  /** Structured tool calls, in execution order. */
  calls: ElectroLabCall[]
  /** Structured tool results, in call order. */
  results: ElectroLabResult[]
}

/** The still-open run, when the session is mid-process. */
export interface ElectroLabOpenRun {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyse: string
  calls: ElectroLabCall[]
  results: ElectroLabResult[]
}

/** The wire payload for the records page. */
export interface ElectroLabProjectionValue {
  runs: ElectroLabRun[]
  open: ElectroLabOpenRun | null
}

/** Pre-analysis window: assistant texts before the first tool call. */
interface ContextState {
  startedAt: number
  lastAt: number
  /** Pre-tool assistant texts: texts[0] is the question, the rest the analysis. */
  texts: string[]
}

/** Internal per-call bookkeeping of the open run. */
interface OpenRunState {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyse: string
  calls: ElectroLabCall[]
  results: ElectroLabResult[]
  pending: string[]
  /** Post-tool assistant texts, joined into `answer` at settle time. */
  answerTexts: string[]
}

/** The fold state: plain JSON, ready for the persisted cache. */
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
    arguments?: string
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

/** Extract the tool-output text from a `tool/result` payload (message.content[0] is the ToolResultBlock). */
function textFromResultData(data: ElectroLabSessionEvent['data']): string {
  const message = data.message as { content?: unknown[] } | undefined
  const block = message?.content?.[0] as { type?: unknown; content?: unknown } | undefined
  return block?.type === 'tool-result' ? textFromContent(block.content) : ''
}

function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  const next = [...list, item]
  return next.length > cap ? next.slice(next.length - cap) : next
}

function joinParagraph(texts: string[]): string {
  return texts.join('\n\n').slice(0, MAX_TEXT_CHARS)
}

function settleOpen(state: ElectroLabProjectionState, settledAt: number): ElectroLabProjectionState {
  const open = state.open
  if (open === null) return state
  const run: ElectroLabRun = {
    id: open.id,
    startedAt: open.startedAt,
    settledAt,
    question: open.question,
    analyse: open.analyse,
    answer: joinParagraph(open.answerTexts),
    calls: open.calls,
    results: open.results,
  }
  return { open: null, context: state.context, settled: [run, ...state.settled].slice(0, MAX_RUNS) }
}

function clearContext(state: ElectroLabProjectionState): ElectroLabProjectionState {
  return state.context === null ? state : { ...state, context: null }
}

function promoteContext(context: ContextState, event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  return {
    id: runUuid(event.time, event.seq),
    startedAt: context.startedAt,
    lastAt: event.time,
    question: context.texts[0] ?? '',
    analyse: joinParagraph(context.texts.slice(1)),
    calls: [{ callId: callId ?? '', name, arguments: event.data.arguments ?? '' }],
    results: [],
    pending: callId === undefined ? [] : [callId],
    answerTexts: [],
  }
}

function openRun(event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  return {
    id: runUuid(event.time, event.seq),
    startedAt: event.time,
    lastAt: event.time,
    question: '',
    analyse: '',
    calls: [{ callId: callId ?? '', name, arguments: event.data.arguments ?? '' }],
    results: [],
    pending: callId === undefined ? [] : [callId],
    answerTexts: [],
  }
}

function extendRun(open: OpenRunState, event: ElectroLabSessionEvent, name: string): OpenRunState {
  const callId = event.data.callId
  return {
    ...open,
    lastAt: event.time,
    calls: pushCapped(open.calls, { callId: callId ?? '', name, arguments: event.data.arguments ?? '' }, MAX_CALLS),
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
        // Follow-up question: the window continues, keep the collected texts.
        return { ...next, context: { ...next.context, lastAt: event.time } }
      }
      return { ...next, context: { startedAt: event.time, lastAt: event.time, texts: [] } }
    }
    case 'assistant/message': {
      const text = textFromContent(event.data.content)
      if (text.length === 0) return next
      if (next.open !== null) {
        return { ...next, open: { ...next.open, answerTexts: pushCapped(next.open.answerTexts, text, MAX_TEXTS) } }
      }
      if (next.context !== null) {
        return { ...next, context: { ...next.context, lastAt: event.time, texts: pushCapped(next.context.texts, text, MAX_TEXTS) } }
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
      const result: ElectroLabResult = {
        callId,
        content: textFromResultData(event.data),
        ...(event.data.error === undefined ? {} : { error: event.data.error }),
      }
      return { ...next, open: { ...open, results: pushCapped(open.results, result, MAX_RESULTS), pending: open.pending.filter((id) => id !== callId) } }
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
        question: openState.question,
        analyse: openState.analyse,
        calls: openState.calls,
        results: openState.results,
      }
  return { runs: state.settled, open }
}
