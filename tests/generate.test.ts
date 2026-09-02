import { describe, expect, it } from 'vitest'
import {
  ArticleFormat,
  ArticleLanguage,
  TemplateLanguage,
  buildArticlePrompt,
  buildLatexDocument,
  latexDocumentShell,
  normalizeFileName,
  resolveTemplateLanguage,
  sanitizeLatexBody,
} from '../src/generate.ts'
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

  it('defaults to the language of the question when auto is chosen', () => {
    const { system } = buildArticlePrompt(sample, ArticleLanguage.Auto)
    expect(system).toMatch(/language of the question/)
  })

  it('forces Simplified Chinese when ZhCN is chosen', () => {
    const { system, user } = buildArticlePrompt(sample, ArticleLanguage.ZhCN)
    expect(system).toMatch(/Simplified Chinese/)
    expect(user).toMatch(/Simplified Chinese/)
    expect(system).not.toMatch(/language of the question/)
  })

  it('forces English when En is chosen, in both the system and user prompt', () => {
    const { system, user } = buildArticlePrompt(sample, ArticleLanguage.En)
    expect(system).toMatch(/must be written in English/)
    expect(user).toMatch(/must be written in English/)
    expect(system).not.toMatch(/language of the question/)
  })
})

describe('latex prompts', () => {
  it('asks for a body only: section headings, no preamble or environment commands', () => {
    const { system, user } = buildArticlePrompt(sample, ArticleLanguage.ZhCN, ArticleFormat.Latex)
    expect(system).toMatch(/\\section headings/)
    expect(system).toMatch(/Output ONLY the body/)
    expect(system).toMatch(/ALREADY in place/)
    expect(system).not.toMatch(/Markdown article/)
    expect(system).toMatch(/Simplified Chinese/)
    expect(user).toContain(sample.question)
  })

  it('keeps the language instruction for an english latex body', () => {
    const { system } = buildArticlePrompt(sample, ArticleLanguage.En, ArticleFormat.Latex)
    expect(system).toMatch(/must be written in English/)
    expect(system).toMatch(/siunitx/)
  })
})

describe('resolveTemplateLanguage', () => {
  it('auto + a Chinese question resolves to zh-CN', () => {
    expect(resolveTemplateLanguage(ArticleLanguage.Auto, '给定 R = 100 Ω，求电流')).toBe(TemplateLanguage.ZhCN)
  })

  it('auto + a non-CJK question resolves to en', () => {
    expect(resolveTemplateLanguage(ArticleLanguage.Auto, 'Given R = 100 ohm, find the current.')).toBe(TemplateLanguage.En)
  })

  it('an explicit choice wins over the question text', () => {
    expect(resolveTemplateLanguage(ArticleLanguage.En, '给定 R = 100 Ω，求电流')).toBe(TemplateLanguage.En)
    expect(resolveTemplateLanguage(ArticleLanguage.ZhCN, 'Find the current.')).toBe(TemplateLanguage.ZhCN)
  })
})

describe('normalizeFileName', () => {
  it('appends the format extension and swaps a stale one', () => {
    expect(normalizeFileName('report', ArticleFormat.Latex)).toBe('report.tex')
    expect(normalizeFileName('report.md', ArticleFormat.Latex)).toBe('report.tex')
    expect(normalizeFileName('report.tex', ArticleFormat.Markdown)).toBe('report.md')
    expect(normalizeFileName('report.TEX', ArticleFormat.Markdown)).toBe('report.md')
  })

  it('keeps the default base name when empty', () => {
    expect(normalizeFileName('', ArticleFormat.Latex)).toBe('electro-lab-article.tex')
    expect(normalizeFileName('  ', ArticleFormat.Markdown)).toBe('electro-lab-article.md')
  })
})

describe('sanitizeLatexBody', () => {
  it('rejects preamble and restructuring commands', () => {
    expect(sanitizeLatexBody('\\documentclass{article}')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('\\usepackage{amsmath}')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('x \\input{secret} y')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('\\begin{document}')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('\\end{document}')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('\\write18{rm -rf /}')).toMatchObject({ ok: false })
  })

  it('allows math environments like align', () => {
    const result = sanitizeLatexBody('\\begin{align}\na &= b\n\\end{align}')
    expect(result.ok).toBe(true)
  })

  it('escapes bare percent signs but keeps existing ones', () => {
    const result = sanitizeLatexBody('Efficiency is 50 % of the ideal \\%\\ 100 %.')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body).toBe('Efficiency is 50 \\% of the ideal \\%\\ 100 \\%.')
    }
  })

  it('flags unbalanced braces and odd dollar counts', () => {
    expect(sanitizeLatexBody('a { b } c {')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('price $5 only')).toMatchObject({ ok: false })
    expect(sanitizeLatexBody('price $5 and $6')).toMatchObject({ ok: true })
    expect(sanitizeLatexBody('\\$5 and \\$6')).toMatchObject({ ok: true })
  })
})

describe('latex document shell', () => {
  it('builds a full xelatex document around the sanitized body', () => {
    const document = buildLatexDocument('\\section{Question}\nGiven $R$, find $v$.', TemplateLanguage.En)
    expect(document.ok).toBe(true)
    if (document.ok) {
      expect(document.text).toContain('% !TeX program = xelatex')
      expect(document.text).toContain('\\documentclass{article}')
      expect(document.text).toContain('\\title{DeepSeek Harness ElectroLab Solution}')
      expect(document.text).toContain('\\author{DeepSeek Harness ElectroLab}')
      expect(document.text).toContain('\\section{Question}')
      expect(document.text).toContain('\\end{document}')
    }
  })

  it('uses ctexart for zh-CN and article for en', () => {
    expect(latexDocumentShell(TemplateLanguage.ZhCN)).toContain('\\documentclass{ctexart}')
    expect(latexDocumentShell(TemplateLanguage.ZhCN)).toContain('\\usepackage{siunitx}')
    expect(latexDocumentShell(TemplateLanguage.En)).toContain('\\documentclass{article}')
    expect(latexDocumentShell(TemplateLanguage.En)).toContain('\\usepackage{fontspec}')
  })

  it('fails when the body is rejected by the sanitizer', () => {
    const document = buildLatexDocument('\\documentclass{book}\nHijacked', TemplateLanguage.En)
    expect(document.ok).toBe(false)
  })
})
