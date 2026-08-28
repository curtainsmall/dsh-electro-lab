/**
 * ElectroLab Records tab: one page with every settled run across all
 * sessions, read from the plugin's own disk-backed store through the
 * `/api/dsh-electro-lab/records` endpoint and polled while the panel is open.
 * Records are plugin-owned: they survive session deletion and restarts.
 */
import { useEffect, useState } from 'react'

/* ── Records data shapes (mirror of the host store + endpoint) ─────────────── */

interface ToolUsage {
  name: string
  calls: number
}

interface SettledRun {
  id: string
  startedAt: number
  settledAt: number
  toolCalls: number
  errors: number
  tools: ToolUsage[]
  questionInputs: string[]
  answerTexts: string[]
  results: string[]
}

interface OpenRun {
  id: string
  startedAt: number
  lastAt: number
  toolCalls: number
  errors: number
  tools: ToolUsage[]
  questionInputs: string[]
  answerTexts: string[]
  results: string[]
}

interface StoredRecord {
  run: SettledRun
}

interface RecordsResponse {
  records: StoredRecord[]
  open: OpenRun[]
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

function toolChips(tools: ToolUsage[]): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {tools.map((tool) => (
        <span
          key={tool.name}
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background: '#1c2b22',
            border: '1px solid #2c4a3a',
            color: '#7fbf9a',
            font: '11px ui-monospace, monospace',
          }}
        >
          {tool.name}×{tool.calls}
        </span>
      ))}
    </div>
  )
}

/** The five-step answer texts, in a scrollable box. */
function answerBox(texts: string[]): React.JSX.Element | null {
  if (texts.length === 0) return null
  return (
    <div
      style={{
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
      }}
    >
      {texts.join('\n\n')}
    </div>
  )
}

/** The exact tool outputs, in a monospace box above the answer. */
function resultBox(texts: string[]): React.JSX.Element | null {
  if (texts.length === 0) return null
  return (
    <div
      style={{
        marginTop: 6,
        maxHeight: 120,
        overflow: 'auto',
        padding: '6px 8px',
        background: '#0a0d12',
        borderRadius: 4,
        border: '1px solid #1e2530',
        color: '#9fc3ae',
        font: '11px/1.6 ui-monospace, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {texts.join('\n\n')}
    </div>
  )
}

/* ── Records tab ───────────────────────────────────────────────────────────── */

export function RecordsTab(): React.JSX.Element {
  const [response, setResponse] = useState<RecordsResponse | null>(null)
  const [failed, setFailed] = useState(false)

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
        <span style={{ color: '#e08a8a' }}>Records unavailable — the host endpoint is not reachable.</span>
      </div>
    )
  }

  const records = (response?.records ?? []).slice(0, DISPLAY_MAX_RECORDS)
  const openRuns = response?.open ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#8b93a5' }}>
        Settled runs of the five-step process across all sessions — stored on disk, refreshed automatically.
      </div>
      {records.length === 0 && openRuns.length === 0 ? (
        <div style={rowStyle}>
          <span style={{ color: '#8b93a5' }}>No electro-lab runs recorded yet — ask the agent for a calculation.</span>
        </div>
      ) : (
        <>
          {openRuns.map((run) => (
            <div key={`open:${run.id}`} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#e8b34b', fontWeight: 600 }}>● in progress</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#c8ccd4' }}>
                {run.questionInputs[0] ?? run.id}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#c8ccd4' }}>
                {run.toolCalls} tool call(s)
                {run.errors > 0 ? `, ${run.errors} error(s)` : ''}
                {' · started '}
                {formatTime(run.startedAt)}
              </div>
              {toolChips(run.tools)}
              {resultBox(run.results)}
            </div>
          ))}
          {records.map((record) => {
            const run = record.run
            return (
              <div key={run.id} style={rowStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#c8ccd4', fontSize: 12, fontWeight: 600 }}>
                    {run.questionInputs[0] ?? `run ${run.id}`}
                  </span>
                  <span style={{ color: '#8b93a5', fontSize: 11, flex: 'none' }}>
                    {formatTime(run.startedAt)} – {formatTime(run.settledAt)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#8b93a5', fontSize: 11 }}>
                    {run.toolCalls} tool call(s)
                    {run.errors > 0 ? `, ${run.errors} error(s)` : ''}
                  </span>
                  {run.questionInputs.length > 1 && (
                    <span style={{ color: '#8b93a5', fontSize: 11, fontStyle: 'italic' }}>
                      {run.questionInputs.length} inputs
                    </span>
                  )}
                </div>
                {toolChips(run.tools)}
                {resultBox(run.results)}
                {answerBox(run.answerTexts)}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
