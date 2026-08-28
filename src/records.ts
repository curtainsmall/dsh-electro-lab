/**
 * RecordManager: builds one settled record per five-step calculation
 * (question → analysis → tool calls → results → answer).
 *
 * The manager is the fold: `feed()` accepts session events one at a time and
 * advances its build state. Held state:
 * - `records` — every settled record (an item is appended only when settled),
 * - `open` — the in-progress record, being assembled from events that arrive
 *   one at a time,
 * - `context` — the pre-analysis window (user messages + assistant texts
 *   before the first tool call) that becomes the record's opening paragraphs.
 *
 * Pure by construction: no subscriptions, no I/O. The host creates one
 * manager per session, feeds events, and appends each returned settled
 * record to the plugin-owned store (see src/index.ts). The manager never
 * touches the session — no appends, no custom event types.
 *
 * Record shape:
 * - `question` — one paragraph: the template's part 1, the consolidated full
 *   question the calculation solves,
 * - `analyse` — one paragraph: the template's part 2, the approach with
 *   formulas,
 * - `answer` — one paragraph: the template's part 5, the final answer,
 * - `calls` — structured tool calls in execution order, keeping the raw
 *   arguments JSON, and `results` — structured tool outputs in call order,
 *   keeping the full output text and error identity. Everything else
 *   (tool counts, error counts) is derivable from these two arrays.
 *
 * Record ids are random UUIDv4 values minted when the record opens. The
 * manager is therefore not replay-deterministic, which is fine: the host
 * never re-appends historical records after a restart (records are
 * live-only; see src/index.ts), so a rebuilt manager's fresh ids can never
 * duplicate the archive.
 *
 * A record opens with the first electro-lab tool call — promoting the
 * pending pre-analysis window collected since the first user message — and
 * settles when:
 * - the turn ends (`turn/end`),
 * - a new user message arrives (`user/message`),
 * - a non-electro-lab tool is called in between (the flow moved on),
 * - no electro-lab activity arrives within {@link SETTLE_WINDOW_MS}.
 * Assistant messages do NOT settle a record.
 */
import { randomUUID } from 'node:crypto'
import { ALL_TOOLS } from './tools/index.ts'
import { filterTool } from './tools/filter-tool.ts'

/** A record settles when no electro-lab activity arrives within this window. */
export const SETTLE_WINDOW_MS = 30 * 60_000
/** Settled records retained in the manager (newest kept). */
export const MAX_RECORDS = 50
/** Per-paragraph text cap for question/analyse/answer and per-message caps. */
export const MAX_TEXT_CHARS = 2000
/** Collected pre/post-tool assistant texts per record (joined into paragraphs). */
export const MAX_TEXTS = 8
/** Structured calls/results kept per record. */
export const MAX_CALLS = 32
export const MAX_RESULTS = 32

/** Every tool the electro-lab plugin registers (ALL_TOOLS + the separately-registered pair). */
export const RECORD_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ALL_TOOLS.map((tool) => tool.name),
  filterTool.name,
  'solve_steps',
])

/** The session-event types the manager folds. */
export enum RecordEventType {
  UserMessage = 'user/message',
  AssistantMessage = 'assistant/message',
  ToolCall = 'tool/call',
  ToolResult = 'tool/result',
  TurnEnd = 'turn/end',
}

/** One structured tool call, keeping the raw arguments. */
export interface RecordCall {
  callId: string
  name: string
  /** Raw arguments JSON string exactly as the model produced it. */
  arguments: string
}

/** One structured tool result, keeping the full output and error identity. */
export interface RecordResult {
  callId: string
  /** The tool-output text (may be empty when the tool returned no text). */
  content: string
  error?: { name: string; code: string }
}

/** A settled record: the closed item shown in the panel. */
export interface Record {
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
  calls: RecordCall[]
  /** Structured tool results, in call order. */
  results: RecordResult[]
}

/** The still-open record, when the session is mid-process. */
export interface OpenRecord {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyse: string
  calls: RecordCall[]
  results: RecordResult[]
}

/** The read view: settled records plus the in-progress one. */
export interface RecordView {
  records: Record[]
  open: OpenRecord | null
}

interface RecordEventBase {
  seq: number
  time: number
}

/**
 * One session event the manager understands, discriminated on `type`; the
 * optional fields ride the union member they belong to (union types over
 * enums with optional fields).
 */
export type RecordEvent =
  | (RecordEventBase & { type: RecordEventType.UserMessage; data: { content?: unknown } })
  | (RecordEventBase & { type: RecordEventType.AssistantMessage; data: { content?: unknown } })
  | (RecordEventBase & { type: RecordEventType.ToolCall; data: { name: string; callId?: string; arguments?: string } })
  | (RecordEventBase & { type: RecordEventType.ToolResult; data: { callId: string; error?: { name: string; code: string }; message?: unknown } })
  | (RecordEventBase & { type: RecordEventType.TurnEnd; data: object })

/** Pre-analysis window: assistant texts before the first tool call. */
interface ContextBuild {
  startedAt: number
  lastAt: number
  /** Pre-tool assistant texts: texts[0] is the question, the rest the analysis. */
  texts: string[]
}

