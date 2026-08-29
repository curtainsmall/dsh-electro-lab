import { mkdtempSync, rmSync, appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RECORD_TOOL_NAMES,
  RecordErrorType,
  RecordEventType,
  RecordManager,
  SETTLE_WINDOW_MS,
  type Record as SettledRecord,
  type RecordEvent,
} from '../src/records.ts'

function event(type: RecordEventType, seq: number, time: number, data: Record<string, unknown> = {}): RecordEvent {
  return { type, seq, time, data: data as RecordEvent['data'] } as RecordEvent
}

const textContent = (text: string) => [{ type: 'text', text }]
const userMessage = (seq: number, time: number, text?: string) => event(RecordEventType.UserMessage, seq, time, text === undefined ? {} : { content: textContent(text) })
const assistantMessage = (seq: number, time: number, text: string) => event(RecordEventType.AssistantMessage, seq, time, { message: { content: textContent(text) } })
const startCall = (seq: number, time: number, callId = `s${seq}`) =>
  event(RecordEventType.ToolCall, seq, time, { name: 'record_start', callId })
const endCall = (seq: number, time: number, callId = `e${seq}`, args?: string) =>
  event(RecordEventType.ToolCall, seq, time, { name: 'record_end', callId, ...(args === undefined ? {} : { arguments: args }) })
const calculateCall = (seq: number, time: number, callId = `c${seq}`, args = '{"expression":"1+1"}') =>
  event(RecordEventType.ToolCall, seq, time, { name: 'calculate', callId, arguments: args })
const calculateResult = (seq: number, time: number, callId: string, error?: { name: string; code: string }, content?: unknown) =>
  event(RecordEventType.ToolResult, seq, time, {
    error,
    message: content === undefined ? undefined : { content: [{ type: 'tool-result', toolCallId: callId, content }] },
  })
const turnEnd = (seq: number, time: number) => event(RecordEventType.TurnEnd, seq, time)

