/**
 * RecordManager: the ONE home of every electro-lab record concern — the open
 * record being assembled, the disk archive of settled records, and the
 * interrupted-state snapshot. No other record module exists.
 *
 * One manager per session. `feed()` accepts session events one at a time and
 * advances the open record; the moment a record settles it is appended to
 * the JSONL archive (`records.jsonl`) and handed back. The session log is
 * never re-read: interrupted state is persisted instead — after every event
 * the open record is snapshotted into `open-record.json`, and the
 * constructor restores it on the first event after a restart. No fold
 * anywhere.
 *
 * Bracket protocol — only what happens between the brackets is recorded:
 * - `record_question` OPENS the record and submits the question text (the
 *   question does not depend on tool results, so it comes first); from then
 *   on the first assistant text is the `question`, pre-tool texts join the
 *   `analyse`, post-tool texts the `answer`; electro-lab tool calls and
 *   `tool/result`s are captured verbatim. `record_analyse` submits the
 *   analysis; a second `record_question` while a record is open settles it
 *   as a duplicate-start error record and opens a new one. There is no fold
 *   — the open record is never continued by a second open.
 * - `record_answer` submits the answer text and SETTLES the record
 *   immediately. When the answer text is the whole merged five-part
 *   template, the parts are split out of it and fill the missing
 *   question/analyse fields.
 * - `record_answer` with no open record (or twice): an ERROR record
 *   (`DuplicateEnd`) is kept.
 * - A settled record with no tool call is an ERROR record (`Incomplete`).
 *   An error record always carries its collected data (when any) plus
 *   `error: { type, message }`.
 *
 * Fallback boundaries (record still closes if the model forgets `record_answer`):
 * - a new `user/message` arrives,
 * - `turn/end`,
 * - no electro-lab activity arrives within {@link SETTLE_WINDOW_MS}.
 * A stray electro-lab tool call with no open record still opens one (data
 * preservation); its paragraphs stay empty unless texts arrive.
 *
 * Record shape:
 * - `question` — one paragraph: the template's part 1, the consolidated full
 *   question the calculation solves,
 * - `analyse` — one paragraph: the template's part 2, the approach with
 *   formulas,
 * - `answer` — one paragraph: the template's part 5, the final answer,
 * - `calls` — structured tool calls in execution order, keeping the raw
 *   arguments JSON, and `results` — structured tool outputs in call order,
 *   keeping the full output text and error identity. The marker calls
 *   themselves are never part of `calls`. Everything else (tool counts,
 *   error counts) is derivable from these two arrays,
 * - `error` — present only on error records: `{ type, message }`.
 *
 * Record ids are random UUIDv4 values minted when the record opens — unique
 * per archive line (a duplicate line is skipped on load) and never
 * re-minted: the archive is written once at settle time.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ALL_TOOLS } from './tools/index.ts'
import { filterTool } from './tools/filter-tool.ts'
import { RECORD_QUESTION_TOOL, RECORD_ANALYSE_TOOL, RECORD_ANSWER_TOOL } from './tools/record-tools.ts'

/** A record settles when no electro-lab activity arrives within this window. */
export const SETTLE_WINDOW_MS = 30 * 60_000
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
  RECORD_QUESTION_TOOL,
  RECORD_ANALYSE_TOOL,
  RECORD_ANSWER_TOOL,
])

/** Archive-declared (external) tool names currently mounted — mutable because the declarations register at plugin start. */
let externalToolNames: ReadonlySet<string> = new Set()

/** Point the record layer at the mounted declaration tools; their calls are recorded and marked external. */
export function setExternalToolNames(names: ReadonlySet<string>): void {
  externalToolNames = names
}

/** Why a record is an error record. */
export enum RecordErrorType {
  /** `record_question` fired while a record was already open: the old one was settled with its data and a new one opened. */
  DuplicateStart = 'duplicate-start',
  /** `record_answer` fired with no open record: an empty error record was kept. */
  DuplicateEnd = 'duplicate-end',
  /** The record settled with no tool call inside the brackets: the events were not enough for a calculation. */
  Incomplete = 'incomplete',
}

/** The session-event types the manager handles. */
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
  /** True when the call targeted an archive-declared (external) tool. */
  external?: boolean
}

/** One structured tool result, keeping the full output and error identity. */
export interface RecordResult {
  callId: string
  /** The tool-output text (may be empty when the tool returned no text). */
  content: string
  error?: { name: string; code: string }
}

/** Error identity of an error record: machine-readable type plus a human message. */
export interface RecordError {
  type: RecordErrorType
  message: string
}