/** The in-progress record: built from events that do not arrive at once. */
interface OpenBuild {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyse: string
  calls: RecordCall[]
  results: RecordResult[]
  pending: string[]
  /** Post-tool assistant texts, joined into `answer` at settle time. */
  answerTexts: string[]
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
function textFromResultData(data: Extract<RecordEvent, { type: RecordEventType.ToolResult }>['data']): string {
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

/**
 * One session's record builder. Feed every committed event; each call returns
 * the record it settled (if any) — once appended, a record is settled and
 * never changes. Reads go through {@link items} and {@link view}.
 */
export class RecordManager {
  private readonly records: Record[] = []
  private open: OpenBuild | null = null
  private context: ContextBuild | null = null

  /** Settled records, newest first. */
  items(): readonly Record[] {
    return this.records
  }

  /** Feed one event; returns the record it settled, or null. */
  feed(event: RecordEvent): Record | null {
    let settled: Record | null = null
    // An idle gap settles the open record and drops the stale window first.
    if (this.open !== null && event.time - this.open.lastAt > SETTLE_WINDOW_MS) settled = this.settle(event.time)
    if (this.context !== null && event.time - this.context.lastAt > SETTLE_WINDOW_MS) this.context = null
    switch (event.type) {
      case RecordEventType.UserMessage: {
        const text = textFromContent(event.data.content)
        if (this.open !== null) settled = this.settle(event.time)
        if (text.length === 0) break
        if (this.context !== null) {
          // Follow-up question: the window continues, keep the collected texts.
          this.context = { ...this.context, lastAt: event.time }
        } else {
          this.context = { startedAt: event.time, lastAt: event.time, texts: [] }
        }
        break
      }
      case RecordEventType.AssistantMessage: {
        const text = textFromContent(event.data.content)
        if (text.length === 0) break
        if (this.open !== null) {
          this.open = { ...this.open, answerTexts: pushCapped(this.open.answerTexts, text, MAX_TEXTS) }
        } else if (this.context !== null) {
          this.context = { ...this.context, lastAt: event.time, texts: pushCapped(this.context.texts, text, MAX_TEXTS) }
        }
        break
      }
      case RecordEventType.ToolCall: {
        const name = event.data.name
        if (name === undefined || !RECORD_TOOL_NAMES.has(name)) {
          // A foreign tool between electro-lab calls settles the record.
          if (this.open !== null) settled = this.settle(event.time)
          break
        }
        if (this.open !== null) {
          this.extendRecord(event.time, event.data.callId, name, event.data.arguments)
        } else if (this.context !== null) {
          // First electro-lab call: promote the pre-analysis window into the record.
          this.promoteContext(event.time, event.data.callId, name, event.data.arguments)
        } else {
          this.openRecord(event.time, event.data.callId, name, event.data.arguments)
        }
        break
      }
      case RecordEventType.ToolResult: {
        const open = this.open
        const callId = event.data.callId
        if (open === null || !open.pending.includes(callId)) break
        const result: RecordResult = {
          callId,
          content: textFromResultData(event.data),
          ...(event.data.error === undefined ? {} : { error: event.data.error }),
        }
        this.open = {
          ...open,
          results: pushCapped(open.results, result, MAX_RESULTS),
          pending: open.pending.filter((id) => id !== callId),
        }
        break
      }
      case RecordEventType.TurnEnd: {
        if (this.open !== null) settled = this.settle(event.time)
        this.context = null
        break
      }
    }
    return settled
  }

  /** The read view: settled records plus the in-progress one. */
  view(): RecordView {
    const open = this.open === null
      ? null
      : {
          id: this.open.id,
          startedAt: this.open.startedAt,
          lastAt: this.open.lastAt,
          question: this.open.question,
          analyse: this.open.analyse,
          calls: this.open.calls,
          results: this.open.results,
        }
    return { records: this.records, open }
  }

  /** Settle the open record: freeze it, prepend it to the items, return it. */
  private settle(at: number): Record {
    const open = this.open
    if (open === null) throw new Error('record manager: settle called with no open record')
    const record: Record = {
      id: open.id,
      startedAt: open.startedAt,
      settledAt: at,
      question: open.question,
      analyse: open.analyse,
      answer: joinParagraph(open.answerTexts),
      calls: open.calls,
      results: open.results,
    }
    this.open = null
    this.records.unshift(record)
    if (this.records.length > MAX_RECORDS) this.records.length = MAX_RECORDS
    return record
  }

  private promoteContext(time: number, callId: string | undefined, name: string, argumentsRaw: string | undefined): void {
    const context = this.context
    if (context === null) return
    this.open = {
      id: randomUUID(),
      startedAt: context.startedAt,
      lastAt: time,
      question: context.texts[0] ?? '',
      analyse: joinParagraph(context.texts.slice(1)),
      calls: [{ callId: callId ?? '', name, arguments: argumentsRaw ?? '' }],
      results: [],
      pending: callId === undefined ? [] : [callId],
      answerTexts: [],
    }
    this.context = null
  }

  private openRecord(time: number, callId: string | undefined, name: string, argumentsRaw: string | undefined): void {
    this.open = {
      id: randomUUID(),
      startedAt: time,
      lastAt: time,
      question: '',
      analyse: '',
      calls: [{ callId: callId ?? '', name, arguments: argumentsRaw ?? '' }],
      results: [],
      pending: callId === undefined ? [] : [callId],
      answerTexts: [],
    }
  }

  private extendRecord(time: number, callId: string | undefined, name: string, argumentsRaw: string | undefined): void {
    const open = this.open
    if (open === null) return
    this.open = {
      ...open,
      lastAt: time,
      calls: pushCapped(open.calls, { callId: callId ?? '', name, arguments: argumentsRaw ?? '' }, MAX_CALLS),
      pending: callId === undefined ? open.pending : [...open.pending, callId],
    }
  }
}
