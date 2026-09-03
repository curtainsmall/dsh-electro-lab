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
  deleteRecordFromArchive,
  type Record as SettledRecord,
  type RecordEvent,
} from '../src/records.ts'

function event(type: RecordEventType, seq: number, time: number, data: Record<string, unknown> = {}): RecordEvent {
  return { type, seq, time, data: data as RecordEvent['data'] } as RecordEvent
}

const textContent = (text: string) => [{ type: 'text', text }]
const userMessage = (seq: number, time: number, text?: string) => event(RecordEventType.UserMessage, seq, time, text === undefined ? {} : { content: textContent(text) })
const assistantMessage = (seq: number, time: number, text: string) => event(RecordEventType.AssistantMessage, seq, time, { message: { content: textContent(text) } })
const questionCall = (seq: number, time: number, text: string, callId = `q${seq}`) =>
  event(RecordEventType.ToolCall, seq, time, { name: 'record_question', callId, arguments: JSON.stringify({ text }) })
const analyseCall = (seq: number, time: number, text: string, callId = `a${seq}`) =>
  event(RecordEventType.ToolCall, seq, time, { name: 'record_analyse', callId, arguments: JSON.stringify({ text }) })
const answerCall = (seq: number, time: number, text?: string, callId = `z${seq}`) =>
  event(RecordEventType.ToolCall, seq, time, { name: 'record_answer', callId, ...(text === undefined ? { arguments: '{}' } : { arguments: JSON.stringify({ text }) }) })
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