/** A settled record: the closed item shown in the panel. */
export interface Record {
  id: string
  startedAt: number
  settledAt: number
  /** One paragraph — the consolidated full question. */
  question: string
  /** One paragraph — the approach with formulas. */
  analyse: string
  /** One paragraph — the final answer. */
  answer: string
  /** Structured tool calls, in execution order (marker calls excluded). */
  calls: RecordCall[]
  /** Structured tool results, in call order. */
  results: RecordResult[]
  /** Present only on error records. */
  error?: RecordError
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

/**
 * Serializable snapshot of the open record, persisted by the manager
 * (`open-record.json`) so an interrupted record survives a restart — the
 * snapshot replaces replaying the session log (no fold).
 */
export interface OpenSnapshot {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyseTexts: string[]
  calls: RecordCall[]
  results: RecordResult[]
  pending: string[]
  answerTexts: string[]
}

interface RecordEventBase {
  seq: number
  time: number
}

/**
 * One session event the manager understands, discriminated on `type`; the
 * shapes mirror the real dsh-session event vocabulary:
 * - `assistant/message` carries the text as `data.message.content` (the
 *   assembled AssistantMessage),
 * - `tool/result` has NO `callId` on data — the pairing key and the output
 *   text live in `data.message.content[0]` (the ToolResultBlock).
 */
export type RecordEvent =
  | (RecordEventBase & { type: RecordEventType.UserMessage; data: { content?: unknown } })
  | (RecordEventBase & { type: RecordEventType.AssistantMessage; data: { message?: { content?: unknown } } })
  | (RecordEventBase & { type: RecordEventType.ToolCall; data: { name: string; callId?: string; arguments?: string } })
  | (RecordEventBase & { type: RecordEventType.ToolResult; data: { message?: { content?: unknown[] }; error?: { name: string; code: string } } })
  | (RecordEventBase & { type: RecordEventType.TurnEnd; data: object })

/** The in-progress record: built from events that do not arrive at once. */
interface OpenBuild {
  id: string
  startedAt: number
  lastAt: number
  /** The first bracketed assistant text; '' until it arrives. */
  question: string
  /** Pre-tool assistant texts, joined into `analyse` at settle time. */
  analyseTexts: string[]
  calls: RecordCall[]
  results: RecordResult[]
  pending: string[]
  /** Post-tool assistant texts, joined into `answer` at settle time. */
  answerTexts: string[]
}

/**
 * The text payload a `record_answer` call may carry: the model submits the
 * answer text (sometimes with the whole merged five-part template, which
 * {@link resolveTexts} splits out). A missing or empty field falls back to
 * the event-stream texts.
 */
export interface RecordEndPayload {
  question?: string
  analyse?: string
  answer?: string
}

/* ── Disk helpers: the JSONL archive and the open snapshot file ─────────────── */

/** Load the archive: every parseable line is a record; torn lines and duplicate ids are skipped. */
function loadArchive(filePath: string): Record[] {
  try {
    const records: Record[] = []
    const seen = new Set<string>()
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      try {
        const record = JSON.parse(trimmed) as Record
        if (record === null || typeof record !== 'object' || typeof record.id !== 'string' || seen.has(record.id)) continue
        seen.add(record.id)
        records.push(record)
      } catch {
        // Torn line: skip.
      }
    }
    return records
  } catch {
    return []
  }
}

/** Append one immutable line per settled record. Fire-and-forget: a failed write never breaks the pipeline. */
function appendArchive(filePath: string, record: Record): void {
  try {
    appendFileSync(filePath, `${JSON.stringify(record)}\n`)
  } catch {
    // Fire-and-forget.
  }
}

/** Read-only access to the whole archive (endpoint path), oldest first. */
export function readRecordArchive(recordsFile: string): readonly Record[] {
  return loadArchive(recordsFile)
}

/**
 * Delete one settled record from the archive (rewrites the file without
 * it). Returns false when the id is not in the archive or the write fails.
 */
export function deleteRecordFromArchive(recordsFile: string, id: string): boolean {
  try {
    const records = loadArchive(recordsFile)
    const next = records.filter((record) => record.id !== id)
    if (next.length === records.length) return false
    writeFileSync(recordsFile, next.length === 0 ? '' : `${next.map((record) => JSON.stringify(record)).join('\n')}\n`)
    return true
  } catch {
    return false
  }
}

