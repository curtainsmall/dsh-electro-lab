/**
 * ElectroLab panel tabs: settled run records and panel configs.
 *
 * Records come from the host `electro-lab` session projection: the client
 * session list carries per-session projection values (seeded by the history
 * tail and updated live by `session/projection` frames), so the panel reads
 * them through the sessions service snapshot — no extra RPC channel.
 */
import { useSyncExternalStore } from 'react'

/* ── Records data shapes (mirror of the host projection value) ─────────────── */

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
  question?: string
  questionInputs: string[]
  answerTexts: string[]
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
}

interface ProjectionValue {
  runs: SettledRun[]
  open: OpenRun | null
}

/** Loose shape of the session-list state the sessions service provides. */
export interface SessionListLike {
  byId?: Record<string, {
    displayTitle?: string
    projectionValues?: Record<string, unknown>
  }>
}

/** Minimal observable snapshot face (the sessions service list satisfies it). */
export interface SnapshotLike<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

const NOOP_SUBSCRIBE = (): (() => void) => () => {}
const EMPTY_LIST: SessionListLike = {}
const EMPTY_GET = (): SessionListLike => EMPTY_LIST

/* ── Display defaults (a future config tab will make these editable) ───────── */

const DISPLAY_MAX_RECORDS = 20
const DISPLAY_SHOW_OPEN_RUN = true

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

/* ── Records tab ───────────────────────────────────────────────────────────── */

export function RecordsTab(props: { store?: SnapshotLike<SessionListLike> }): React.JSX.Element {
  const list = useSyncExternalStore(
    props.store?.subscribe ?? NOOP_SUBSCRIBE,
    props.store?.getSnapshot ?? EMPTY_GET,
  )

  const entries: Array<{ sessionId: string; title: string; value: ProjectionValue }> = []
  for (const [sessionId, summary] of Object.entries(list.byId ?? {})) {
    const value = summary.projectionValues?.['electro-lab']
    if (value !== undefined) entries.push({ sessionId, title: summary.displayTitle ?? sessionId, value: value as ProjectionValue })
  }

  const runs = entries
    .flatMap((entry) => entry.value.runs.map((run) => ({ ...run, sessionId: entry.sessionId, sessionTitle: entry.title })))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, DISPLAY_MAX_RECORDS)
  const openRuns = DISPLAY_SHOW_OPEN_RUN
    ? entries.filter((entry) => entry.value.open !== null)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#8b93a5' }}>
        Settled runs of the five-step process — electro-lab tool calls grouped per session.
      </div>
      {runs.length === 0 && openRuns.length === 0 ? (
        <div style={rowStyle}>
          <span style={{ color: '#8b93a5' }}>No electro-lab runs recorded yet — ask the agent for a calculation.</span>
        </div>
      ) : (
        <>
          {openRuns.map((entry) => (
            <div key={`open:${entry.sessionId}`} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#e8b34b', fontWeight: 600 }}>● in progress</span>
                <span style={{ color: '#8b93a5', fontSize: 11 }}>{entry.title}</span>
              </div>
              {entry.value.open !== null && (
                <>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#c8ccd4' }}>
                    {entry.value.open.toolCalls} tool call(s)
                    {entry.value.open.errors > 0 ? `, ${entry.value.open.errors} error(s)` : ''}
                    {' · started '}
                    {formatTime(entry.value.open.startedAt)}
                  </div>
                  {toolChips(entry.value.open.tools)}
                  {answerBox(entry.value.open.answerTexts)}
                </>
              )}
            </div>
          ))}
          {runs.map((run) => (
            <div key={run.id} style={rowStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#c8ccd4', fontSize: 12, fontWeight: 600 }}>
                  {run.question ?? run.questionInputs[0] ?? `run ${run.id}`}
                </span>
                <span style={{ color: '#8b93a5', fontSize: 11, flex: 'none' }}>
                  {run.sessionTitle} · {formatTime(run.startedAt)} – {formatTime(run.settledAt)}
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
              {answerBox(run.answerTexts)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