/** A fresh disk-backed environment; every manager created here shares the same archive files. */
const dirs: string[] = []
function makeEnv(): {
  manager: RecordManager
  makeManager: (sessionId?: string) => RecordManager
  recordsFile: string
  openFile: string
} {
  const dir = mkdtempSync(join(tmpdir(), 'electro-lab-records-'))
  dirs.push(dir)
  const recordsFile = join(dir, 'records.jsonl')
  const openFile = join(dir, 'open-record.json')
  const makeManager = (sessionId = 'session-a') => new RecordManager(sessionId, recordsFile, openFile)
  return { manager: makeManager(), makeManager, recordsFile, openFile }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Feed every event and collect the settled records the manager hands out. */
function feedAll(manager: RecordManager, events: RecordEvent[]): SettledRecord[] {
  const settled: SettledRecord[] = []
  for (const item of events) {
    const record = manager.feed(item)
    if (record !== null) settled.push(record)
  }
  return settled
}

describe('record manager (markers read from the tool/call events)', () => {
  it('starts empty', () => {
    const { manager } = makeEnv()
    expect(manager.view()).toBeNull()
    expect(manager.records()).toEqual([])
  })

  it('recognises every registered tool, the markers and solve_steps/filter_design', () => {
    for (const name of ['calculate', 'resonance', 'convert', 'transient_response', 'solve_steps', 'filter_design', 'record_start', 'record_end']) {
      expect(RECORD_TOOL_NAMES.has(name)).toBe(true)
    }
    expect(RECORD_TOOL_NAMES.has('some_foreign_tool')).toBe(false)
  })

  it('records the texts between the brackets, settles on record_end, and excludes marker calls from calls', () => {
    const { manager } = makeEnv()
    manager.feed(assistantMessage(1, 900, 'bracket 之前的文本不算'))
    manager.feed(startCall(2, 1000))
    manager.feed(assistantMessage(3, 1100, '10 µF 与 50 mH 并联的谐振频率与带宽是多少?'))
    manager.feed(assistantMessage(4, 1200, '分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)'))
    manager.feed(calculateCall(5, 1300, 'c5', '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}'))
    manager.feed(calculateResult(6, 1400, 'c5', undefined, textContent('{"re": 225.079, "im": 0}')))
    expect(manager.feed(assistantMessage(7, 1500, '答案:f₀ ≈ 225 Hz。'))).toBeNull()
    // record_end settles immediately; texts after it are outside the brackets.
    const settled = manager.feed(endCall(8, 1600))
    expect(settled).not.toBeNull()
    expect(settled!.question).toBe('10 µF 与 50 mH 并联的谐振频率与带宽是多少?')
    expect(settled!.analyse).toBe('分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)')
    expect(settled!.answer).toBe('答案:f₀ ≈ 225 Hz。')
    expect(settled!.startedAt).toBe(1000)
    expect(settled!.settledAt).toBe(1600)
    expect(settled!.error).toBeUndefined()
    expect(settled!.calls).toEqual([
      { callId: 'c5', name: 'calculate', arguments: '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}' },
    ])
    expect(settled!.results).toEqual([{ callId: 'c5', content: '{"re": 225.079, "im": 0}' }])
    manager.feed(assistantMessage(9, 1700, 'bracket 之后的文本也不算'))
    expect(manager.view()).toBeNull()
    expect(manager.records()).toHaveLength(1)
  })

  it('record_end payload (raw JSON arguments) fills the three texts', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 225, "im": 0}')))
    const payload = JSON.stringify({
      question: '10 µF 与 50 mH 并联的谐振频率与带宽是多少?',
      analyse: 'f₀ = 1/(2π√(LC)), Q = R√(C/L)',
      answer: 'f₀ ≈ 225 Hz, 带宽约 1.6 kHz。',
    })
    const settled = manager.feed(endCall(4, 1300, 'e4', payload))
    expect(settled).not.toBeNull()
    expect(settled!.question).toBe('10 µF 与 50 mH 并联的谐振频率与带宽是多少?')
    expect(settled!.analyse).toBe('f₀ = 1/(2π√(LC)), Q = R√(C/L)')
    expect(settled!.answer).toBe('f₀ ≈ 225 Hz, 带宽约 1.6 kHz。')
    expect(settled!.settledAt).toBe(1300)
    expect(settled!.calls).toHaveLength(1)
    expect(settled!.error).toBeUndefined()
  })

  it('payload fields fall back to the event-stream texts when missing', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, '问题来自事件流'))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(calculateResult(4, 1300, 'c3', undefined, textContent('{"re": 50, "im": 0}')))
    manager.feed(assistantMessage(5, 1400, '答案来自事件流'))
    // Only `answer` is in the payload — question/analyse come from the stream.
    const settled = manager.feed(endCall(6, 1500, 'e6', JSON.stringify({ answer: '答案来自载荷' })))
    expect(settled!.question).toBe('问题来自事件流')
    expect(settled!.analyse).toBe('')
    expect(settled!.answer).toBe('答案来自载荷')
    // A malformed payload is ignored entirely.
    manager.feed(startCall(7, 1600))
    manager.feed(calculateCall(8, 1700, 'c8'))
    const fallback = manager.feed(endCall(9, 1800, 'e9', 'not json'))
    expect(fallback!.answer).toBe('')
    expect(fallback!.error).toBeUndefined()
  })

  it('keeps a multi-step record together across assistant messages within the brackets', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 50, "im": 0}')))
    manager.feed(assistantMessage(4, 1300, '中间文本'))
    manager.feed(calculateCall(5, 1400, 'c5'))
    manager.feed(calculateResult(6, 1500, 'c5', undefined, textContent('{"re": 225, "im": 0}')))
    const settled = manager.feed(endCall(7, 1600))
    expect(settled!.calls).toHaveLength(2)
    expect(settled!.results).toHaveLength(2)
    expect(settled!.answer).toBe('中间文本')
  })

  it('duplicate start settles the open record as an error record and opens a new one', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, '第一个问题'))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(calculateResult(4, 1300, 'c3'))
    const settled = manager.feed(startCall(5, 1400))
    expect(settled).not.toBeNull()
    expect(settled!.error).toEqual({
      type: RecordErrorType.DuplicateStart,
      message: expect.stringContaining('record_start') as string,
    })
    // The error record carries its collected data.
    expect(settled!.question).toBe('第一个问题')
    expect(settled!.calls).toHaveLength(1)
    expect(settled!.settledAt).toBe(1400)
    // A fresh record is open.
    expect(manager.view()).not.toBeNull()
    expect(manager.view()!.id).not.toBe(settled!.id)
  })

  it('a start with no open record opens a new one', () => {
    const { manager } = makeEnv()
    expect(manager.feed(startCall(1, 1000))).toBeNull()
    expect(manager.view()).not.toBeNull()
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(endCall(3, 1200))
    expect(settled!.error).toBeUndefined()
    expect(settled!.calls).toHaveLength(1)
  })

  it('duplicate end keeps an empty error record', () => {
    const { manager } = makeEnv()
    const first = manager.feed(endCall(1, 1000))
    expect(first!.error!.type).toBe(RecordErrorType.DuplicateEnd)
    expect(first!.calls).toEqual([])
    expect(first!.startedAt).toBe(1000)
    expect(first!.settledAt).toBe(1000)
    // After a settle there is no open record either: another end is again an error record.
    manager.feed(startCall(2, 1100))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(endCall(4, 1300))
    const second = manager.feed(endCall(5, 1400))
    expect(second).not.toBeNull()
    expect(second!.error!.type).toBe(RecordErrorType.DuplicateEnd)
    expect(manager.view()).toBeNull()
  })

  it('a record with no tool call is an incomplete error record', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, '只有问题没有工具'))
    const settled = manager.feed(endCall(3, 1200))
    expect(settled!.error!.type).toBe(RecordErrorType.Incomplete)
    // Data collected before the failure is still carried.
    expect(settled!.question).toBe('只有问题没有工具')
    expect(settled!.calls).toEqual([])
  })

  it('settles the open record on a user message (its text is outside the brackets)', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, '问题'))
    const settled = manager.feed(userMessage(3, 1200, '新话题'))
    expect(settled).not.toBeNull()
    expect(settled!.error!.type).toBe(RecordErrorType.Incomplete)
    expect(manager.view()).toBeNull()
  })

  it('settles the open record on turn end', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(turnEnd(3, 1200))
    expect(settled!.calls).toHaveLength(1)
    expect(settled!.error).toBeUndefined()
    expect(manager.view()).toBeNull()
  })

  it('settles the open record when a foreign tool is called in between', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    const settled = manager.feed(event(RecordEventType.ToolCall, 2, 1100, { name: 'some_foreign_tool', callId: 'x' }))
    expect(settled).not.toBeNull()
    expect(settled!.settledAt).toBe(1100)
    manager.feed(calculateCall(3, 1200))
    expect(manager.view()).not.toBeNull()
  })

  it('settles a stale record on the idle gap and opens a new one', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    const settled = manager.feed(calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1))
    expect(settled).not.toBeNull()
    expect(settled!.settledAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
    expect(manager.view()).not.toBeNull()
    expect(manager.view()!.startedAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
  })

  it('reports the open record through view before it settles', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, 'q'))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(calculateResult(4, 1300, 'c3'))
    const open = manager.view()
    expect(open).not.toBeNull()
    expect(open!.calls).toHaveLength(1)
    expect(open!.analyse).toBe('')
  })

  it('appends every settled record to the disk archive exactly once', () => {
    const { manager } = makeEnv()
    const settled = feedAll(manager, [
      startCall(1, 1000),
      calculateCall(2, 1100, 'c2'),
      endCall(3, 1200),
      startCall(4, 1300),
      calculateCall(5, 1400, 'c5'),
      endCall(6, 1500),
    ])
    expect(settled).toHaveLength(2)
    expect(manager.records()).toHaveLength(2)
    // Newest first, matching the two settles.
    expect(manager.records()[0]!.startedAt).toBe(1300)
    expect(manager.records()[1]!.startedAt).toBe(1000)
    expect(manager.view()).toBeNull()
  })

  it('persists the open snapshot after every event and restores it on a fresh instance (restart)', () => {
    const { recordsFile, openFile, manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(assistantMessage(2, 1100, '问题'))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(calculateResult(4, 1300, 'c3', undefined, textContent('{"re": 225, "im": 0}')))
    // A brand-new manager over the SAME files = restart: the constructor
    // loads the persisted snapshot and the interrupted record is restored.
    const restarted = new RecordManager('session-a', recordsFile, openFile)
    expect(restarted.view()).not.toBeNull()
    expect(restarted.view()!.id).toBe(manager.view()!.id)
    expect(restarted.view()!.calls).toHaveLength(1)
    // The restored record keeps tracking: a follow-up event extends it.
    expect(restarted.feed(assistantMessage(5, 1400, '答案'))).toBeNull()
    const settled = restarted.feed(endCall(6, 1500))
    expect(settled!.id).toBe(manager.view()!.id)
    expect(settled!.question).toBe('问题')
    expect(settled!.answer).toBe('答案')
    // Settled → archive; snapshot cleared for the session.
    expect(restarted.records()).toHaveLength(1)
    expect(restarted.view()).toBeNull()
  })

  it('restores an interrupted record from its snapshot and continues to a settle', () => {
    const first = makeEnv().manager
    first.feed(startCall(1, 1000))
    first.feed(assistantMessage(2, 1100, '问题'))
    first.feed(calculateCall(3, 1200, 'c3'))
    first.feed(calculateResult(4, 1300, 'c3', undefined, textContent('{"re": 225, "im": 0}')))
    const snapshot = first.snapshot()!
    // A brand-new manager (restart): restore, then keep feeding new events.
    const second = makeEnv().makeManager()
    second.restore(snapshot)
    expect(second.view()!.id).toBe(snapshot.id)
    expect(second.feed(assistantMessage(5, 1400, '答案'))).toBeNull()
    const settled = second.feed(endCall(6, 1500))
    expect(settled!.id).toBe(snapshot.id)
    expect(settled!.question).toBe('问题')
    expect(settled!.answer).toBe('答案')
    expect(settled!.calls).toEqual([{ callId: 'c3', name: 'calculate', arguments: '{"expression":"1+1"}' }])
    expect(settled!.error).toBeUndefined()
  })

  it('mints random UUIDv4 ids: every record gets a fresh one', () => {
    const { makeManager } = makeEnv()
    const mint = (): string => {
      const manager = makeManager()
      manager.feed(startCall(1, 1000))
      manager.feed(calculateCall(2, 1100, 'c2'))
      return manager.feed(endCall(3, 1200))!.id
    }
    const a = mint()
    const b = mint()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('records result errors structurally', () => {
    const { manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', { name: 'Error', code: 'E_INVALID' }, textContent('bad input')))
    const settled = manager.feed(endCall(4, 1300))
    expect(settled!.results).toEqual([{ callId: 'c2', content: 'bad input', error: { name: 'Error', code: 'E_INVALID' } }])
    expect(settled!.error).toBeUndefined()
  })

  it('ignores assistant texts with no open record', () => {
    const { manager } = makeEnv()
    manager.feed(assistantMessage(1, 1000, 'unrelated chatter'))
    expect(manager.view()).toBeNull()
    expect(manager.records()).toEqual([])
  })

  it('a stray electro-lab call opens a record to preserve the data', () => {
    const { manager } = makeEnv()
    manager.feed(calculateCall(1, 1000, 'c1'))
    const settled = manager.feed(endCall(2, 1100))
    expect(settled!.calls).toEqual([{ callId: 'c1', name: 'calculate', arguments: '{"expression":"1+1"}' }])
    expect(settled!.error).toBeUndefined()
    expect(settled!.question).toBe('')
  })

  it('skips torn lines and duplicate ids in the archive on load', () => {
    const { recordsFile, openFile, manager } = makeEnv()
    manager.feed(startCall(1, 1000))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(endCall(3, 1200))
    expect(settled!.error).toBeUndefined()
    // A torn tail line and a duplicated line (same id).
    appendFileSync(recordsFile, '{"id":"record-9"')
    appendFileSync(recordsFile, `${JSON.stringify(settled)}\n`)
    const reloaded = new RecordManager('session-a', recordsFile, openFile)
    expect(reloaded.records()).toHaveLength(1)
    expect(reloaded.records()[0]!.id).toBe(settled!.id)
  })

  it('starts empty for a missing or corrupt archive and corrupt open file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'electro-lab-records-'))
    dirs.push(dir)
    const recordsFile = join(dir, 'records.jsonl')
    const openFile = join(dir, 'open-record.json')
    expect(new RecordManager('s', recordsFile, openFile).records()).toEqual([])
    expect(new RecordManager('s', recordsFile, openFile).view()).toBeNull()
    writeFileSync(recordsFile, 'not json\n{"id":1}')
    writeFileSync(openFile, 'not json{{{')
    const manager = new RecordManager('s', recordsFile, openFile)
    expect(manager.records()).toEqual([])
    expect(manager.view()).toBeNull()
  })
})
