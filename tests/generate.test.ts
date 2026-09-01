import { describe, expect, it } from 'vitest'
import { buildArticlePrompt } from '../src/generate.ts'
import type { Record } from '../src/records.ts'

const sample: Record = {
  id: 'rec-12345678',
  startedAt: 1700000000000,
  settledAt: 1700000001000,
  question: '给定 R = 100 Ω 与 C = 100 mF，初始电压 100 V，求 1 秒后电压。（根据补充：串联改为并联）',
  analyse: 'RC 放电：τ = R·C，v(t) = V₀·e^(−t/τ)。',
  answer: 'v(1 s) ≈ 90.48 V。',
  calls: [
    { callId: 'call_1', name: 'time_constant', arguments: '{"resistance":{"form":"rect","re":100,"im":0,"kind":"resistance"},"capacitance":{"form":"rect","re":0.1,"im":0,"kind":"capacitance"}}' },
    { callId: 'call_2', name: 'transient_response', arguments: '{"kind":"rc","mode":"discharge","resistance":{"form":"rect","re":100,"im":0,"kind":"resistance"}}' },
  ],
  results: [
    { callId: 'call_1', content: '{"re":10,"im":0,"kind":"time","mag":10,"ang":0}' },
    { callId: 'call_2', content: '{"re":90.48374180359595,"im":0,"kind":"voltage","mag":90.48374180359595,"ang":0}' },
  ],
}

describe('buildArticlePrompt', () => {
  it('embeds the record content verbatim in the user prompt', () => {
    const { user } = buildArticlePrompt(sample)
    expect(user).toContain(sample.question)
    expect(user).toContain(sample.analyse)
    expect(user).toContain(sample.answer)
    expect(user).toContain('time_constant')
    expect(user).toContain('90.48374180359595')
  })

  it('requires the fixed title and author, and forbids ids and timestamps', () => {
    const { system } = buildArticlePrompt(sample)
    expect(system).toContain('DeepSeek Harness ElectroLab Solution')
    expect(system).toContain('DeepSeek Harness ElectroLab')
    expect(system).toMatch(/Never include record ids or timestamps/)
    expect(system).toMatch(/language of the question/)
  })

  it('demands an article structure: section headings and formatted formula lines', () => {
    const { system } = buildArticlePrompt(sample)
    expect(system).toMatch(/read like a proper technical article/)
    expect(system).toMatch(/H2 section headings/)
    expect(system).toMatch(/not a thinking transcript/)
    expect(system).toMatch(/Put formulas and calculations on their OWN lines/)
    expect(system).toMatch(/Markdown formatting/)
  })

  it('presents the record as neutral facts without the five-step section labels', () => {
    const { user } = buildArticlePrompt(sample)
    expect(user).toContain('Record information to base the article on')
    expect(user).not.toMatch(/^Question:/m)
    expect(user).not.toMatch(/^Analysis:/m)
    expect(user).not.toMatch(/^Final answer:/m)
  })
})