/** The open snapshot map `{ [sessionId]: OpenSnapshot }`; a missing/corrupt file loads as empty. */
type OpenStates = { [sessionId: string]: OpenSnapshot }

/** Load the open snapshot map; a missing/corrupt file loads as empty. */
function loadOpenStates(filePath: string): OpenStates {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const states: OpenStates = {}
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (value !== null && typeof value === 'object') states[sessionId] = value as OpenSnapshot
    }
    return states
  } catch {
    return {}
  }
}

/**
 * Merge one session's snapshot into the open file and write it back
 * (read-merge-write: concurrent sessions never clobber each other). A null
 * snapshot clears the session. Fire-and-forget.
 */
function saveOpenState(filePath: string, sessionId: string, snapshot: OpenSnapshot | null): void {
  const states = loadOpenStates(filePath)
  if (snapshot === null) delete states[sessionId]
  else states[sessionId] = snapshot
  try {
    writeFileSync(filePath, JSON.stringify(states))
  } catch {
    // Fire-and-forget.
  }
}

/* ── Event plumbing ─────────────────────────────────────────────────────────── */

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

/**
 * The ToolResultBlock of a `tool/result` payload: `message.content[0]`. It
 * carries the pairing key (`toolCallId`) and the tool output (`content`) —
 * the real event data has no `callId` field of its own.
 */
function resultBlock(data: Extract<RecordEvent, { type: RecordEventType.ToolResult }>['data']): { toolCallId?: unknown; content?: unknown } | undefined {
  const message = data.message as { content?: unknown[] } | undefined
  const block = message?.content?.[0]
  return block !== null && typeof block === 'object' ? block as { toolCallId?: unknown; content?: unknown } : undefined
}

function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  const next = [...list, item]
  return next.length > cap ? next.slice(next.length - cap) : next
}

function joinParagraph(texts: string[]): string {
  return texts.join('\n\n').slice(0, MAX_TEXT_CHARS)
}

