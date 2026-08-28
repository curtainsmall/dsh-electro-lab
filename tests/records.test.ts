import { describe, expect, it } from 'vitest'
import {
  applyElectroLabProjection,
  ELECTRO_LAB_TOOL_NAMES,
  initElectroLabProjection,
  MAX_RUNS,
  SETTLE_WINDOW_MS,
  viewElectroLabProjection,
  type ElectroLabProjectionState,
  type ElectroLabSessionEvent,
} from '../src/records.ts'

function event(type: string, seq: number, time: number, data: Record<string, unknown> = {}): ElectroLabSessionEvent {
  return { type, seq, time, data: data as ElectroLabSessionEvent['data'] }
}

const textContent = (text: string) => [{ type: 'text', text }]
const userMessage = (seq: number, time: number, text: string) => event('user/message', seq, time, { content: textContent(text) })
const assistantMessage = (seq: number, time: number, text: string) => event('assistant/message', seq, time, { content: textContent(text) })

function fold(events: ElectroLabSessionEvent[]): ElectroLabProjectionState {
  let state = initElectroLabProjection()
  for (const item of events) state = applyElectroLabProjection(state, item)
  return state
}

const calculateCall = (seq: number, time: number, callId = `c${seq}`, args = '{"expression":"1+1"}') =>
  event('tool/call', seq, time, { name: 'calculate', callId, arguments: args })
const calculateResult = (seq: number, time: number, callId: string, error?: { name: string; code: string }, content?: unknown) =>
  event('tool/result', seq, time, {
    callId,
    error,
    message: content === undefined ? undefined : { content: [{ type: 'tool-result', toolCallId: callId, content }] },
  })

