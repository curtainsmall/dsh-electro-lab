/**
 * Article generation for the records page: the model (host-side LLM call)
 * turns a settled record into a self-contained solution article in the
 * requested format, which the host then writes to disk. This module only
 * builds the prompt; the LLM call and file writing live in index.ts.
 *
 * The generation call has its own independent context — only this prompt is
 * visible to the model — so the record is presented as plain facts, WITHOUT
 * the bracketed record-section labels (question/analysis/tool calls/results/
 * answer), which would steer the model toward a sectioned five-part output.
 */
import type { Record } from './records.ts'

/** System + user prompt pair for one record. */
export interface GeneratePrompt {
  system: string
  user: string
}

/**
 * Explicit article languages: 'auto' keeps the current behavior (write in the
 * language of the question); anything else forces the article language.
 */
export const ARTICLE_LANGUAGES = ['auto', 'zh-CN', 'en'] as const
export type ArticleLanguage = (typeof ARTICLE_LANGUAGES)[number]

/** The system-prompt sentence that pins the article language. */
export function articleLanguageInstruction(language: ArticleLanguage): string {
  switch (language) {
    case 'zh-CN': return 'The ENTIRE article must be written in Simplified Chinese (简体中文) — every heading, sentence, and label. Never switch to another language.'
    case 'en': return 'The ENTIRE article must be written in English — every heading, sentence, and label. Never switch to another language.'
    default: return 'Write in the language of the question.'
  }
}

/** The record rendered as neutral facts for the model (values verbatim). */
function renderRecord(record: Record): string {
  const lines: string[] = ['Record information to base the article on:', '']
  lines.push(`- The question to solve: ${record.question}`)
  if (record.analyse.length > 0) lines.push(`- Approach notes: ${record.analyse}`)
  for (const call of record.calls) {
    lines.push(`- Tool call ${call.name}: ${call.arguments.length > 0 ? call.arguments : '(no arguments)'}`)
  }
  for (const result of record.results) {
    const content = result.content.trim()
    if (content.length > 0) lines.push(`- Tool output: ${content}`)
  }
  lines.push(`- Final answer: ${record.answer}`)
  return lines.join('\n')
}

/**
 * The generation prompt: the article reads like a proper technical article —
 * section headings, formulas and calculations on their own formatted lines —
 * not a chat reply and not the record's own five-section layout.
 */
export function buildArticlePrompt(record: Record, language: ArticleLanguage = 'auto'): GeneratePrompt {
  return {
    system: [
      'You are the article writer for DeepSeek Harness ElectroLab.',
      'Write ONE self-contained Markdown article that solves the calculation question described in the record information. The article must read like a proper technical article, not a chat reply and not a thinking transcript.',
      'Structure it with headings: the H1 title must be exactly: DeepSeek Harness ElectroLab Solution, followed by an author line with exactly: DeepSeek Harness ElectroLab. Then use clear H2 section headings for the question, the approach, the calculations and the conclusion — choose headings that fit the content; do NOT reproduce the record\'s internal labels (question/analysis/tool calls/results/answer) as headings.',
      "Restate the question clearly at the start, in the user's own words. Remove any meta or filler text that was added while merging multiple inputs into one question.",
      'Put formulas and calculations on their OWN lines in a clean format: each equation on a separate line (e.g. `τ = R·C = 100 Ω × 0.1 F = 10 s`), intermediate steps as separate lines, and the computed result stated in prose right after the calculation. Use Markdown formatting — headings, lists, and fenced or inline code for equations — so formulas and calculations are visually distinct from the surrounding prose.',
      'Every number must come from the provided tool outputs and the final answer — never invent or recompute values.',
      'Never include record ids or timestamps anywhere in the article.',
      articleLanguageInstruction(language),
    ].join(' '),
    // The language directive is repeated in the user message: the question
    // text itself may be in another language, and the last instruction the
    // model reads before generating carries the most weight.
    user: renderRecord(record) + (language === 'auto' ? '' : `\n\nImportant: ${articleLanguageInstruction(language)}`),
  }
}
