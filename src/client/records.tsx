/**
 * ElectroLab Records tab: one page with every settled run across all
 * sessions, read from the plugin's own disk-backed store through the
 * `/api/dsh-electro-lab/records` endpoint and polled while the panel is open.
 * Records are plugin-owned: they survive session deletion and restarts.
 */
import { useEffect, useState } from 'react'

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
const POLL_MS = 5000
const DISPLAY_MAX_RECORDS = 100

/* ── Shared bits ───────────────────────────────────────────────────────────── */

const rowStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--dsw-alias-bg-layer-2)',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l2)',
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

/** Pretty-print a JSON arguments string (collapsed-panel summary); falls back to the raw text. */
function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** One JSON value as a collapsible tree node; objects and arrays fold, scalars render inline. */
function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }): React.JSX.Element {
  const [open, setOpen] = useState(true)
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

/** One tool call as a collapsible panel: the header shows the name, the body the arguments as a JSON tree. */
function CallPanel({ call }: { call: Call }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  let parsed: unknown = call.arguments
  if (call.arguments.length > 0) {
    try {
      parsed = JSON.parse(call.arguments)
    } catch {
      parsed = call.arguments
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
        {!open && <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{call.arguments.length > 0 ? formatJson(call.arguments) : ''}</span>}
      </div>
      {open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
          {typeof parsed === 'string'
            ? <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsed}</div>
            : <JsonNode name="" value={parsed} depth={0} />}
        </div>
      )}
    </div>
  )
}

/** The tool calls: one collapsible panel per call, all expanded by default. */
function plainCalls(calls: Call[]): React.JSX.Element {
  return (
    <div>
      {calls.map((call) => (
        <CallPanel key={call.callId} call={call} />
      ))}
    </div>
  )
}

/** The tool results as plain text rows (full output, error identity inline). */
function plainResults(results: Result[]): React.JSX.Element {
  return (
    <div>
      {results.map((result) => (
        <div key={result.callId} style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--dsw-alias-label-primary)' }}>
          {result.error !== undefined ? `✗ ${result.error.name} (${result.error.code})` : ''}
          {result.content.length > 0 ? `${result.error !== undefined ? '\n' : ''}${result.content}` : ''}
        </div>
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
 * The record detail as a PAGE covering the records tab: a back header, a
 * left table of contents (click to jump to a section heading) and ONE
 * shared scroll area on the right whose section headings stick to the top
 * while scrolling — no nested scrollbars, no framework, no popup shell.
 */
function RecordDetailPage({ record, onBack }: { record: DetailRecord; onBack: () => void }): React.JSX.Element {
  const [backHover, setBackHover] = useState(false)
  const sections: DetailSection[] = [
    { key: 'question', label: '1 · 问题', content: record.question },
    { key: 'analyse', label: '2 · 分析', content: record.analyse },
    { key: 'calls', label: '3 · 工具调用', content: record.calls.length === 0 ? '' : plainCalls(record.calls) },
    { key: 'results', label: '4 · 结果', content: record.results.length === 0 ? '' : plainResults(record.results) },
    { key: 'answer', label: '5 · 答案', content: record.answer ?? '' },
  ]

  const jump = (key: string): void => {
    const element = document.getElementById(`elab-sec-${key}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 'var(--dsw-font-markdown-base-font-size)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
        <button
          type="button"
          aria-label="返回记录"
          onClick={onBack}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2)',
            borderColor: backHover ? 'var(--dsw-alias-border-l1)' : 'var(--dsw-alias-border-l2)',
            background: backHover ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
            color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>‹</span>
          <span style={{ lineHeight: 1 }}>返回记录</span>
        </button>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {record.question || `record ${record.id}`}
        </div>
      </div>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)' }}>
        <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, font: '13px ui-monospace, monospace', wordBreak: 'break-all' }}>
          id: {record.id}
        </div>
        <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginTop: 2 }}>
          开始: {formatFull(record.startedAt)}
        </div>
        {record.settledAt !== undefined && (
          <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginTop: 1 }}>
            结束: {formatFull(record.settledAt)}
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
    </div>
  )
}

/* ── Records tab ───────────────────────────────────────────────────────────── */

export function RecordsTab(): React.JSX.Element {
  const [response, setResponse] = useState<RecordsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [dialogRecord, setDialogRecord] = useState<DetailRecord | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [delHoverId, setDelHoverId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

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
      <div style={rowStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>
          No records detected yet — the records endpoint is not responding; the panel keeps retrying automatically. If you just updated the plugin, the host process may need a restart.
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

  /** Row style: the border shows on hover (the detail now opens as a dialog). */
  const rowHoverStyle = (id: string): React.CSSProperties => ({
    ...rowStyle,
    cursor: 'pointer',
    background: hoveredId === id ? 'var(--dsw-alias-interactive-bg-hover)' : rowStyle.background,
    borderColor: hoveredId === id ? 'var(--dsw-alias-border-l1)' : 'transparent',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
        Settled records of the five-step process across all sessions — stored on disk, refreshed automatically.
      </div>
      {records.length === 0 && openRecords.length === 0 ? (
        <div style={rowStyle}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>No ElectroLab records yet — ask the agent for a calculation.</span>
        </div>
      ) : (
        <>
          {openRecords.map((run) => (
            <div
              key={`open:${run.id}`}
              style={rowHoverStyle(`open:${run.id}`)}
              onClick={() => setDialogRecord({ ...run, answer: '' })}
              onMouseEnter={() => setHoveredId(`open:${run.id}`)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 }}>● in progress</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-label-primary)', fontWeight: 600 }}>
                {run.question || run.id}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-label-primary)' }}>
                {run.calls.length} tool call(s) · started {formatTime(run.startedAt)}
              </div>
              {toolChips(run.calls)}
            </div>
          ))}
          {records.map((run) => (
            <div
              key={run.id}
              style={rowHoverStyle(run.id)}
              onClick={() => setDialogRecord(run)}
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
                  <span
                    role="button"
                    title="删除这条记录"
                    style={{
                      width: 22,
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      border: '1px solid transparent',
                      borderRadius: 4,
                      color: delHoverId === run.id ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)',
                      borderColor: delHoverId === run.id ? 'var(--dsw-alias-state-error-primary)' : 'transparent',
                      fontSize: 12,
                      cursor: 'pointer',
                      lineHeight: 1,
                      transition: 'color 0.12s, border-color 0.12s',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget({ id: run.id, title: run.question || `record ${run.id}` })
                    }}
                    onMouseEnter={() => setDelHoverId(run.id)}
                    onMouseLeave={() => setDelHoverId(null)}
                  >
                    ✕
                  </span>
                </span>
              </div>
              {run.error !== undefined && (
                <div style={{ marginTop: 4, color: 'var(--dsw-alias-state-error-primary)', font: '11px ui-monospace, monospace' }}>
                  ✗ {run.error.type}
                  {run.error.message.length > 0 ? ` — ${run.error.message}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>
                  {run.calls.length} tool call(s)
                  {run.results.some((result) => result.error !== undefined) ? `, ${run.results.filter((result) => result.error !== undefined).length} error(s)` : ''}
                </span>
              </div>
              {toolChips(run.calls)}
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
            aria-label="删除记录确认"
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
            <div style={{ fontWeight: 600, fontSize: 14 }}>删除这条记录?</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>此操作不可恢复。</div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deleteTarget.title}
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
                onClick={() => setDeleteTarget(null)}
              >
                取消
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
                  void removeRecord(target.id)
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
