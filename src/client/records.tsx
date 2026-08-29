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
  padding: '8px 10px',
  background: '#111318',
  borderRadius: 6,
  border: '1px solid #2a2f3a',
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

const paragraphStyle: React.CSSProperties = {
  marginTop: 6,
  maxHeight: 140,
  overflow: 'auto',
  padding: '6px 8px',
  background: '#0d0f14',
  borderRadius: 4,
  border: '1px solid #232833',
  color: '#aab2c0',
  font: '12px/1.6 ui-sans-serif, system-ui, sans-serif',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

/** The structured tool calls, one row each with the raw arguments. */
function callsBox(calls: Call[]): React.JSX.Element | null {
  if (calls.length === 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {calls.map((call) => (
        <div key={call.callId} style={{ background: '#0a0d12', borderRadius: 4, border: '1px solid #1e2530', padding: '4px 8px' }}>
          <span style={{ color: '#7fbf9a', font: '11px ui-monospace, monospace' }}>{call.name}</span>
          {call.arguments.length > 0 && (
            <span style={{ color: '#8b93a5', font: '11px ui-monospace, monospace' }}> {call.arguments}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** The structured tool results, keeping the full output and error identity. */
function resultsBox(results: Result[]): React.JSX.Element | null {
  if (results.length === 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {results.map((result) => (
        <div key={result.callId} style={{ background: '#0a0d12', borderRadius: 4, border: '1px solid #1e2530', padding: '4px 8px' }}>
          {result.error !== undefined && (
            <div style={{ color: '#e08a8a', font: '11px ui-monospace, monospace' }}>
              ✗ {result.error.name} ({result.error.code})
            </div>
          )}
          {result.content.length > 0 && (
            <div style={{ color: '#9fc3ae', font: '11px/1.6 ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 100, overflow: 'auto' }}>
              {result.content}
            </div>
          )}
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
            background: '#1c2b22',
            border: '1px solid #2c4a3a',
            color: '#7fbf9a',
            font: '11px ui-monospace, monospace',
          }}
        >
          {name}×{count}
        </span>
      ))}
    </div>
  )
}

/* ── Detail view: id, timestamps, and the five steps in order ───────────────── */

/** Everything the detail view shows; settled records and open records both fit. */
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

/** One grid row: step title (left) + content (right); empty content shows a placeholder. */
function stepCell(label: string, content: React.JSX.Element | string | null): React.JSX.Element {
  const empty = content === null || (typeof content === 'string' && content.length === 0)
  return (
    <>
      <div style={{ color: '#8b93a5', fontSize: 11, fontWeight: 600, paddingTop: 2 }}>{label}</div>
      <div style={{ minWidth: 0 }}>
        {empty
          ? <span style={{ color: '#5b6270', fontSize: 11 }}>—</span>
          : typeof content === 'string'
            ? <div style={paragraphStyle}>{content}</div>
            : content}
      </div>
    </>
  )
}

/** The expanded detail: identity, timestamps, and the five steps in a grid. */
function detailGrid(record: DetailRecord): React.JSX.Element {
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #232833', paddingTop: 8 }}>
      <div style={{ color: '#8b93a5', font: '11px ui-monospace, monospace', wordBreak: 'break-all' }}>
        id: {record.id}
      </div>
      <div style={{ color: '#8b93a5', fontSize: 11, marginTop: 2 }}>
        started: {formatFull(record.startedAt)}
        {record.settledAt !== undefined ? ` · settled: ${formatFull(record.settledAt)}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 10px', marginTop: 8 }}>
        {stepCell('1 · 问题', record.question)}
        {stepCell('2 · 分析', record.analyse)}
        {stepCell('3 · 工具调用', record.calls.length === 0 ? '' : callsBox(record.calls))}
        {stepCell('4 · 结果', record.results.length === 0 ? '' : resultsBox(record.results))}
        {stepCell('5 · 答案', record.answer ?? '')}
      </div>
    </div>
  )
}

/* ── Records tab ───────────────────────────────────────────────────────────── */

export function RecordsTab(): React.JSX.Element {
  const [response, setResponse] = useState<RecordsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
  }, [])

  if (failed && response === null) {
    return (
      <div style={rowStyle}>
        <span style={{ color: '#8b93a5' }}>
          No records detected yet — the records endpoint is not responding; the panel keeps retrying automatically. If you just updated the plugin, the host process may need a restart.
        </span>
      </div>
    )
  }

  const records = (response?.records ?? []).slice(0, DISPLAY_MAX_RECORDS)
  const openRecords = response?.open ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#8b93a5' }}>
        Settled records of the five-step process across all sessions — stored on disk, refreshed automatically.
      </div>
      {records.length === 0 && openRecords.length === 0 ? (
        <div style={rowStyle}>
          <span style={{ color: '#8b93a5' }}>No ElectroLab records yet — ask the agent for a calculation.</span>
        </div>
      ) : (
        <>
          {openRecords.map((run) => (
            <div
              key={`open:${run.id}`}
              style={{ ...rowStyle, cursor: 'pointer' }}
              onClick={() => setExpandedId(expandedId === `open:${run.id}` ? null : `open:${run.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#e8b34b', fontWeight: 600 }}>● in progress</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#c8ccd4', fontWeight: 600 }}>
                {run.question || run.id}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#c8ccd4' }}>
                {run.calls.length} tool call(s) · started {formatTime(run.startedAt)}
              </div>
              {toolChips(run.calls)}
              {expandedId === `open:${run.id}` && detailGrid({ ...run, answer: '' })}
            </div>
          ))}
          {records.map((run) => (
            <div
              key={run.id}
              style={{ ...rowStyle, cursor: 'pointer' }}
              onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#c8ccd4', fontSize: 12, fontWeight: 600 }}>
                  {run.question || `record ${run.id}`}
                </span>
                <span style={{ color: '#8b93a5', fontSize: 11, flex: 'none' }}>
                  {formatTime(run.startedAt)} – {formatTime(run.settledAt)}
                </span>
              </div>
              {run.error !== undefined && (
                <div style={{ marginTop: 4, color: '#e08a8a', font: '11px ui-monospace, monospace' }}>
                  ✗ {run.error.type}
                  {run.error.message.length > 0 ? ` — ${run.error.message}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#8b93a5', fontSize: 11 }}>
                  {run.calls.length} tool call(s)
                  {run.results.some((result) => result.error !== undefined) ? `, ${run.results.filter((result) => result.error !== undefined).length} error(s)` : ''}
                </span>
              </div>
              {toolChips(run.calls)}
              {expandedId === run.id && detailGrid(run)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