describe('record manager (record_question opens, record_answer settles)', () => {
  it('starts empty', () => {
    const { manager } = makeEnv()
    expect(manager.view()).toBeNull()
    expect(manager.records()).toEqual([])
  })

  it('recognises every registered tool, the markers and solve_steps/filter_design', () => {
    for (const name of ['calculate', 'resonance', 'convert_unit', 'transient_response', 'solve_steps', 'filter_design', 'record_question', 'record_analyse', 'record_answer']) {
      expect(RECORD_TOOL_NAMES.has(name)).toBe(true)
    }
    expect(RECORD_TOOL_NAMES.has('some_foreign_tool')).toBe(false)
  })

  it('record_question opens the record, record_answer settles it, texts land in their fields', () => {
    const { manager } = makeEnv()
    manager.feed(assistantMessage(1, 900, 'bracket 之前的文本不算'))
    manager.feed(questionCall(2, 1000, '10 µF 与 50 mH 并联的谐振频率与带宽是多少?'))
    manager.feed(calculateCall(3, 1100, 'c3', '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}'))
    manager.feed(calculateResult(4, 1200, 'c3', undefined, textContent('{"re": 225.079, "im": 0}')))
    manager.feed(analyseCall(5, 1300, '分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)'))
    const settled = manager.feed(answerCall(6, 1400, '答案:f₀ ≈ 225 Hz。'))
    expect(settled).not.toBeNull()
    expect(settled!.question).toBe('10 µF 与 50 mH 并联的谐振频率与带宽是多少?')
    expect(settled!.analyse).toBe('分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)')
    expect(settled!.answer).toBe('答案:f₀ ≈ 225 Hz。')
    expect(settled!.startedAt).toBe(1000)
    expect(settled!.settledAt).toBe(1400)
    expect(settled!.error).toBeUndefined()
    expect(settled!.calls).toEqual([
      { callId: 'c3', name: 'calculate', arguments: '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}' },
    ])
    expect(settled!.results).toEqual([{ callId: 'c3', content: '{"re": 225.079, "im": 0}' }])
    manager.feed(assistantMessage(7, 1500, 'bracket 之后的文本也不算'))
    expect(manager.view()).toBeNull()
    expect(manager.records()).toHaveLength(1)
  })

  it('record_question submits the question before any tool call', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '问题先于工具'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(answerCall(3, 1200, '答案'))
    expect(settled!.question).toBe('问题先于工具')
    expect(settled!.answer).toBe('答案')
    expect(settled!.calls).toHaveLength(1)
  })

  it('splits a merged five-part template out of the answer text into the three fields', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '在电路 [R = 50 Ω ∥ L = 50 µH] 上求总阻抗。'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 50, "im": 0}')))
    const merged = [
      '1. **问题（Question）**',
      '在电路 [R = 50 Ω ∥ L = 50 µH] 上求总阻抗。',
      '2. **分析（Analysis）**',
      'Z = 1/(1/R − j/(ωL))。',
      '3. **工具调用（Tool calls）**',
      '| 1 | circuit_impedance | ... |',
      '4. **结果（Results）**',
      '| 1 | re = 50 |',
      '5. **答案（Answer）**',
      'Z ≈ 50 Ω。',
    ].join('\n')
    const settled = manager.feed(answerCall(4, 1300, merged))
    // The merged template fills the missing analyse; the title lines and the
    // tables are stripped from the record texts.
    expect(settled!.analyse).toContain('Z = 1/(1/R')
    expect(settled!.analyse).not.toContain('分析（Analysis）')
    expect(settled!.answer).toContain('Z ≈ 50 Ω')
    expect(settled!.answer).not.toContain('答案（Answer）')
    expect(settled!.answer).not.toContain('工具调用')
    // A direct question wins over the merged one.
    expect(settled!.question).toBe('在电路 [R = 50 Ω ∥ L = 50 µH] 上求总阻抗。')
    // Plain text (no template markers) stays untouched.
    manager.feed(questionCall(5, 1400, 'q2'))
    manager.feed(calculateCall(6, 1500, 'c6'))
    const plain = manager.feed(answerCall(7, 1600, '就是一段普通回答'))
    expect(plain!.answer).toBe('就是一段普通回答')
    expect(plain!.question).toBe('q2')
  })

  it('strips part-title lines from directly submitted question/analyse texts', () => {
    const { manager } = makeEnv()
    const titled = [
      '1. 问题（Question）',
      '在电路 [R ∥ L = 100 mH] 上求总阻抗。',
    ].join('\n')
    manager.feed(questionCall(1, 1000, titled))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const analyse = [
      '1. 分析（Analyse）',
      '   - 已知量：R = 50 Ω。',
      '',
      '2. 计划（Plan）',
      '   - 用 circuit_impedance 计算。',
    ].join('\n')
    manager.feed(analyseCall(3, 1200, analyse))
    const settled = manager.feed(answerCall(4, 1300, 'Z ≈ 50 Ω。'))
    expect(settled!.question).toBe('在电路 [R ∥ L = 100 mH] 上求总阻抗。')
    expect(settled!.question).not.toContain('问题（Question）')
    expect(settled!.analyse).toContain('- 已知量')
    expect(settled!.analyse).toContain('- 用 circuit_impedance')
    expect(settled!.analyse).not.toContain('分析（Analyse）')
    expect(settled!.analyse).not.toContain('计划（Plan）')
    // Content lines starting with a dash survive; the answer text is untouched.
    expect(settled!.answer).toBe('Z ≈ 50 Ω。')
  })

  it('a malformed answer argument is ignored but the record still settles', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(event(RecordEventType.ToolCall, 3, 1200, { name: 'record_answer', callId: 'z3', arguments: 'not json' }))
    expect(settled!.answer).toBe('')
    expect(settled!.error).toBeUndefined()
  })

  it('duplicate record_question settles the open record as an error record and opens a new one', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '第一个问题'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2'))
    const settled = manager.feed(questionCall(4, 1300, '第二个问题'))
    expect(settled).not.toBeNull()
    expect(settled!.error).toEqual({
      type: RecordErrorType.DuplicateStart,
      message: expect.stringContaining('record_question') as string,
    })
    expect(settled!.question).toBe('第一个问题')
    expect(settled!.calls).toHaveLength(1)
    // A fresh record is open with the NEW question.
    expect(manager.view()).not.toBeNull()
    expect(manager.view()!.question).toBe('第二个问题')
    expect(manager.view()!.id).not.toBe(settled!.id)
  })

  it('record_answer with no open record keeps an empty error record', () => {
    const { manager } = makeEnv()
    const first = manager.feed(answerCall(1, 1000, '无记录的答案'))
    expect(first!.error!.type).toBe(RecordErrorType.DuplicateEnd)
    expect(first!.calls).toEqual([])
    expect(first!.startedAt).toBe(1000)
    expect(first!.settledAt).toBe(1000)
    // After a settle there is no open record either: another answer is again an error record.
    manager.feed(questionCall(2, 1100, 'q'))
    manager.feed(calculateCall(3, 1200, 'c3'))
    manager.feed(answerCall(4, 1300, '答案'))
    const second = manager.feed(answerCall(5, 1400, '重复答案'))
    expect(second!.error!.type).toBe(RecordErrorType.DuplicateEnd)
    expect(manager.view()).toBeNull()
  })

  it('a record with no tool call is an incomplete error record', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '只有问题没有工具'))
    const settled = manager.feed(answerCall(2, 1100, '答案'))
    expect(settled!.error!.type).toBe(RecordErrorType.Incomplete)
    expect(settled!.question).toBe('只有问题没有工具')
    expect(settled!.calls).toEqual([])
  })

  it('settles the open record on a user message (its text is outside the brackets)', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '问题'))
    const settled = manager.feed(userMessage(3, 1200, '新话题'))
    expect(settled).not.toBeNull()
    expect(settled!.error!.type).toBe(RecordErrorType.Incomplete)
    expect(manager.view()).toBeNull()
  })

  it('settles the open record on turn end', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(turnEnd(3, 1200))
    expect(settled!.calls).toHaveLength(1)
    expect(settled!.error).toBeUndefined()
    expect(manager.view()).toBeNull()
  })

  it('settles the open record when a foreign tool is called in between', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    const settled = manager.feed(event(RecordEventType.ToolCall, 2, 1100, { name: 'some_foreign_tool', callId: 'x' }))
    expect(settled).not.toBeNull()
    expect(settled!.settledAt).toBe(1100)
    manager.feed(calculateCall(3, 1200))
    expect(manager.view()).not.toBeNull()
  })

  it('settles a stale record on the idle gap and opens a new one', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    const settled = manager.feed(calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1))
    expect(settled).not.toBeNull()
    expect(settled!.settledAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
    expect(manager.view()).not.toBeNull()
    expect(manager.view()!.startedAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
  })

  it('reports the open record through view before it settles', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2'))
    const open = manager.view()
    expect(open).not.toBeNull()
    expect(open!.calls).toHaveLength(1)
    expect(open!.question).toBe('q')
  })

  it('appends every settled record to the disk archive exactly once', () => {
    const { manager } = makeEnv()
    const settled = feedAll(manager, [
      questionCall(1, 1000, 'q1'),
      calculateCall(2, 1100, 'c2'),
      answerCall(3, 1200, 'a1'),
      questionCall(4, 1300, 'q2'),
      calculateCall(5, 1400, 'c5'),
      answerCall(6, 1500, 'a2'),
    ])
    expect(settled).toHaveLength(2)
    expect(manager.records()).toHaveLength(2)
    expect(manager.records()[0]!.startedAt).toBe(1300)
    expect(manager.records()[1]!.startedAt).toBe(1000)
    expect(manager.view()).toBeNull()
  })

  it('persists the open snapshot after every event and restores it on a fresh instance (restart)', () => {
    const { recordsFile, openFile, manager } = makeEnv()
    manager.feed(questionCall(1, 1000, '问题'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 225, "im": 0}')))
    // A brand-new manager over the SAME files = restart: the constructor
    // loads the persisted snapshot and the interrupted record is restored.
    const restarted = new RecordManager('session-a', recordsFile, openFile)
    expect(restarted.view()).not.toBeNull()
    expect(restarted.view()!.id).toBe(manager.view()!.id)
    expect(restarted.view()!.question).toBe('问题')
    expect(restarted.view()!.calls).toHaveLength(1)
    // The restored record keeps tracking: a follow-up event extends it.
    expect(restarted.feed(assistantMessage(4, 1300, '答案'))).toBeNull()
    const settled = restarted.feed(answerCall(5, 1400, '最终答案'))
    expect(settled!.id).toBe(manager.view()!.id)
    expect(settled!.question).toBe('问题')
    expect(settled!.answer).toBe('最终答案')
    expect(restarted.records()).toHaveLength(1)
    expect(restarted.view()).toBeNull()
  })

  it('restores an interrupted record from its snapshot and continues to a settle', () => {
    const first = makeEnv().manager
    first.feed(questionCall(1, 1000, '问题'))
    first.feed(calculateCall(2, 1100, 'c2'))
    first.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 225, "im": 0}')))
    const snapshot = first.snapshot()!
    const second = makeEnv().makeManager()
    second.restore(snapshot)
    expect(second.view()!.id).toBe(snapshot.id)
    expect(second.feed(assistantMessage(4, 1300, '答案'))).toBeNull()
    const settled = second.feed(answerCall(5, 1400, '最终答案'))
    expect(settled!.id).toBe(snapshot.id)
    expect(settled!.question).toBe('问题')
    expect(settled!.answer).toBe('最终答案')
    expect(settled!.calls).toEqual([{ callId: 'c2', name: 'calculate', arguments: '{"expression":"1+1"}' }])
    expect(settled!.error).toBeUndefined()
  })

  it('mints random UUIDv4 ids: every record gets a fresh one', () => {
    const { makeManager } = makeEnv()
    const mint = (): string => {
      const manager = makeManager()
      manager.feed(questionCall(1, 1000, 'q'))
      manager.feed(calculateCall(2, 1100, 'c2'))
      return manager.feed(answerCall(3, 1200, 'a'))!.id
    }
    const a = mint()
    const b = mint()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('records result errors structurally', () => {
    const { manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', { name: 'Error', code: 'E_INVALID' }, textContent('bad input')))
    const settled = manager.feed(answerCall(4, 1300, 'a'))
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
    const settled = manager.feed(answerCall(2, 1100, '答案'))
    expect(settled!.calls).toEqual([{ callId: 'c1', name: 'calculate', arguments: '{"expression":"1+1"}' }])
    expect(settled!.error).toBeUndefined()
    expect(settled!.answer).toBe('答案')
  })

  it('skips torn lines and duplicate ids in the archive on load', () => {
    const { recordsFile, openFile, manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const settled = manager.feed(answerCall(3, 1200, 'a'))
    expect(settled!.error).toBeUndefined()
    appendFileSync(recordsFile, '{"id":"record-9"')
    appendFileSync(recordsFile, `${JSON.stringify(settled)}\n`)
    const reloaded = new RecordManager('session-a', recordsFile, openFile)
    expect(reloaded.records()).toHaveLength(1)
    expect(reloaded.records()[0]!.id).toBe(settled!.id)
  })

  it('deletes one settled record from the archive by id', () => {
    const { recordsFile, openFile, manager } = makeEnv()
    manager.feed(questionCall(1, 1000, 'q1'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    const first = manager.feed(answerCall(3, 1200, 'a1'))!
    manager.feed(questionCall(4, 1300, 'q2'))
    manager.feed(calculateCall(5, 1400, 'c5'))
    const second = manager.feed(answerCall(6, 1500, 'a2'))!
    expect(manager.records()).toHaveLength(2)
    // Delete the newer record; the archive keeps the other one.
    expect(deleteRecordFromArchive(recordsFile, second.id)).toBe(true)
    const reloaded = new RecordManager('session-a', recordsFile, openFile)
    expect(reloaded.records()).toHaveLength(1)
    expect(reloaded.records()[0]!.id).toBe(first.id)
    // Deleting an unknown id reports false and changes nothing.
    expect(deleteRecordFromArchive(recordsFile, 'no-such-id')).toBe(false)
    expect(new RecordManager('session-a', recordsFile, openFile).records()).toHaveLength(1)
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