/** The `text` field from a marker tool's arguments string, or undefined. */
function textFromTextArgument(argumentsRaw: string | undefined): string | undefined {
  if (argumentsRaw === undefined || argumentsRaw === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsRaw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const text = (parsed as { text?: unknown }).text
  return typeof text === 'string' && text.trim().length > 0 ? text : undefined
}

/**
 * Remove numbered part-title lines (`1. 分析（Analyse）`, `2. 计划（Plan）`,
 * …) from a directly submitted question/analyse text, so the record holds
 * the content only. Content lines starting with `- ` or plain paragraphs
 * are untouched. The answer payload keeps its structure — the merged
 * template needs its markers to split.
 */
function stripPartTitles(text: string): string {
  return text.replace(/^\d+\.[ \t]*[^\n]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Split a five-part template text into its segments by the part markers
 * (`N. **标题（Title）**`) and strip each segment's title line, so the
 * record texts hold the content only. Returns undefined when no template
 * structure is found.
 */
function splitTemplatePayload(text: string): { question?: string; analyse?: string; answer?: string } | undefined {
  const segments = text.split(/\n(?=\d+\.\s)/).map((s) => s.trim()).filter((s) => s.length > 0)
  if (segments.length < 2) return undefined
  const result: { question?: string; analyse?: string; answer?: string } = {}
  for (const segment of segments) {
    // Drop the segment's own title line (e.g. `1. **问题（Question）**`).
    const body = segment.replace(/^\d+\.[ \t]*[^\n]*/, '').trim()
    if (/问题|Question/i.test(segment)) result.question = body
    else if (/分析|Analysis/i.test(segment)) result.analyse = body
    else if (/答案|Answer/i.test(segment)) result.answer = body
  }
  return result.question !== undefined || result.analyse !== undefined || result.answer !== undefined ? result : undefined
}

/**
 * Resolve the three record texts at settle time. Priority per field:
 * 1. the payload field given directly,
 * 2. the text already collected in the open record (record_question /
 *    record_analyse / event stream),
 * 3. the part split out of a merged five-part template in the `answer`
 *    payload (fills gaps only).
 * The answer field is special: when the payload answer IS the merged
 * template, its split answer wins (it drops the table segments).
 */
function resolveTexts(payload: RecordEndPayload | undefined, current: { question: string; analyse: string; answer: string }): RecordEndPayload {
  const split = payload?.answer === undefined ? undefined : splitTemplatePayload(payload.answer)
  const result: RecordEndPayload = {}
  for (const field of ['question', 'analyse', 'answer'] as const) {
    const direct = payload?.[field]
    const existing = current[field]
    if (field === 'answer' && direct !== undefined) {
      result.answer = split?.answer ?? direct
    } else if (direct !== undefined) {
      result[field] = direct
    } else if (existing !== '') {
      result[field] = existing
    } else if (split?.[field] !== undefined) {
      result[field] = split[field]
    }
  }
  return result
}

function snapshotToBuild(snapshot: OpenSnapshot): OpenBuild {
  return {
    id: snapshot.id,
    startedAt: snapshot.startedAt,
    lastAt: snapshot.lastAt,
    question: snapshot.question,
    analyseTexts: snapshot.analyseTexts,
    calls: snapshot.calls,
    results: snapshot.results,
    pending: snapshot.pending,
    answerTexts: snapshot.answerTexts,
  }
}

/**
 * One session's record manager: the ONLY record module — it owns the open
 * record, the JSONL archive and the interrupted-open snapshot file. Feed
 * every committed event; each call returns the record it settled (if any).
 * Settled records are appended to the archive the moment they settle; the
 * open record is snapshotted after every event and restored by the
 * constructor after a restart. Reads always go to disk — nothing is held in
 * memory beyond the open record.
 */
export class RecordManager {
  private open: OpenBuild | null

  constructor(
    private readonly sessionId: string,
    private readonly recordsFile: string,
    private readonly openFile: string,
  ) {
    const saved = loadOpenStates(this.openFile)[this.sessionId] ?? null
    this.open = saved === null ? null : snapshotToBuild(saved)
  }

  /** All settled records from the disk archive, newest first. */
  records(): readonly Record[] {
    return [...loadArchive(this.recordsFile)].reverse()
  }

  /** Feed one event; returns the record it settled, or null. */
  feed(event: RecordEvent): Record | null {
    let settled: Record | null = null
    // An idle gap settles the open record first.
    if (this.open !== null && event.time - this.open.lastAt > SETTLE_WINDOW_MS) settled = this.settle(event.time)
    switch (event.type) {
      case RecordEventType.UserMessage: {
        // A new user message closes the open record (fallback); its text is
        // outside the brackets and is never recorded.
        if (this.open !== null) settled = this.settle(event.time)
        break
      }
      case RecordEventType.AssistantMessage: {
        const text = textFromContent(event.data.message?.content)
        if (text.length === 0 || this.open === null) break
        const open = this.open
        if (open.question === '' && open.calls.length === 0) {
          this.open = { ...open, lastAt: event.time, question: text }
        } else if (open.calls.length === 0) {
          this.open = { ...open, lastAt: event.time, analyseTexts: pushCapped(open.analyseTexts, text, MAX_TEXTS) }
        } else {
          this.open = { ...open, lastAt: event.time, answerTexts: pushCapped(open.answerTexts, text, MAX_TEXTS) }
        }
        break
      }
      case RecordEventType.ToolCall: {
        const name = event.data.name
        if (name === RECORD_QUESTION_TOOL) {
          // Opens the record AND submits the question text; the question
          // does not depend on tool results, so it comes before any call.
          const text = textFromTextArgument(event.data.arguments)
          if (this.open !== null) {
            // Duplicate start: keep the open record as an error record, then start fresh.
            settled = this.settle(event.time, {
              type: RecordErrorType.DuplicateStart,
              message: 'record_question fired while a record was already open; it was settled as an error record',
            })
          }
          this.openRecord(event.time)
          if (text !== undefined) {
            const open = this.open
            if (open !== null) this.open = { ...open, lastAt: event.time, question: stripPartTitles(text) }
          }
          break
        }
        if (name === RECORD_ANALYSE_TOOL) {
          const text = textFromTextArgument(event.data.arguments)
          if (text !== undefined && this.open !== null) {
            const open = this.open
            this.open = { ...open, lastAt: event.time, analyseTexts: pushCapped(open.analyseTexts, stripPartTitles(text), MAX_TEXTS) }
          }
          break
        }
        if (name === RECORD_ANSWER_TOOL) {
          // Submits the answer text AND settles the record immediately.
          const text = textFromTextArgument(event.data.arguments)
          if (this.open !== null) {
            settled = this.settle(event.time, undefined, text === undefined ? undefined : { answer: text })
          } else {
            // Duplicate end: keep an empty error record.
            settled = this.recordError(event.time, {
              type: RecordErrorType.DuplicateEnd,
              message: 'record_answer fired with no open record',
            })
          }
          break
        }
        const isRecordTool = name !== undefined && RECORD_TOOL_NAMES.has(name)
        const isExternal = name !== undefined && externalToolNames.has(name)
        if (!isRecordTool && !isExternal) {
          // A foreign tool between electro-lab calls settles the record.
          if (this.open !== null) settled = this.settle(event.time)
          break
        }
        if (this.open !== null) {
          this.extendRecord(event.time, event.data.callId, name, event.data.arguments, isExternal)
        } else {
          // Stray electro-lab call: open a record to preserve the data.
          this.openRecord(event.time)
          this.extendRecord(event.time, event.data.callId, name, event.data.arguments, isExternal)
        }
        break
      }
      case RecordEventType.ToolResult: {
        const open = this.open
        // The real tool/result event has NO callId on data — the pairing key
        // and the output text live in the ToolResultBlock
        // (message.content[0].toolCallId).
        const block = resultBlock(event.data)
        const rawCallId = block?.toolCallId
        const callId = typeof rawCallId === 'string' ? rawCallId : undefined
        if (open === null || callId === undefined || !open.pending.includes(callId)) break
        const result: RecordResult = {
          callId,
          content: block?.content === undefined ? '' : textFromContent(block.content),
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
        break
      }
    }
    // The manager owns the disk: settle → archive append; every event → open snapshot.
    if (settled !== null) appendArchive(this.recordsFile, settled)
    saveOpenState(this.openFile, this.sessionId, this.snapshot())
    return settled
  }

  /** The still-open record, or null. */
  view(): OpenRecord | null {
    if (this.open === null) return null
    return {
      id: this.open.id,
      startedAt: this.open.startedAt,
      lastAt: this.open.lastAt,
      question: this.open.question,
      analyse: joinParagraph(this.open.analyseTexts),
      calls: this.open.calls,
      results: this.open.results,
    }
  }

  /** The open record as a persistable snapshot (copies of the arrays), or null. */
  snapshot(): OpenSnapshot | null {
    if (this.open === null) return null
    const open = this.open
    return {
      id: open.id,
      startedAt: open.startedAt,
      lastAt: open.lastAt,
      question: open.question,
      analyseTexts: [...open.analyseTexts],
      calls: [...open.calls],
      results: [...open.results],
      pending: [...open.pending],
      answerTexts: [...open.answerTexts],
    }
  }

  /** Restore the open record from a persisted snapshot. */
  restore(snapshot: OpenSnapshot): void {
    this.open = snapshotToBuild(snapshot)
  }

  /** Settle the open record: freeze it and return it. Payload fields win over event-stream texts. */
  private settle(at: number, error?: RecordError, payload?: RecordEndPayload): Record {
    const open = this.open
    if (open === null) throw new Error('record manager: settle called with no open record')
    const texts = resolveTexts(payload, {
      question: open.question,
      analyse: joinParagraph(open.analyseTexts),
      answer: joinParagraph(open.answerTexts),
    })
    const record: Record = {
      id: open.id,
      startedAt: open.startedAt,
      settledAt: at,
      question: texts.question ?? '',
      analyse: texts.analyse ?? '',
      answer: texts.answer ?? '',
      calls: open.calls,
      results: open.results,
      ...(error !== undefined
        ? { error }
        // No tool call inside the brackets: the events were not enough for a calculation.
        : open.calls.length === 0
          ? { error: { type: RecordErrorType.Incomplete, message: 'the record has no tool call: not enough events for a calculation' } as RecordError }
          : {}),
    }
    this.open = null
    return record
  }

  /** Keep an error record with no open build behind it (e.g. duplicate `record_answer`). */
  private recordError(at: number, error: RecordError): Record {
    const record: Record = {
      id: randomUUID(),
      startedAt: at,
      settledAt: at,
      question: '',
      analyse: '',
      answer: '',
      calls: [],
      results: [],
      error,
    }
    return record
  }

  private openRecord(time: number): void {
    this.open = {
      id: randomUUID(),
      startedAt: time,
      lastAt: time,
      question: '',
      analyseTexts: [],
      calls: [],
      results: [],
      pending: [],
      answerTexts: [],
    }
  }

  private extendRecord(time: number, callId: string | undefined, name: string, argumentsRaw: string | undefined, external = false): void {
    const open = this.open
    if (open === null) return
    const call: RecordCall = { callId: callId ?? '', name, arguments: argumentsRaw ?? '' }
    if (external) call.external = true
    this.open = {
      ...open,
      lastAt: time,
      calls: pushCapped(open.calls, call, MAX_CALLS),
      pending: callId === undefined ? open.pending : [...open.pending, callId],
    }
  }
}