describe('electro-lab run records projection', () => {
  it('has an empty view for an empty log', () => {
    const state = initElectroLabProjection()
    expect(viewElectroLabProjection(state)).toEqual({ runs: [], open: null })
  })

  it('recognises every registered tool plus solve_steps and filter_design', () => {
    for (const name of ['calculate', 'resonance', 'convert', 'transient_response', 'solve_steps', 'filter_design']) {
      expect(ELECTRO_LAB_TOOL_NAMES.has(name)).toBe(true)
    }
    expect(ELECTRO_LAB_TOOL_NAMES.has('some_foreign_tool')).toBe(false)
  })

  it('captures question/analyse paragraphs, structured calls and results, and the answer', () => {
    const state = fold([
      userMessage(1, 1000, 'compute the resonance frequency of an LC tank'),
      assistantMessage(2, 1100, '10 µF 与 50 mH 并联的谐振频率与带宽是多少?'),
      assistantMessage(3, 1200, '分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)'),
      calculateCall(4, 1300, 'c4', '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}'),
      calculateResult(5, 1400, 'c4', undefined, textContent('{"re": 225.079, "im": 0}')),
      assistantMessage(6, 1500, '答案:f₀ ≈ 225 Hz。'),
      event('turn/end', 7, 1600),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    const run = value.runs[0]!
    expect(run.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(run.question).toBe('10 µF 与 50 mH 并联的谐振频率与带宽是多少?')
    expect(run.analyse).toBe('分析:f₀ = 1/(2π√(LC)),Q = R√(C/L)')
    expect(run.answer).toBe('答案:f₀ ≈ 225 Hz。')
    expect(run.calls).toEqual([
      { callId: 'c4', name: 'calculate', arguments: '{"expression":"1/(2*pi*sqrt(50e-3*10e-6))"}' },
    ])
    expect(run.results).toEqual([{ callId: 'c4', content: '{"re": 225.079, "im": 0}' }])
  })

  it('keeps a multi-step run together across assistant messages within one turn', () => {
    const state = fold([
      userMessage(1, 1000, 'compute the impedance'),
      calculateCall(2, 1100, 'c2'),
      calculateResult(3, 1200, 'c2', undefined, textContent('{"re": 50, "im": 0}')),
      event('assistant/message', 4, 1300, { content: textContent('中间文本') }),
      calculateCall(5, 1400, 'c5'),
      calculateResult(6, 1500, 'c5'),
      event('turn/end', 7, 1600),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    expect(value.runs[0]!.calls).toHaveLength(2)
    expect(value.runs[0]!.results).toHaveLength(2)
    expect(value.runs[0]!.answer).toBe('中间文本')
  })

  it('settles the open run when a foreign tool is called in between', () => {
    const state = fold([
      calculateCall(1, 1000),
      event('tool/call', 2, 1100, { name: 'some_foreign_tool', callId: 'x' }),
      calculateCall(3, 1200),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    expect(value.runs[0]!.settledAt).toBe(1100)
    expect(value.open).not.toBeNull()
  })

  it('settles the open run on a user message', () => {
    const state = fold([
      calculateCall(1, 1000),
      event('user/message', 2, 1100),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    expect(value.open).toBeNull()
  })

  it('settles a stale run on the idle gap and opens a new one', () => {
    const state = fold([
      calculateCall(1, 1000),
      calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    expect(value.runs[0]!.calls.length).toBe(1)
    expect(value.runs[0]!.settledAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
    expect(value.open).not.toBeNull()
    expect(value.open!.startedAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
  })

  it('reports the open run through view before it settles', () => {
    const state = fold([userMessage(1, 1000, 'q'), calculateCall(2, 1100, 'c2'), calculateResult(3, 1200, 'c2')])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(0)
    expect(value.open).not.toBeNull()
    expect(value.open!.calls).toHaveLength(1)
  })

  it('keeps only MAX_RUNS settled runs, newest first', () => {
    const events: ElectroLabSessionEvent[] = []
    let seq = 1
    for (let i = 0; i < MAX_RUNS + 5; i++) {
      const time = i * 10_000
      events.push(calculateCall(seq++, time, `a${i}`), event('turn/end', seq++, time + 1_000))
    }
    const state = fold(events)
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(MAX_RUNS)
    expect(value.runs[0]!.startedAt).toBe((MAX_RUNS + 4) * 10_000)
    expect(value.runs[MAX_RUNS - 1]!.startedAt).toBe(5 * 10_000)
  })

  it('ignores unrelated events without changing the state reference', () => {
    const state = initElectroLabProjection()
    const next = applyElectroLabProjection(state, event('todo/write', 1, 1000))
    expect(next).toBe(state)
  })

  it('mints deterministic UUIDv5 ids: same events, same id; different events, different id', () => {
    const foldOnce = (time: number, seq: number) => viewElectroLabProjection(fold([
      calculateCall(seq, time, `c${seq}`),
      event('turn/end', seq + 1, time + 1000),
    ])).runs[0]!.id
    expect(foldOnce(1000, 4)).toBe(foldOnce(1000, 4))
    expect(foldOnce(1000, 4)).not.toBe(foldOnce(2000, 4))
    expect(foldOnce(1000, 4)).not.toBe(foldOnce(1000, 5))
  })

  it('keeps one window across follow-up user messages', () => {
    const state = fold([
      userMessage(1, 1000, 'what is the bandwidth?'),
      userMessage(2, 1100, 'actually with the series resistance of 10 ohm'),
      assistantMessage(3, 1200, 'what is the bandwidth with a 10 ohm series resistance?'),
      calculateCall(4, 1300, 'c4'),
      event('turn/end', 5, 1400),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.startedAt).toBe(1000)
    expect(run.question).toBe('what is the bandwidth with a 10 ohm series resistance?')
    expect(run.calls).toHaveLength(1)
  })

  it('records result errors structurally', () => {
    const state = fold([
      calculateCall(1, 1000, 'c1'),
      calculateResult(2, 1100, 'c1', { name: 'Error', code: 'E_INVALID' }, textContent('bad input')),
      event('turn/end', 3, 1200),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.results).toEqual([{ callId: 'c1', content: 'bad input', error: { name: 'Error', code: 'E_INVALID' } }])
  })

  it('ignores assistant texts outside a question window', () => {
    const state = fold([assistantMessage(1, 1000, 'unrelated chatter')])
    expect(viewElectroLabProjection(state)).toEqual({ runs: [], open: null })
  })

  it('drops a stale question window on the idle gap', () => {
    const state = fold([
      userMessage(1, 1000, 'stale question'),
      calculateCall(2, 1000 + SETTLE_WINDOW_MS + 1),
      event('turn/end', 3, 1000 + SETTLE_WINDOW_MS + 2000),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.question).toBe('')
  })
})
