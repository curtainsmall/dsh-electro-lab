/**
 * Article generation for the records page: the model (host-side LLM call)
 * turns a settled record into a self-contained solution article in the
 * requested format, which the host then writes to disk. This module builds
 * the prompt and — for LaTeX — the document shell around the model's body;
 * the LLM call and file writing live in index.ts.
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

/** Output formats: Markdown (as before) and plain LaTeX source (.tex, never compiled by the host). */
export enum ArticleFormat {
  Markdown = 'markdown',
  Latex = 'latex',
}

/**
 * Explicit article languages: Auto keeps the current behavior (write in the
 * language of the question); anything else forces the article language.
 * Template-ready: ZhCN and En ship with LaTeX document shells today; further
 * scripts (ja/ko/cyrillic/…) only need a template row in latexDocumentShell
 * plus a probe in resolveTemplateLanguage.
 */
export enum ArticleLanguage {
  Auto = 'auto',
  ZhCN = 'zh-CN',
  En = 'en',
}

/** The document-shell languages that ship a LaTeX template (resolved from ArticleLanguage). */
export enum TemplateLanguage {
  ZhCN = 'zh-CN',
  En = 'en',
}

/** Generation job phases, reported through /generate-progress (shared wire codes host ↔ client). */
export enum GenerationPhase {
  Prepare = 'prepare',
  Generate = 'generate',
  Write = 'write',
  Compile = 'compile',
}

/** The article-language face of a template language (same wire values, distinct enum types). */
export function templateLanguageToArticleLanguage(templateLanguage: TemplateLanguage): ArticleLanguage {
  switch (templateLanguage) {
    case TemplateLanguage.ZhCN: return ArticleLanguage.ZhCN
    case TemplateLanguage.En: return ArticleLanguage.En
  }
}

/** The article-language sentence pinned in the system prompt. */
export function articleLanguageInstruction(language: ArticleLanguage): string {
  switch (language) {
    case ArticleLanguage.ZhCN: return 'The ENTIRE article must be written in Simplified Chinese (简体中文) — every heading, sentence, and label. Never switch to another language.'
    case ArticleLanguage.En: return 'The ENTIRE article must be written in English — every heading, sentence, and label. Never switch to another language.'
    case ArticleLanguage.Auto: return 'Write in the language of the question.'
  }
}

/**
 * Resolve the article language for a DOCUMENT SHELL (LaTeX preamble), which
 * must be fixed before generation: Auto probes the question text. Only
 * en/zh-CN ship templates today; the probe is the single extension point for
 * other scripts (hiragana → ja + jlreq, hangul → ko + kotex, cyrillic → ru…).
 */
export function resolveTemplateLanguage(language: ArticleLanguage, question: string): TemplateLanguage {
  switch (language) {
    case ArticleLanguage.ZhCN: return TemplateLanguage.ZhCN
    case ArticleLanguage.En: return TemplateLanguage.En
    case ArticleLanguage.Auto:
      // CJK Unified Ideographs: the zh-CN question signal. Other scripts get
      // English until their template rows exist (extension point above).
      return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(question) ? TemplateLanguage.ZhCN : TemplateLanguage.En
  }
}

