/**
 * ElectroLab Records tab: one page with every settled run across all
 * sessions, read from the plugin's own disk-backed store through the
 * `/api/dsh-electro-lab/records` endpoint and polled while the panel is open.
 * Records are plugin-owned: they survive session deletion and restarts.
 */
import { useEffect, useState } from 'react'
import { t, useAppLocale, type LocaleKey } from './locales.ts'

/** Map a generation phase code to its translated label; unknown phases show no text. */
function genPhaseKey(phase: string): LocaleKey | string {
  if (phase === 'prepare') return 'phasePrepare'
  if (phase === 'generate') return 'phaseGenerate'
  if (phase === 'write') return 'phaseWrite'
  return ''
}

/** Map a stored error type to its translated message key (codes stay raw; unknown types show no message). */
function errorMessageKey(type: string): LocaleKey | string {
  if (type === 'duplicate-start') return 'errorDuplicateStartMsg'
  if (type === 'duplicate-end') return 'errorDuplicateEndMsg'
  if (type === 'incomplete') return 'errorIncompleteMsg'
  return ''
}

/* ── Records data shapes (mirror of the host store + endpoint) ─────────────── */

interface Call {
  callId: string
  name: string
  arguments: string
}

interface Result {
  callId: string
  content: string
  error?: { name: string; code: string }
}

interface RecordError {
  type: string
  message: string
}

interface SettledRecord {
  id: string
  startedAt: number
  settledAt: number
  question: string
  analyse: string
  answer: string
  calls: Call[]
  results: Result[]
  error?: RecordError
}

interface OpenRecord {
  id: string
  startedAt: number
  lastAt: number
  question: string
  analyse: string
  calls: Call[]
  results: Result[]
}

interface RecordsResponse {
  records: SettledRecord[]
  open: OpenRecord[]
}

const RECORDS_ENDPOINT = '/api/dsh-electro-lab/records'
const GENERATE_DIR_ENDPOINT = '/api/dsh-electro-lab/generate-dir'
const GENERATE_ENDPOINT = '/api/dsh-electro-lab/generate'
const GENERATE_PROGRESS_ENDPOINT = '/api/dsh-electro-lab/generate-progress'
const LIST_DIRS_ENDPOINT = '/api/dsh-electro-lab/list-dirs'
const LIST_ROOTS_ENDPOINT = '/api/dsh-electro-lab/list-roots'
const POLL_MS = 5000
const DISPLAY_MAX_RECORDS = 100

/* ── Shared bits ───────────────────────────────────────────────────────────── */

const rowStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'none',
  borderRadius: 6,
  border: '1px solid transparent',
}

/** Static info rows (empty / unreachable) keep a visible outline; record cards stay borderless until hovered. */
const outlinedRowStyle: React.CSSProperties = {
  ...rowStyle,
  borderColor: 'var(--dsw-alias-border-l2)',
}

/** Small ghost button for the records-page header (select / cancel). */
const headerButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  background: 'none',
  border: '1px solid var(--dsw-alias-label-tertiary)',
  borderRadius: 6,
  cursor: 'pointer',
}

/** Text input inside the generation setup dialog. */
const genInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-specific-input-major)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'ui-monospace, monospace',
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Full timestamp for the detail view. */
function formatFull(time: number): string {
  return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
}

/** Plain text block: no box, no inner scroll — the dialog's single outer scrollbar owns scrolling. */
function plainText(text: string): React.JSX.Element {
  return (
    <div style={{ lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text}
    </div>
  )
}

/** Serialize a parsed JSON value with value objects replaced by their compact math form (e.g. `"resistance": 100 Ω`). */
function jsonWithMath(value: unknown, indent = 0): string {
  const pad = (n: number): string => '  '.repeat(n)
  if (isValueObject(value)) return formatValueObject(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((item) => `${pad(indent + 1)}${jsonWithMath(item, indent + 1)}`).join(',\n')}\n${pad(indent)}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return `{\n${entries.map(([key, item]) => `${pad(indent + 1)}${JSON.stringify(key)}: ${jsonWithMath(item, indent + 1)}`).join(',\n')}\n${pad(indent)}}`
  }
  return JSON.stringify(value)
}

/** Like jsonWithMath, but the outermost object renders without braces — its entries become a plain list. */
function jsonTop(value: unknown): string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !isValueObject(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return ''
    return entries.map(([key, item]) => `${JSON.stringify(key)}: ${jsonWithMath(item, 1)}`).join('\n')
  }
  return jsonWithMath(value)
}

