import { describe, expect, it } from 'vitest'
import {
  MAX_RECORDS,
  RECORD_TOOL_NAMES,
  RecordEventType,
  RecordManager,
  SETTLE_WINDOW_MS,
  type RecordEvent,
} from '../src/records.ts'

function event(type: RecordEventType, seq: number, time: number, data: Record<string, unknown> = {}): RecordEvent {
  return { type, seq, time, data: data as RecordEvent['data'] } as RecordEvent
}

const textContent = (text: string) => [{ type: 'text', text }]
const userMessage = (seq: number, time: number, text: string) => event(RecordEventType.UserMessage, seq, time, { content: textContent(text) })
const assistantMessage = (seq: number, time: number, text: string) => event(RecordEventType.AssistantMessage, seq, time, { content: textContent(text) })
const calculateCall = (seq: number, time: number, callId = `c${seq}`, args = '{"expression":"1+1"}') =>
  event(RecordEventType.ToolCall, seq, time, { name: 'calculate', callId, arguments: args })
const calculateResult = (seq: number, time: number, callId: string, error?: { name: string; code: string }, content?: unknown) =>
  event(RecordEventType.ToolResult, seq, time, {
    callId,
    error,
    message: content === undefined ? undefined : { content: [{ type: 'tool-result', toolCallId: callId, content }] },
  })
const turnEnd = (seq: number, time: number) => event(RecordEventType.TurnEnd, seq, time)

function feedAll(events: RecordEvent[]): RecordManager {
  const manager = new RecordManager()
  for (const item of events) manager.feed(item)
  return manager
}