/** Force the file name to end with the format's extension (.md / .tex). */
export function normalizeFileName(fileName: string, format: ArticleFormat): string {
  const base = fileName.trim().replace(/\.(md|tex)$/i, '')
  let extension: string
  switch (format) {
    case ArticleFormat.Latex: extension = '.tex'; break
    case ArticleFormat.Markdown: extension = '.md'; break
  }
  return base.length === 0 ? `electro-lab-article${extension}` : `${base}${extension}`
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

const MARKDOWN_SHARED_RULES = [
  "Restate the question clearly at the start, in the user's own words. Remove any meta or filler text that was added while merging multiple inputs into one question.",
  'Every number must come from the provided tool outputs and the final answer — never invent or recompute values.',
  'Never include record ids or timestamps anywhere in the article.',
]

/**
 * The generation prompt: the article reads like a proper technical article —
 * section headings, formulas and calculations on their own formatted lines —
 * not a chat reply and not the record's own five-section layout. The two
 * formats get format-specific instructions (Markdown headings vs LaTeX body
 * with a host-provided shell); the shared rules above stay common.
 */
export function buildArticlePrompt(record: Record, language: ArticleLanguage = ArticleLanguage.Auto, format: ArticleFormat = ArticleFormat.Markdown): GeneratePrompt {
  const languageNote = language === ArticleLanguage.Auto ? '' : `\n\nImportant: ${articleLanguageInstruction(language)}`
  const user = renderRecord(record) + languageNote
  switch (format) {
    case ArticleFormat.Latex:
      return {
        system: [
          'You are the article writer for DeepSeek Harness ElectroLab.',
          'Write ONE self-contained LaTeX article body that solves the calculation question described in the record information. The article must read like a proper technical article, not a chat reply and not a thinking transcript.',
          'The host wraps your output in the document shell — the preamble, \\title{DeepSeek Harness ElectroLab Solution}, \\author{DeepSeek Harness ElectroLab}, \\maketitle and the document environment are ALREADY in place. Output ONLY the body: start directly with the first section heading. Do NOT output \\documentclass, any \\usepackage, \\title, \\author, \\date, \\maketitle, \\begin{document} or \\end{document} — no preamble and no environment commands.',
          'Structure the body with \\section headings for the question, the approach, the calculations and the conclusion — choose headings that fit the content; do NOT reproduce the record\'s internal labels (question/analysis/tool calls/results/answer) as headings.',
          'Put formulas and calculations on their OWN lines: display math (\\[...\\]) or the align* environment for equations, inline math ($...$) for symbols inside prose, and state the computed result in prose right after the calculation.',
          'Write values with units as \\SI{<number>}{<unit>} using siunitx macros (\\volt, \\ohm, \\farad, \\henry, \\ampere, \\second, \\hertz, \\watt) — otherwise write plain numbers.',
          ...MARKDOWN_SHARED_RULES,
          'Write plain LaTeX only: no Markdown syntax (no # headings, no ** emphasis, no backticks), no HTML, no percent signs in prose (the host escapes them).',
          articleLanguageInstruction(language),
        ].join(' '),
        user,
      }
    case ArticleFormat.Markdown:
      return {
        system: [
          'You are the article writer for DeepSeek Harness ElectroLab.',
          'Write ONE self-contained Markdown article that solves the calculation question described in the record information. The article must read like a proper technical article, not a chat reply and not a thinking transcript.',
          'Structure it with headings: the H1 title must be exactly: DeepSeek Harness ElectroLab Solution, followed by an author line with exactly: DeepSeek Harness ElectroLab. Then use clear H2 section headings for the question, the approach, the calculations and the conclusion — choose headings that fit the content; do NOT reproduce the record\'s internal labels (question/analysis/tool calls/results/answer) as headings.',
          'Put formulas and calculations on their OWN lines in a clean format: each equation on a separate line (e.g. `τ = R·C = 100 Ω × 0.1 F = 10 s`), intermediate steps as separate lines, and the computed result stated in prose right after the calculation. Use Markdown formatting — headings, lists, and fenced or inline code for equations — so formulas and calculations are visually distinct from the surrounding prose.',
          ...MARKDOWN_SHARED_RULES,
          articleLanguageInstruction(language),
        ].join(' '),
        user,
      }
  }
}

/* ── LaTeX document shell ───────────────────────────────────────────────────── */

/** Result of the LaTeX body check. */
type SanitizeResult = { ok: true; body: string } | { ok: false; error: string }

/**
 * Commands a generated BODY must never contain: anything that restructures
 * the document (preamble classes/packages), reads or writes files, or
 * redefines TeX behavior. Math environments (\begin{align}…) are allowed —
 * only \begin{document}/\end{document} is rejected.
 */
const LATEX_FORBIDDEN = /\\\s*(documentclass|usepackage|RequirePackage|input|include|includeonly|write|immediate|catcode|special|makeatletter|makeatother|newcommand|renewcommand|newenvironment|renewenvironment|let|edef|gdef|global|csname|endcsname|def)(?![A-Za-z])|\\\s*(begin|end)\s*\{\s*document\s*\}/g

/**
 * Make a model-generated LaTeX body safe to compile:
 * - reject preamble/restructuring commands (injection) and mismatched braces/dollars,
 * - escape bare % (a comment starter in EVERY TeX mode — "50 %" would swallow the rest of the line).
 */
export function sanitizeLatexBody(body: string): SanitizeResult {
  const forbidden = body.match(LATEX_FORBIDDEN)
  if (forbidden !== null) {
    return { ok: false, error: `the article body contains a forbidden LaTeX command: ${forbidden[0]}` }
  }
  // Bare % → \% (an existing \% is untouched via the lookbehind).
  const escaped = body.replace(/(?<!\\)%/g, '\\%')
  // Balance checks on the escaped body with escaped sequences stripped:
  // escaped braces (\{, \}) and escaped dollars never count.
  const stripped = escaped.replace(/\\./g, '')
  const opens = (stripped.match(/\{/g) ?? []).length
  const closes = (stripped.match(/\}/g) ?? []).length
  if (opens !== closes) return { ok: false, error: `unbalanced braces in the article body (${opens} open, ${closes} close)` }
  const dollars = (stripped.match(/\$/g) ?? []).length
  if (dollars % 2 !== 0) return { ok: false, error: 'unbalanced $ in the article body (odd count)' }
  return { ok: true, body: escaped }
}

/**
 * The document shell around a model body. Engine is XeLaTeX for every
 * language (Unicode-native; ctex needs it); template rows are the extension
 * point for further languages (jlreq, kotex, …). The H1-equivalent title and
 * author are fixed by the host — never by the model — and carry no date.
 *
 * unicode-math switches math to scalable OpenType fonts (Latin Modern Math),
 * which removes the fixed-size cmex font entirely — without it, ctexart's
 * zh-CN size ladder requests odd math sizes (e.g. 10.53937pt) and LaTeX emits
 * "Font shape OMX/cmex/m/n not available" substitution warnings.
 */
export function latexDocumentShell(templateLanguage: TemplateLanguage): string {
  const title = '\\title{DeepSeek Harness ElectroLab Solution}\n'
  const author = '\\author{DeepSeek Harness ElectroLab}\n'
  const head = '% !TeX program = xelatex\n'
  const opening = '\n\\begin{document}\n\\maketitle\n'
  const math = '\\usepackage{unicode-math}\n'
  switch (templateLanguage) {
    case TemplateLanguage.ZhCN:
      // ctexart auto-selects the CJK fontset for the OS: Windows (SimSun/雅黑),
      // macOS (苹方), Linux (TeX Live's Fandol) — cross-platform by construction.
      return head + '\\documentclass{ctexart}\n' +
        '\\usepackage{amsmath}\n\\usepackage{siunitx}\n' + math +
        title + author + opening
    case TemplateLanguage.En:
      return head + '\\documentclass{article}\n' +
        '\\usepackage{fontspec}\n\\usepackage{amsmath}\n\\usepackage{siunitx}\n' + math +
        title + author + opening
  }
}

/**
 * Full, compilable LaTeX document from a model body: sanitize first, then wrap
 * in the shell for the resolved template language.
 */
export function buildLatexDocument(body: string, templateLanguage: TemplateLanguage): { ok: true; text: string } | { ok: false; error: string } {
  const checked = sanitizeLatexBody(body)
  if (!checked.ok) return checked
  const trimmed = checked.body.trim()
  if (trimmed.length === 0) return { ok: false, error: 'the model produced an empty article body' }
  return { ok: true, text: latexDocumentShell(templateLanguage) + trimmed + '\n\\end{document}\n' }
}