/** Pretty-print an arguments string with value objects as math lines; falls back to the raw text. */
function formatJson(text: string): string {
  try {
    return jsonTop(JSON.parse(text))
  } catch {
    return text
  }
}

/** Unit symbol per value kind, for the compact mathematical display. */
const VALUE_UNITS: Record<string, string> = {
  frequency: 'Hz',
  resistance: 'Ω',
  capacitance: 'F',
  inductance: 'H',
  voltage: 'V',
  current: 'A',
  power: 'W',
  time: 's',
  angle: 'rad',
  log: 'dB',
  none: '',
}

/** True when the value is one of the value-object shapes the tools exchange: rect/polar input or the serialized output. */
function isValueObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  const isNum = (x: unknown): x is number => typeof x === 'number'
  const isStr = (x: unknown): x is string => typeof x === 'string'
  if (v.form === 'rect') return isNum(v.re) && isNum(v.im) && isStr(v.kind)
  if (v.form === 'polar') return isNum(v.mag) && isNum(v.ang) && isStr(v.kind)
  return isNum(v.re) && isNum(v.im) && isStr(v.kind)
}

/** Format a number in standard mathematical notation: up to 6 significant digits, scientific for very small/large magnitudes. */
function fmtNum(x: number): string {
  if (Object.is(x, -0)) x = 0
  const abs = Math.abs(x)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) {
    const [mant, exp] = x.toExponential(5).split('e')
    const m = String(Number(mant))
    const e = String(Number(exp))
    return `${m}e${e}`
  }
  return String(Number(x.toPrecision(6)))
}

/** Compact mathematical display of a value object, e.g. `100 Ω`, `100 + 25j Ω`, `1 ∠ 0 rad`. */
function formatValueObject(value: Record<string, unknown>): string {
  const kind = typeof value.kind === 'string' ? value.kind : 'none'
  const unit = VALUE_UNITS[kind] ?? ''
  const withUnit = (body: string): string => (unit.length > 0 ? `${body} ${unit}` : body)
  const show = (x: unknown): string => (typeof x === 'number' ? fmtNum(x) : String(x))
  if (value.form !== 'polar' && typeof value.re === 'number' && typeof value.im === 'number') {
    const re = value.re
    const im = value.im
    let body: string
    if (im === 0) body = show(re)
    else if (re === 0) body = `${show(im)}j`
    else body = im < 0 ? `${show(re)} - ${show(-im)}j` : `${show(re)} + ${show(im)}j`
    return withUnit(body)
  }
  if (typeof value.mag === 'number' && typeof value.ang === 'number') {
    return withUnit(`${show(value.mag)} ∠ ${show(value.ang)} rad`)
  }
  return JSON.stringify(value)
}

