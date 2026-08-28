import { describe, expect, it } from 'vitest'
import {
  applyElectroLabProjection,
  ELECTRO_LAB_TOOL_NAMES,
  initElectroLabProjection,
  MAX_INPUTS,
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

const calculateCall = (seq: number, time: number, callId = `c${seq}`) =>
  event('tool/call', seq, time, { name: 'calculate', callId })
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

  it('settles one run on turn/end with call and error counts', () => {
    const state = fold([
      calculateCall(1, 1000),
      calculateResult(2, 1100, 'c1'),
      calculateCall(3, 1200, 'c3'),
      calculateResult(4, 1300, 'c3', { name: 'Error', code: 'E_INVALID' }),
      event('turn/end', 5, 1400, { turn: 0, reason: 'success' }),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.open).toBeNull()
    expect(value.runs).toHaveLength(1)
    const run = value.runs[0]!
    expect(run.toolCalls).toBe(2)
    expect(run.errors).toBe(1)
    expect(run.startedAt).toBe(1000)
    expect(run.settledAt).toBe(1400)
    expect(run.tools).toEqual([{ name: 'calculate', calls: 2 }])
  })

  it('keeps a multi-step run together across assistant messages within one turn', () => {
    const state = fold([
      calculateCall(1, 1000),
      calculateResult(2, 1100, 'c1'),
      event('assistant/message', 3, 1200, { turn: 0, step: 0 }),
      calculateCall(4, 1300, 'c4'),
      calculateResult(5, 1400, 'c4'),
      event('turn/end', 6, 1500, { turn: 0, reason: 'success' }),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    expect(value.runs[0]!.toolCalls).toBe(2)
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
    expect(value.runs[0]!.toolCalls).toBe(1)
    expect(value.runs[0]!.settledAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
    expect(value.open).not.toBeNull()
    expect(value.open!.startedAt).toBe(1000 + SETTLE_WINDOW_MS + 1)
  })

  it('reports the open run through view before it settles', () => {
    const state = fold([calculateCall(1, 1000), calculateResult(2, 1100, 'c1')])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(0)
    expect(value.open).not.toBeNull()
    expect(value.open!.toolCalls).toBe(1)
    expect(value.open!.tools).toEqual([{ name: 'calculate', calls: 1 }])
  })

  it('groups tool usage in first-use order with per-tool counts', () => {
    const state = fold([
      calculateCall(1, 1000),
      event('tool/call', 2, 1100, { name: 'resonance', callId: 'r' }),
      calculateCall(3, 1200),
      event('turn/end', 4, 1300),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.toolCalls).toBe(3)
    expect(run.tools).toEqual([
      { name: 'calculate', calls: 2 },
      { name: 'resonance', calls: 1 },
    ])
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

  it('captures the question inputs and five-step texts of one run', () => {
    const state = fold([
      userMessage(1, 1000, 'compute the resonance frequency of an LC tank'),
      assistantMessage(2, 1100, '分析:LC 谐振,计划:用 resonance 工具'),
      calculateCall(3, 1200, 'c3'),
      calculateResult(4, 1300, 'c3'),
      assistantMessage(5, 1400, '结果:f₀ = 159 kHz。答案:谐振频率约 159 kHz。'),
      event('turn/end', 6, 1500),
    ])
    const value = viewElectroLabProjection(state)
    expect(value.runs).toHaveLength(1)
    const run = value.runs[0]!
    expect(run.question).toBeUndefined()
    expect(run.questionInputs).toEqual(['compute the resonance frequency of an LC tank'])
    expect(run.answerTexts).toEqual([
      '分析:LC 谐振,计划:用 resonance 工具',
      '结果:f₀ = 159 kHz。答案:谐振频率约 159 kHz。',
    ])
    expect(run.toolCalls).toBe(1)
  })

  it('accumulates follow-up question inputs into one window', () => {
    const state = fold([
      userMessage(1, 1000, 'what is the bandwidth?'),
      userMessage(2, 1100, 'actually with the series resistance of 10 ohm'),
      calculateCall(3, 1200, 'c3'),
      event('turn/end', 4, 1300),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.questionInputs).toEqual(['what is the bandwidth?', 'actually with the series resistance of 10 ohm'])
  })

  it('caps the collected question inputs', () => {
    const events: ElectroLabSessionEvent[] = []
    for (let i = 0; i < MAX_INPUTS + 2; i++) events.push(userMessage(i + 1, i * 1000, `input ${i}`))
    events.push(calculateCall(MAX_INPUTS + 3, (MAX_INPUTS + 2) * 1000), event('turn/end', MAX_INPUTS + 4, (MAX_INPUTS + 3) * 1000))
    const run = viewElectroLabProjection(fold(events)).runs[0]!
    expect(run.questionInputs).toHaveLength(MAX_INPUTS)
    expect(run.questionInputs[0]).toBe('input 2')
    expect(run.questionInputs[MAX_INPUTS - 1]).toBe(`input ${MAX_INPUTS + 1}`)
  })

  it('captures the exact tool outputs into results', () => {
    const state = fold([
      calculateCall(1, 1000, 'c1'),
      calculateResult(2, 1100, 'c1', undefined, textContent('{"re": 225.079, "im": 0}')),
      event('turn/end', 3, 1200),
    ])
    const run = viewElectroLabProjection(state).runs[0]!
    expect(run.results).toEqual(['{"re": 225.079, "im": 0}'])
    expect(run.answerTexts).toEqual([])
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
    expect(run.questionInputs).toEqual([])
  })
})