describe('record manager', () => {
  it('starts empty', () => {
    const manager = new RecordManager()
    expect(manager.items()).toEqual([])
    expect(manager.view()).toEqual({ records: [], open: null })
  })

  it('recognises every registered tool plus solve_steps and filter_design', () => {
    for (const name of ['calculate', 'resonance', 'convert', 'transient_response', 'solve_steps', 'filter_design']) {
      expect(RECORD_TOOL_NAMES.has(name)).toBe(true)
    }
    expect(RECORD_TOOL_NAMES.has('some_foreign_tool')).toBe(false)
  })

  it('builds question/analyse paragraphs, structured calls and results, and settles the answer', () => {
    const manager = new RecordManager()
    manager.feed(userMessage(1, 1000, 'compute the resonance frequency of an LC tank'))
    manager.feed(assistantMessage(2, 1100, '10 µF 与 50 mH 并联的谐振频率与带宽是多少?'))
    manager.feed(assistantMessage(3, 1200, '分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)'))
    manager.feed(calculateCall(4, 1300, 'c4', '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}'))
    manager.feed(calculateResult(5, 1400, 'c4', undefined, textContent('{"re": 225.079, "im": 0}')))
    expect(manager.feed(assistantMessage(6, 1500, '答案:f₀ ≈ 225 Hz。'))).toBeNull()
    const settled = manager.feed(turnEnd(7, 1600))
    expect(settled).not.toBeNull()
    expect(settled!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(settled!.question).toBe('10 µF 与 50 mH 并联的谐振频率与带宽是多少?')
    expect(settled!.analyse).toBe('分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)')
    expect(settled!.answer).toBe('答案:f₀ ≈ 225 Hz。')
    expect(settled!.startedAt).toBe(1000)
    expect(settled!.calls).toEqual([
      { callId: 'c4', name: 'calculate', arguments: '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}' },
    ])
    expect(settled!.results).toEqual([{ callId: 'c4', content: '{"re": 225.079, "im": 0}' }])
    expect(manager.items()).toHaveLength(1)
    expect(manager.view().open).toBeNull()
  })

  it('keeps a multi-step record together across assistant messages within one turn', () => {
    const manager = new RecordManager()
    manager.feed(userMessage(1, 1000, 'compute the impedance'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 50, "im": 0}')))
    manager.feed(assistantMessage(4, 1300, '中间文本'))
    manager.feed(calculateCall(5, 1400, 'c5'))
    manager.feed(calculateResult(6, 1500, 'c5'))
    const settled = manager.feed(turnEnd(7, 1600))
    expect(settled!.calls).toHaveLength(2)
    expect(settled!.results).toHaveLength(2)
    expect(settled!.answer).toBe('中间文本')
  })

  it('settles the open record when a foreign tool is called in between', () => {
    const manager = new RecordManager()
    manager.feed(calculateCall(1, 1000))
    const settled = manager.feed(event(RecordEventType.ToolCall, 2, 1100, { name: 'some_foreign_tool', callId: 'x' }))
    expect(settled).not.toBeNull()
    expect(settled!.settledAt).toBe(1100)
    manager.feed(calculateCall(3, 1200))
    expect(manager.view().open).not.toBeNull()
  })

  it('settles the open record on a user message', () => {
    const manager = new RecordManager()
    manager.feed(calculateCall(1, 1000))
    expect(manager.feed(event(RecordEventType.UserMessage, 2, 1100))).not.toBeNull()
    expect(manager.view().open).toBeNull()
  })

  it('settles a stale record on the idle gap and opens a new one', () => {
    const manager = new RecordManager()
    manager.feed(calculateCall(1, 1000))
    manager.feed(calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1))
    expect(manager.items()).toHaveLength(1)
    expect(manager.items()[0]!.settledAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
    expect(manager.view().open).not.toBeNull()
    expect(manager.view().open!.startedAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
  })

  it('reports the open record through view before it settles', () => {
    const manager = new RecordManager()
    manager.feed(userMessage(1, 1000, 'q'))
    manager.feed(calculateCall(2, 1100, 'c2'))
    manager.feed(calculateResult(3, 1200, 'c2'))
    expect(manager.items()).toHaveLength(0)
    expect(manager.view().open).not.toBeNull()
    expect(manager.view().open!.calls).toHaveLength(1)
  })

  it('keeps only MAX_RECORDS settled records, newest first', () => {
    const events: RecordEvent[] = []
    let seq = 1
    for (let i = 0; i < MAX_RECORDS + 5; i++) {
      const time = i * 10_000
      events.push(calculateCall(seq++, time, `a${i}`), turnEnd(seq++, time + 1_000))
    }
    const manager = feedAll(events)
    expect(manager.items()).toHaveLength(MAX_RECORDS)
    expect(manager.items()[0]!.startedAt).toBe((MAX_RECORDS + 4) * 10_000)
    expect(manager.items()[MAX_RECORDS - 1]!.startedAt).toBe(5 * 10_000)
  })

  it('mints random UUIDv4 ids: every record gets a fresh one', () => {
    const mint = (): string => {
      const manager = new RecordManager()
      manager.feed(calculateCall(1, 1000, 'c1'))
      return manager.feed(turnEnd(2, 2000))!.id
    }
    const a = mint()
    const b = mint()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('keeps one window across follow-up user messages', () => {
    const manager = new RecordManager()
    manager.feed(userMessage(1, 1000, 'what is the bandwidth?'))
    manager.feed(userMessage(2, 1100, 'actually with the series resistance of 10 ohm'))
    manager.feed(assistantMessage(3, 1200, 'what is the bandwidth with a 10 ohm series resistance?'))
    manager.feed(calculateCall(4, 1300, 'c4'))
    const settled = manager.feed(turnEnd(5, 1400))
    expect(settled!.startedAt).toBe(1000)
    expect(settled!.question).toBe('what is the bandwidth with a 10 ohm series resistance?')
    expect(settled!.calls).toHaveLength(1)
  })

  it('records result errors structurally', () => {
    const manager = new RecordManager()
    manager.feed(calculateCall(1, 1000, 'c1'))
    manager.feed(calculateResult(2, 1100, 'c1', { name: 'Error', code: 'E_INVALID' }, textContent('bad input')))
    const settled = manager.feed(turnEnd(3, 1200))
    expect(settled!.results).toEqual([{ callId: 'c1', content: 'bad input', error: { name: 'Error', code: 'E_INVALID' } }])
  })

  it('ignores assistant texts outside a question window', () => {
    const manager = new RecordManager()
    manager.feed(assistantMessage(1, 1000, 'unrelated chatter'))
    expect(manager.items()).toEqual([])
    expect(manager.view().open).toBeNull()
  })

  it('drops a stale question window on the idle gap', () => {
    const manager = new RecordManager()
    manager.feed(userMessage(1, 1000, 'stale question'))
    manager.feed(calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1))
    const settled = manager.feed(turnEnd(3, 1000 + SETTLE_WINDOW_MS + 2000))
    expect(settled!.question).toBe('')
  })
})