/** A value object as one compact line in mathematical notation — no expansion. */
function ValueNode({ name, value, depth }: { name: string; value: Record<string, unknown>; depth: number }): React.JSX.Element {
  return (
    <div style={{ paddingLeft: depth * 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{name.length > 0 ? `${name}: ` : ''}</span>
      <span style={{ color: 'var(--dsw-alias-label-primary)' }}>{formatValueObject(value)}</span>
    </div>
  )
}

/** One JSON value as a collapsible tree node; objects and arrays fold, scalars render inline. */
function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  // A string that embeds JSON (e.g. a value object recorded verbatim as a JSON
  // string inside the arguments) renders as its parsed tree instead of a raw
  // text leaf, so every object in a call's parameters/result shows as a tree.
  if (typeof value === 'string' && (value.trimStart().startsWith('{') || value.trimStart().startsWith('['))) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed !== null && typeof parsed === 'object') {
        return <JsonNode name={name} value={parsed} depth={depth} />
      }
    } catch {
      // Not JSON after all — fall through to the scalar leaf.
    }
  }
  if (isValueObject(value)) {
    return <ValueNode name={name} value={value} depth={depth} />
  }
  if (value === null || typeof value !== 'object') {
    return (
      <div style={{ paddingLeft: depth * 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{name.length > 0 ? `${name}: ` : ''}</span>
        <span style={{ color: 'var(--dsw-alias-label-primary)' }}>{JSON.stringify(value)}</span>
      </div>
    )
  }
  const isArray = Array.isArray(value)
  const entries: Array<[string, unknown]> = isArray
    ? (value as unknown[]).map((item, index) => [String(index), item] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)
  const summary = isArray ? `[…] ${entries.length} 项` : `{…} ${entries.length} 项`
  return (
    <div>
      <div
        style={{ paddingLeft: depth * 14, lineHeight: 1.6, cursor: 'pointer', color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'none' }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{open ? '▾' : '▸'}</span>
        {name.length > 0 ? ` ${name}: ` : ' '}
        {open ? '' : <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{summary}</span>}
      </div>
      {open && (
        <div>
          {entries.map(([key, item]) => (
            <JsonNode key={key} name={isArray ? `[${key}]` : key} value={item} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One tool call merged with its result in a single collapsible panel: name, parameters, then result, in order. */
function CallResultPanel({ call, result }: { call: Call; result: Result | undefined }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  let parsedArgs: unknown = call.arguments
  if (call.arguments.length > 0) {
    try {
      parsedArgs = JSON.parse(call.arguments)
    } catch {
      parsedArgs = call.arguments
    }
  }
  let parsedResult: unknown = result?.content ?? ''
  if (result !== undefined && result.content.length > 0) {
    try {
      parsedResult = JSON.parse(result.content)
    } catch {
      parsedResult = result.content
    }
  }
  return (
    <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: 'var(--dsw-alias-bg-base)', userSelect: 'none' }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>{call.name}</span>
      </div>
      {open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>{t('params')}</div>
          {typeof parsedArgs === 'string'
            ? <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsedArgs}</div>
            : <JsonNode name="" value={parsedArgs} depth={0} />}
          {result !== undefined && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginTop: 8, marginBottom: 4 }}>{t('resultItem')}</div>
              {typeof parsedResult === 'string'
                ? <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsedResult}</div>
                : <JsonNode name="" value={parsedResult} depth={0} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The tool calls merged with their results: one collapsible panel per call. */
function mergedCalls(calls: Call[], results: Result[]): React.JSX.Element {
  const resultOf = (callId: string): Result | undefined => results.find((r) => r.callId === callId)
  return (
    <div>
      {calls.map((call) => (
        <CallResultPanel key={call.callId} call={call} result={resultOf(call.callId)} />
      ))}
    </div>
  )
}

/** Tool usage chips derived from the structured calls. */
function toolChips(calls: Call[]): React.JSX.Element | null {
  if (calls.length === 0) return null
  const counts = new Map<string, number>()
  for (const call of calls) counts.set(call.name, (counts.get(call.name) ?? 0) + 1)
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {[...counts.entries()].map(([name, count]) => (
        <span
          key={name}
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--dsw-alias-bg-layer-2)',
            border: '1px solid var(--dsw-alias-border-l2)',
            color: 'var(--dsw-alias-state-success-primary)',
            font: '11px ui-monospace, monospace',
          }}
        >
          {name}×{count}
        </span>
      ))}
    </div>
  )
}

/* ── Detail dialog: id, timestamps, and the five steps with sticky headings ── */

/** Everything the detail dialog shows; settled records and open records both fit. */
interface DetailRecord {
  id: string
  startedAt: number
  settledAt?: number
  question: string
  analyse: string
  answer?: string
  calls: Call[]
  results: Result[]
  error?: RecordError
}

/** The five steps of the record, in order. */
interface DetailSection {
  key: string
  label: string
  content: React.JSX.Element | string | null
}

/** One section: a sticky heading (sticks to the top of the shared scroll area until the next section pushes it away) plus the content below it. */
function sectionBlock(section: DetailSection): React.JSX.Element {
  return (
    <section id={`elab-sec-${section.key}`} style={{ scrollMarginTop: 0 }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          background: 'var(--dsw-alias-bg-layer-2)',
          borderBottom: '1px solid var(--dsw-alias-border-l2)',
          padding: '6px 12px',
          fontWeight: 600,
          color: 'var(--dsw-alias-label-primary)',
        }}
      >
        {section.label}
      </div>
      <div style={{ padding: '10px 12px' }}>
        {section.content === null || (typeof section.content === 'string' && section.content.length === 0)
          ? <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>—</span>
          : typeof section.content === 'string'
            ? plainText(section.content)
            : section.content}
      </div>
    </section>
  )
}

/**
 * Build the exported markdown: an H1 `DeepSeek Harness ElectroLab Exported`
 * (localized), the id/timestamps as body text, then five H2 sections (no
 * index numbers) with the step contents as body text.
 */
function buildRecordMarkdown(record: DetailRecord): string {
  const lines: string[] = []
  lines.push(`# DeepSeek Harness ElectroLab ${t('exported')}`, '')
  // Blank lines between the metadata rows: markdown renders adjacent lines as one paragraph.
  lines.push(`id: ${record.id}`, '')
  lines.push(`${t('startedAt')}: ${formatFull(record.startedAt)}`, '')
  if (record.settledAt !== undefined) lines.push(`${t('settledAt')}: ${formatFull(record.settledAt)}`, '')
  lines.push(`## ${t('stepQuestion')}`, '', record.question, '')
  lines.push(`## ${t('stepAnalyse')}`, '', record.analyse, '')
  const nameOf = (callId: string, index: number): string => {
    const call = record.calls.find((c) => c.callId === callId)
    return call?.name ?? `${t('resultItem')} ${index + 1}`
  }
  lines.push(`## ${t('stepCalls')}`, '')
  for (const call of record.calls) {
    lines.push(`### ${call.name}`, '')
    if (call.arguments.length > 0) {
      lines.push(`#### ${t('params')}`, '', '```text', formatJson(call.arguments), '```', '')
    }
    const result = record.results.find((r) => r.callId === call.callId)
    if (result !== undefined) {
      const trimmed = result.content.trim()
      if (trimmed.length > 0) {
        lines.push(`#### ${t('resultItem')}`, '')
        try {
          const parsed: unknown = JSON.parse(trimmed)
          lines.push('```text', jsonTop(parsed), '```', '')
        } catch {
          lines.push(result.content, '')
        }
      }
    }
  }
  lines.push(`## ${t('stepAnswer')}`, '', record.answer ?? '', '')
  return lines.join('\n')
}

/** Save the record as a markdown file: a save-file picker when available, a download fallback otherwise. */
async function exportRecordFile(record: DetailRecord): Promise<void> {
  const markdown = buildRecordMarkdown(record)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const suggestedName = `electro-lab-${record.id.slice(0, 8)}.md`
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: {
      suggestedName: string
      types: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>
  }).showSaveFilePicker
  if (picker !== undefined) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return // user cancelled
      // Fall through to the download fallback on any other failure.
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * The record detail as a PAGE covering the records tab: a back header, a
 * left table of contents (click to jump to a section heading) and ONE
 * shared scroll area on the right whose section headings stick to the top
 * while scrolling — no nested scrollbars, no framework, no popup shell.
 */
function RecordDetailPage({ record, onBack }: { record: DetailRecord; onBack: () => void }): React.JSX.Element {
  const [backHover, setBackHover] = useState(false)
  const [exportHover, setExportHover] = useState(false)
  const [genHover, setGenHover] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genDir, setGenDir] = useState('')
  const [genFile, setGenFile] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genProgress, setGenProgress] = useState<{ percent: number; phase: string } | null>(null)
  const [dirBrowserOpen, setDirBrowserOpen] = useState(false)
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([])
  const [dirExpanded, setDirExpanded] = useState<Set<string>>(new Set())
  const [dirSelected, setDirSelected] = useState('')
  const [dirLoading, setDirLoading] = useState(false)
  const [dirSnapshot, setDirSnapshot] = useState<{ dir: string; file: string } | null>(null)
  const defaultFileName = `electro-lab-${record.id.slice(0, 8)}.md`

  // Auto-fill the remembered output directory whenever the dialog opens.
  useEffect(() => {
    if (!genOpen) return
    let alive = true
    fetch(GENERATE_DIR_ENDPOINT)
      .then((r) => r.json() as Promise<{ directory?: string }>)
      .then((body) => {
        if (alive && body.directory !== undefined && body.directory !== '') setGenDir(body.directory)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [genOpen])

  /** Persist the directory so the next generation dialog auto-fills it. */
  const saveGenDir = (): void => {
    const dir = genDir.trim()
    if (dir.length === 0) return
    void fetch(`${GENERATE_DIR_ENDPOINT}?dir=${encodeURIComponent(dir)}`, { method: 'PUT' }).catch(() => {})
  }

  const closeGenDialog = (): void => {
    saveGenDir()
    setGenOpen(false)
  }

  /** Ask the host to generate the article (LLM) and write it to disk; a progress dialog polls the job. */
  const runGenerate = async (): Promise<void> => {
    const dir = genDir.trim()
    if (dir.length === 0) return
    setGenBusy(true)
    setGenProgress({ percent: 0, phase: 'prepare' })
    const fail = (message: string): void => {
      setGenProgress(null)
      setGenBusy(false)
      window.alert(`Generation failed: ${message}`)
    }
    try {
      const res = await fetch(
        `${GENERATE_ENDPOINT}?recordId=${encodeURIComponent(record.id)}&format=markdown&directory=${encodeURIComponent(dir)}&fileName=${encodeURIComponent(genFile.trim())}`,
        { method: 'POST' },
      )
      const body = (await res.json()) as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `generate returned ${res.status}`)
      if (body.jobId === undefined) throw new Error('no job id returned')
      // Poll the job until it settles.
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const pr = await fetch(`${GENERATE_PROGRESS_ENDPOINT}?jobId=${encodeURIComponent(body.jobId)}`)
        if (!pr.ok) throw new Error(`progress returned ${pr.status}`)
        const job = (await pr.json()) as { status?: string; percent?: number; phase?: string; path?: string; error?: string }
        if (job.percent !== undefined && job.phase !== undefined) {
          setGenProgress({ percent: job.percent, phase: job.phase })
        }
        if (job.status === 'done') {
          saveGenDir()
          setGenOpen(false)
          setGenProgress(null)
          setGenBusy(false)
          window.alert(`Generated: ${job.path ?? ''}`)
          return
        }
        if (job.status === 'error') {
          fail(job.error ?? 'unknown error')
          return
        }
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }

  /** One node of the host-driven directory tree (hand-rolled: the React-19-only packages are incompatible with this React 18 host). */
  interface DirEntry {
    name: string
    type: 'directory' | 'file'
    absolutePath: string
    children?: DirEntry[]
  }

  /** Load one directory's subdirectories AND files through the host (pure HTTP — remote-safe). */
  const loadDirListing = async (path: string): Promise<{ entries: string[]; files: string[] }> => {
    const res = await fetch(`${LIST_DIRS_ENDPOINT}?path=${encodeURIComponent(path)}`)
    if (!res.ok) throw new Error(`list-dirs returned ${res.status}`)
    const body = (await res.json()) as { entries?: string[]; files?: string[] }
    return { entries: body.entries ?? [], files: body.files ?? [] }
  }

  /** Open the directory browser: fetch the roots (drives on Windows, home otherwise). */
  const openDirBrowser = async (): Promise<void> => {
    try {
      const res = await fetch(LIST_ROOTS_ENDPOINT)
      if (!res.ok) throw new Error(`list-roots returned ${res.status}`)
      const body = (await res.json()) as { roots?: string[] }
      const roots = body.roots ?? []
      if (roots.length === 0) return
      setDirEntries(roots.map((root) => ({ name: root, type: 'directory', absolutePath: root })))
      setDirSelected(roots[0]!)
      setDirExpanded(new Set())
      setDirLoading(false)
      setDirSnapshot({ dir: genDir, file: genFile })
      setDirBrowserOpen(true)
    } catch (error) {
      window.alert(`Cannot browse directories: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Immutably attach lazily loaded children to one node in the tree. */
  const attachChildren = (nodes: DirEntry[], path: string, children: DirEntry[]): DirEntry[] =>
    nodes.map((node) => {
      if (node.absolutePath === path) return { ...node, children }
      if (node.children !== undefined) return { ...node, children: attachChildren(node.children, path, children) }
      return node
    })

  /** Find one entry by absolute path (depth-first over the loaded tree). */
  const findEntry = (nodes: DirEntry[], path: string): DirEntry | undefined => {
    for (const node of nodes) {
      if (node.absolutePath === path) return node
      if (node.children !== undefined) {
        const found = findEntry(node.children, path)
        if (found !== undefined) return found
      }
    }
    return undefined
  }

  /** Click a tree row: directories lazily load + toggle expand and fill the directory; files fill the name + its directory. */
  const onDirClick = async (node: DirEntry): Promise<void> => {
    setDirSelected(node.absolutePath)
    if (node.type === 'file') {
      const parent = node.absolutePath.slice(0, node.absolutePath.lastIndexOf('/') + 1) || node.absolutePath
      setGenDir(parent)
      setGenFile(node.name)
      return
    }
    setGenDir(node.absolutePath)
    if (node.children === undefined) {
      setDirLoading(true)
      try {
        const { entries, files } = await loadDirListing(node.absolutePath)
        const children: DirEntry[] = [
          ...entries.map((name) => ({ name, type: 'directory' as const, absolutePath: `${node.absolutePath.replace(/[\\/]+$/, '')}/${name}` })),
          ...files.map((name) => ({ name, type: 'file' as const, absolutePath: `${node.absolutePath.replace(/[\\/]+$/, '')}/${name}` })),
        ]
        setDirEntries((prev) => attachChildren(prev, node.absolutePath, children))
      } catch (error) {
        window.alert(`Cannot browse directories: ${error instanceof Error ? error.message : String(error)}`)
        setDirLoading(false)
        return
      }
      setDirLoading(false)
    }
    setDirExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(node.absolutePath)) next.delete(node.absolutePath)
      else next.add(node.absolutePath)
      return next
    })
  }

  /** Recursive tree node renderer (flat state: entries tree + expanded set). */
  const renderDirNode = (node: DirEntry, depth: number): React.JSX.Element => {
    const expanded = dirExpanded.has(node.absolutePath)
    const isSelected = dirSelected === node.absolutePath
    const isDir = node.type === 'directory'
    return (
      <div key={node.absolutePath}>
        <div
          role="button"
          style={{
            padding: '4px 8px',
            paddingLeft: 8 + depth * 14,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--dsw-alias-label-primary)',
            background: isSelected ? 'var(--dsw-alias-interactive-bg-active)' : 'none',
          }}
          onClick={() => void onDirClick(node)}
          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'none' }}
        >
          <span style={{ color: 'var(--dsw-alias-label-secondary)', marginRight: 4 }}>{isDir ? (expanded ? '▾' : '▸') : ''}</span>
          <span>{isDir ? '📁 ' : '📄 '}{node.name}</span>
        </div>
        {isDir && expanded && node.children !== undefined && node.children.map((child) => renderDirNode(child, depth + 1))}
      </div>
    )
  }

  /** Cancel the browse: revert the setup fields to their pre-browse values and close. */
  const closeDirBrowser = (): void => {
    if (dirSnapshot !== null) {
      setGenDir(dirSnapshot.dir)
      setGenFile(dirSnapshot.file)
    }
    setDirBrowserOpen(false)
  }

  const sections: DetailSection[] = [
    { key: 'question', label: t('sectionQuestion'), content: record.question },
    { key: 'analyse', label: t('sectionAnalyse'), content: record.analyse },
    { key: 'calls', label: t('sectionCalls'), content: record.calls.length === 0 ? '' : mergedCalls(record.calls, record.results) },
    { key: 'answer', label: t('sectionAnswer'), content: record.answer ?? '' },
  ]

  const jump = (key: string): void => {
    const element = document.getElementById(`elab-sec-${key}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 'var(--dsw-font-markdown-base-font-size)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            aria-label={t('backToRecords')}
            onClick={onBack}
            onMouseEnter={() => setBackHover(true)}
            onMouseLeave={() => setBackHover(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-label-tertiary)',
              borderColor: backHover ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
              background: backHover ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
              color: 'var(--dsw-alias-label-primary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>‹</span>
            <span style={{ lineHeight: 1 }}>{t('backToRecords')}</span>
          </button>
          <span style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              aria-label={t('exportRecord')}
              title={t('exportRecord')}
              onClick={() => void exportRecordFile(record)}
              onMouseEnter={() => setExportHover(true)}
              onMouseLeave={() => setExportHover(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-label-tertiary)',
                borderColor: exportHover ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                background: exportHover ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
                color: 'var(--dsw-alias-label-primary)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>↓</span>
              <span style={{ lineHeight: 1 }}>{t('exportRecord')}</span>
            </button>
            <button
              type="button"
              aria-label={t('generate')}
              title={t('generate')}
              onClick={() => setGenOpen(true)}
              onMouseEnter={() => setGenHover(true)}
              onMouseLeave={() => setGenHover(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-label-tertiary)',
                borderColor: genHover ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                background: genHover ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
                color: 'var(--dsw-alias-label-primary)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>▶</span>
              <span style={{ lineHeight: 1 }}>{t('generate')}</span>
            </button>
          </span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {record.question || `record ${record.id}`}
        </div>
      </div>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)' }}>
        <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, font: '13px ui-monospace, monospace', wordBreak: 'break-all' }}>
          id: {record.id}
        </div>
        <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginTop: 2 }}>
          {t('startedAt')}: {formatFull(record.startedAt)}
        </div>
        {record.settledAt !== undefined && (
          <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginTop: 1 }}>
            {t('settledAt')}: {formatFull(record.settledAt)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Table of contents: fixed, jumps to the section headings. */}
        <nav style={{ width: 150, flex: 'none', borderRight: '1px solid var(--dsw-alias-border-l2)', overflowY: 'auto', padding: '8px 0' }}>
          {sections.map((section) => (
            <div
              key={section.key}
              role="button"
              style={{
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--dsw-alias-label-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onClick={() => jump(section.key)}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-label-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)' }}
            >
              {section.label}
            </div>
          ))}
        </nav>
        {/* The ONE scroll area; its headings stick to the top. */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {sections.map((section) => sectionBlock(section))}
        </div>
      </div>
      {genOpen && !genBusy && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-1)',
          }}
          onClick={() => closeGenDialog()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('generateSetup')}
            style={{
              width: 420,
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--dsw-alias-bg-layer-2)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 10,
              padding: 16,
              boxShadow: 'var(--dsw-shadow-lv3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('generateSetup')}</div>
            {/* Two-column grid: the label column auto-sizes to the longest label (max-content),
                so keys right-align and values left-align regardless of text length or locale. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '12px 10px', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right' }}>{t('format')}</span>
              <select
                value="markdown"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 13,
                  color: 'var(--dsw-alias-label-primary)',
                  background: 'var(--dsw-specific-input-major)',
                  border: '1px solid var(--dsw-alias-border-l2)',
                  borderRadius: 6,
                }}
              >
                <option value="markdown">Markdown</option>
              </select>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right' }}>{t('directory')}</span>
              <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                <input
                  type="text"
                  value={genDir}
                  onChange={(e) => setGenDir(e.target.value)}
                  placeholder="/path/to/output"
                  style={{ ...genInputStyle }}
                />
                <button
                  type="button"
                  onClick={() => void openDirBrowser()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--dsw-alias-label-tertiary)',
                    background: 'none',
                    color: 'var(--dsw-alias-label-primary)',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {t('browse')}
                </button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right' }}>{t('fileName')}</span>
              <input
                type="text"
                value={genFile}
                onChange={(e) => setGenFile(e.target.value)}
                placeholder={defaultFileName}
                style={{ ...genInputStyle }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-border-l2)',
                  background: 'none',
                  color: 'var(--dsw-alias-label-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={() => closeGenDialog()}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={genBusy}
                onClick={() => void runGenerate()}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-state-business-primary)',
                  background: 'none',
                  color: 'var(--dsw-alias-state-business-primary)',
                  cursor: genBusy ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: genBusy ? 0.5 : 1,
                }}
              >
                {t('generate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {dirBrowserOpen && !genBusy && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-1)',
          }}
          onClick={closeDirBrowser}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('browseDirectory')}
            style={{
              width: 420,
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--dsw-alias-bg-layer-2)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 10,
              padding: 16,
              boxShadow: 'var(--dsw-shadow-lv3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('browseDirectory')}</div>
            <div style={{ marginTop: 10, font: '12px ui-monospace, monospace', color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' }}>
              {dirSelected}
            </div>
            <div style={{ marginTop: 8, maxHeight: 280, overflowY: 'auto', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 0' }}>
              {dirLoading && (
                <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>…</div>
              )}
              {dirEntries.map((node) => renderDirNode(node, 0))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-border-l2)',
                  background: 'none',
                  color: 'var(--dsw-alias-label-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={closeDirBrowser}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-state-business-primary)',
                  background: 'none',
                  color: 'var(--dsw-alias-state-business-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                onClick={() => setDirBrowserOpen(false)}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {genProgress !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-1)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('generating')}
            style={{
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--dsw-alias-bg-layer-2)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 10,
              padding: 16,
              boxShadow: 'var(--dsw-shadow-lv3)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('generating')}</div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--dsw-alias-interactive-bg-hover)', overflow: 'hidden', marginTop: 14 }}>
              <div
                style={{
                  height: '100%',
                  width: `${genProgress.percent}%`,
                  background: 'var(--dsw-alias-state-business-primary)',
                  transition: 'width 0.3s linear',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
              <span>{t(genPhaseKey(genProgress.phase))}</span>
              <span>{Math.round(genProgress.percent)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Records tab ───────────────────────────────────────────────────────────── */

export function RecordsTab(): React.JSX.Element {
  useAppLocale() // Re-render when the active language changes.
  const [response, setResponse] = useState<RecordsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [dialogRecord, setDialogRecord] = useState<DetailRecord | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; heading: string } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(RECORDS_ENDPOINT)
        if (!res.ok) throw new Error(`records endpoint returned ${res.status}`)
        const body = (await res.json()) as RecordsResponse
        if (!alive) return
        setResponse(body)
        setFailed(false)
      } catch {
        if (alive) setFailed(true)
      }
    }
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [refreshTick])

  /** Delete one settled record from the archive and refresh. */
  const removeRecord = async (id: string): Promise<void> => {
    try {
      await fetch(`${RECORDS_ENDPOINT}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setRefreshTick((tick) => tick + 1)
    } catch {
      // The poll retries; nothing else to do.
    }
  }

  if (failed && response === null) {
    return (
      <div style={outlinedRowStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          {t('unreachable')}
        </span>
      </div>
    )
  }

  // The detail page covers the records tab.
  if (dialogRecord !== null) {
    return <RecordDetailPage record={dialogRecord} onBack={() => setDialogRecord(null)} />
  }

  const records = (response?.records ?? []).slice(0, DISPLAY_MAX_RECORDS)
  const openRecords = response?.open ?? []

  /** Toggle one record in the selection (select mode). */
  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Leave select mode and drop the selection. */
  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Set())
  }

  /** Row style: borderless, only the border highlights on hover; a selected card gets the accent border + tint — heavier than hover. */
  const rowHoverStyle = (id: string): React.CSSProperties => {
    const isSelected = selectMode && selected.has(id)
    return {
      ...rowStyle,
      cursor: 'pointer',
      borderColor: isSelected
        ? 'var(--dsw-alias-state-business-primary)'
        : hoveredId === id
          ? 'var(--dsw-alias-label-primary)'
          : 'transparent',
      background: isSelected ? 'var(--dsw-alias-interactive-bg-active)' : 'none',
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {selectMode ? (
          <button type="button" style={headerButtonStyle} onClick={exitSelectMode}>
            {t('cancelSelect')}
          </button>
        ) : (
          <button type="button" style={headerButtonStyle} onClick={() => setSelectMode(true)}>
            {t('select')}
          </button>
        )}
        {selectMode && (
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => setDeleteTarget({
              ids: [...selected],
              heading: t('deleteSelectedTitle', { count: selected.size }),
            })}
            style={{
              ...headerButtonStyle,
              color: 'var(--dsw-alias-state-error-primary)',
              borderColor: 'var(--dsw-alias-state-error-primary)',
              opacity: selected.size === 0 ? 0.45 : 1,
              cursor: selected.size === 0 ? 'default' : 'pointer',
            }}
          >
            {t('delete')}
          </button>
        )}
      </div>
      {records.length === 0 && openRecords.length === 0 ? (
        <div style={outlinedRowStyle}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('emptyHint')}</span>
        </div>
      ) : (
        <>
          {openRecords.map((run) => (
            <div
              key={`open:${run.id}`}
              style={rowHoverStyle(`open:${run.id}`)}
              onClick={() => { if (!selectMode) setDialogRecord({ ...run, answer: '' }) }}
              onMouseEnter={() => setHoveredId(`open:${run.id}`)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 }}>{t('inProgress')}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-label-primary)', fontWeight: 600 }}>
                {run.question || run.id}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-label-primary)' }}>
                {t('toolCallsCount', { count: run.calls.length })} · {t('startedAt')} {formatTime(run.startedAt)}
              </div>
              {toolChips(run.calls)}
            </div>
          ))}
          {records.map((run) => (
            <div
              key={run.id}
              style={rowHoverStyle(run.id)}
              onClick={() => { if (selectMode) toggleSelect(run.id); else setDialogRecord(run) }}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{
                  color: 'var(--dsw-alias-label-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}>
                  {run.question || `record ${run.id}`}
                </span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
                  <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatTime(run.startedAt)}
                  </span>
                </span>
              </div>
              <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-secondary)', font: '11px ui-monospace, monospace', wordBreak: 'break-all' }}>
                {run.id}
              </div>
              {run.error !== undefined && (
                <div style={{ marginTop: 4, color: 'var(--dsw-alias-state-error-primary)', font: '11px ui-monospace, monospace' }}>
                  ✗ {run.error.type}
                  {run.error.message.length > 0 ? ` — ${t(errorMessageKey(run.error.type))}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>
                  {t('toolCallsCount', { count: run.calls.length })}
                  {run.results.some((result) => result.error !== undefined) ? t('errorsCount', { count: run.results.filter((result) => result.error !== undefined).length }) : ''}
                </span>
              </div>
              {toolChips(run.calls)}
            </div>
          ))}
        </>
      )}
      {deleteTarget !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-1)',
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={deleteTarget.heading}
            style={{
              width: 320,
              maxWidth: 'calc(100vw - 32px)',
              background: 'var(--dsw-alias-bg-layer-2)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 10,
              padding: 16,
              boxShadow: 'var(--dsw-shadow-lv3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{deleteTarget.heading}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('irreversible')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-border-l2)',
                  background: 'none',
                  color: 'var(--dsw-alias-label-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={() => setDeleteTarget(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--dsw-alias-state-error-primary)',
                  background: 'none',
                  color: 'var(--dsw-alias-state-error-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                onClick={() => {
                  const target = deleteTarget
                  setDeleteTarget(null)
                  for (const id of target.ids) void removeRecord(id)
                  if (target.ids.length > 1) exitSelectMode()
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
