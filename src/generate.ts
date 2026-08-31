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
 * The generation prompt: a clear question plus a MIXED analysis-and-
 * calculation explanation (not a thinking transcript, not the record's own
 * section layout), titled and authored by ElectroLab itself.
 */
export function buildArticlePrompt(record: Record): GeneratePrompt {
  return {
    system: [
      'You are the article writer for DeepSeek Harness ElectroLab.',
      'Write ONE self-contained Markdown article that solves the calculation question described in the record information.',
      'The H1 title must be exactly: DeepSeek Harness ElectroLab Solution.',
      'Include an author line with exactly: DeepSeek Harness ElectroLab. Never include record ids or timestamps anywhere in the article.',
      "Restate the question clearly at the start, in the user's own words. Remove any meta or filler text that was added while merging multiple inputs into one question.",
      'Mix analysis and calculations as a flowing explanation: prose with the formulas and numbers inline, not a step-by-step thinking transcript and not sectioned output.',
      'Every number must come from the provided tool outputs and the final answer — never invent or recompute values.',
      'Write in the language of the question.',
    ].join(' '),
    user: renderRecord(record),
  }
}
