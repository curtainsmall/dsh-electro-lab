/**
 * ElectroLab External tools tab: one page with every external tool
 * declaration (external-tools.jsonl), read through the
 * `/api/dsh-electro-lab/external-tools` endpoint and polled while the tab
 * is open. Declarations are edited through a guided form (add/edit dialog)
 * or through the LLM manager tools (external_tool_add/update/delete); both
 * paths only register the tools at the next host restart, so the dirty bit
 * returned by the endpoint drives the pending-restart banner. Saving a
 * declaration IS the authorization for its transport — the form shows the
 * reach of http/file transports in warning text before the save button.
 *
 * The form covers the whole declaration language except fields that are
 * preserved verbatim on edit (returns, headers) or unrepresentable in the
 * row editor (e.g. nested array items) — those are kept untouched and never
 * shown as raw JSON.
 */
import { useEffect, useState } from 'react'
import { t, useAppLocale } from './locales.ts'
import { Dialog, GhostButton, PrimaryButton } from './records.tsx'
import { QUANTITY_KIND_NAMES } from '../external-tool/types.ts'

/* ── Data shapes (mirror of the host declaration + endpoint) ──────────────── */

interface ExternalToolView {
  name: string
  description: string
  enabled: boolean
  transport: string
  transportOptions: Record<string, unknown>
  parameters: Record<string, unknown>
  returns?: unknown
  timeoutMs?: number
}

interface ExternalToolsResponse {
  tools: ExternalToolView[]
  restartRequired: boolean
}

const EXTERNAL_ENDPOINT = '/api/dsh-electro-lab/external-tools'
const POLL_MS = 5000

/** The transport target line: "http · GET <url>" or "file · <directory>". */
function transportLine(tool: ExternalToolView): string {
  const options = tool.transportOptions ?? {}
  if (tool.transport === 'http') {
    const method = typeof options.method === 'string' ? options.method : 'POST'
    const url = typeof options.url === 'string' ? options.url : ''
    return `http · ${method} ${url}`
  }
  if (tool.transport === 'file') {
    const directory = typeof options.directory === 'string' ? options.directory : ''
    return `file · ${directory}`
  }
  return tool.transport
}

/* ── Row chrome ───────────────────────────────────────────────────────────── */

const rowStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l2)',
}

const headerButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  background: 'none',
  border: '1px solid var(--dsw-alias-label-tertiary)',
  borderRadius: 6,
  cursor: 'pointer',
}

const codeFont: React.CSSProperties = {
  font: '11px ui-monospace, monospace',
  wordBreak: 'break-all',
}

/* ── The tab ──────────────────────────────────────────────────────────────── */

export function ExternalToolsTab(): React.JSX.Element {
  useAppLocale() // Re-render when the active language changes.
  const [response, setResponse] = useState<ExternalToolsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [editor, setEditor] = useState<{ tool: ExternalToolView | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExternalToolView | null>(null)
  const [actionError, setActionError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  // Pending changes show their banner immediately after a save/delete
  // instead of waiting for the next poll.
  const [pendingRestart, setPendingRestart] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(EXTERNAL_ENDPOINT)
        if (!res.ok) throw new Error(`external-tools endpoint returned ${res.status}`)
        const body = (await res.json()) as ExternalToolsResponse
        if (!alive) return
        setResponse(body)
        setPendingRestart(body.restartRequired)
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

  if (failed && response === null) {
    return (
      <div style={rowStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('externalUnreachable')}</span>
      </div>
    )
  }

  const tools = response?.tools ?? []
  const restartRequired = pendingRestart || (response?.restartRequired ?? false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
          {t('tabExternal')} · {tools.length}
        </span>
        <PrimaryButton onClick={() => setEditor({ tool: null })}>{t('addExternalTool')}</PrimaryButton>
      </div>
      {restartRequired && (
        <div style={{ ...rowStyle, borderColor: 'var(--dsw-alias-state-warn-primary)', color: 'var(--dsw-alias-state-warn-primary)' }}>
          <span style={{ fontSize: 12 }}>{t('restartRequired')}</span>
        </div>
      )}
      {actionError.length > 0 && (
        <div style={{ ...rowStyle, borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' }}>
          <span style={{ fontSize: 12 }}>{actionError}</span>
        </div>
      )}
      {tools.length === 0 ? (
        <div style={rowStyle}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('externalEmptyHint')}</span>
        </div>
      ) : (
        tools.map((tool) => (
          <div key={tool.name} style={rowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--dsw-alias-label-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {tool.name}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...tool, enabled: !tool.enabled }
                    setActionError('')
                    void saveDeclaration(
                      next,
                      () => { setPendingRestart(true); setRefreshTick((tick) => tick + 1) },
                      (message) => setActionError(t('saveFailed', { message })),
                    )
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: 12,
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: tool.enabled ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)',
                    background: tool.enabled ? 'var(--dsw-alias-interactive-bg-active)' : 'none',
                    color: tool.enabled ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {tool.enabled ? t('enabled') : t('disabled')}
                </button>
                <button type="button" style={headerButtonStyle} onClick={() => setEditor({ tool })}>
                  {t('editTool')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(tool)}
                  style={{ ...headerButtonStyle, color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' }}
                >
                  {t('deleteTool')}
                </button>
              </span>
            </div>
            <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>{tool.description}</div>
            <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-tertiary)', ...codeFont }}>{transportLine(tool)}</div>
          </div>
        ))
      )}
      <EditorDialog editor={editor} onClose={() => setEditor(null)} onSaved={() => { setPendingRestart(true); setEditor(null); setRefreshTick((tick) => tick + 1) }} />
      <Dialog
        open={deleteTarget !== null}
        title={deleteTarget === null ? '' : t('deleteToolTitle', { name: deleteTarget.name })}
        width={360}
        onClose={() => setDeleteTarget(null)}
        footer={deleteTarget === null ? undefined : [
          <GhostButton key="cancel" onClick={() => setDeleteTarget(null)}>{t('cancel')}</GhostButton>,
          <button
            key="delete"
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
              void (async () => {
                try {
                  const res = await fetch(`${EXTERNAL_ENDPOINT}?name=${encodeURIComponent(target.name)}`, { method: 'DELETE' })
                  if (res.ok) {
                    const body = (await res.json()) as { restartRequired?: boolean }
                    setPendingRestart(body.restartRequired ?? true)
                    setRefreshTick((tick) => tick + 1)
                  }
                } catch {
                  // The poll retries; nothing else to do.
                }
              })()
            }}
          >
            {t('delete')}
          </button>,
        ]}
      >
        <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('irreversible')}</div>
      </Dialog>
    </div>
  )
}

/** Save one declaration through the endpoint; `onSaved` runs on success, `onError` on a server-reported failure. */
async function saveDeclaration(
  tool: unknown,
  onSaved: () => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const encoded = btoa(JSON.stringify(tool)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const res = await fetch(`${EXTERNAL_ENDPOINT}?config=${encodeURIComponent(encoded)}`, { method: 'PUT' })
    if (!res.ok) {
      let message = `http ${res.status}`
      try {
        const body = (await res.json()) as { error?: string }
        if (typeof body.error === 'string' && body.error.length > 0) message = body.error
      } catch {
        // keep the status message
      }
      onError(message)
      return
    }
    onSaved()
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error))
  }
}

/* ── Guided add/edit form ─────────────────────────────────────────────────── */

/** Tool name rule (mirror of the host registry): lowercase start, a-z0-9_. */
const NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

type ParamRowType = 'quantity' | 'string' | 'boolean' | 'array'
type SimpleRowType = 'quantity' | 'string' | 'boolean'

/** One editable parameter row; array rows edit one level of homogeneous items. */
interface ParamRow {
  id: number
  name: string
  type: ParamRowType
  /** Quantity kind name (quantity rows and array-of-quantity rows). */
  kind: string
  itemType: SimpleRowType
  itemKind: string
  /** String rows: the enum entries, comma-separated in the input. */
  enumText: string
  description: string
  required: boolean
}

interface FormState {
  name: string
  description: string
  enabled: boolean
  transport: 'http' | 'file'
  url: string
  method: 'GET' | 'POST'
  directory: string
  pollMs: string
  inPrefix: string
  outPrefix: string
  timeoutMs: string
  rows: ParamRow[]
  /** Parameter names preserved verbatim (the row editor cannot model them). */
  unmodeled: string[]
}

/** Parse one parameter spec into an editable row; undefined = keep verbatim. */
function parseParamRow(name: string, spec: unknown, id: number): ParamRow | undefined {
  if (typeof spec !== 'object' || spec === null) return undefined
  const s = spec as Record<string, unknown>
  const description = typeof s.description === 'string' ? s.description : ''
  const required = s.required === true
  const base = { id, name, kind: 'none', itemType: 'quantity' as SimpleRowType, itemKind: 'none', enumText: '', description, required }
  switch (s.type) {
    case 'quantity': {
      if (typeof s.kind !== 'string' || !QUANTITY_KIND_NAMES.includes(s.kind)) return undefined
      return { ...base, type: 'quantity', kind: s.kind }
    }
    case 'string': {
      if (s.enum !== undefined && (!Array.isArray(s.enum) || s.enum.some((item) => typeof item !== 'string'))) return undefined
      const enumText = Array.isArray(s.enum) ? (s.enum as string[]).join(', ') : ''
      return { ...base, type: 'string', enumText }
    }
    case 'boolean':
      return { ...base, type: 'boolean' }
    case 'array': {
      // One level of homogeneous items: quantity (with a known kind), plain
      // string or boolean. Anything deeper is preserved verbatim instead.
      if (typeof s.items !== 'object' || s.items === null) return undefined
      const items = s.items as Record<string, unknown>
      if (items.type === 'quantity') {
        if (typeof items.kind !== 'string' || !QUANTITY_KIND_NAMES.includes(items.kind)) return undefined
        return { ...base, type: 'array', itemType: 'quantity', itemKind: items.kind }
      }
      if (items.type === 'string' && items.enum === undefined) return { ...base, type: 'array', itemType: 'string' }
      if (items.type === 'boolean') return { ...base, type: 'array', itemType: 'boolean' }
      return undefined
    }
    default:
      return undefined
  }
}

/** Build the spec JSON of one editable row. */
function buildParamSpec(row: ParamRow): Record<string, unknown> {
  const spec: Record<string, unknown> = {}
  switch (row.type) {
    case 'quantity':
      spec.type = 'quantity'
      spec.kind = row.kind
      break
    case 'string':
      spec.type = 'string'
      {
        const entries = row.enumText.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
        if (entries.length > 0) spec.enum = entries
      }
      break
    case 'boolean':
      spec.type = 'boolean'
      break
    case 'array': {
      spec.type = 'array'
      const items: Record<string, unknown> = { type: row.itemType }
      if (row.itemType === 'quantity') items.kind = row.itemKind
      spec.items = items
      break
    }
  }
  const description = row.description.trim()
  if (description.length > 0) spec.description = description
  if (row.required) spec.required = true
  return spec
}

/** Seed the form from a declaration (or defaults for a new tool). */
function seedForm(tool: ExternalToolView | null): FormState {
  const options = (tool?.transportOptions ?? {}) as Record<string, unknown>
  const rows: ParamRow[] = []
  const unmodeled: string[] = []
  for (const [key, spec] of Object.entries(tool?.parameters ?? {})) {
    const row = parseParamRow(key, spec, rows.length)
    if (row !== undefined) rows.push(row)
    else unmodeled.push(key)
  }
  const readString = (key: string): string => (typeof options[key] === 'string' ? String(options[key]) : '')
  const readMs = (key: string): string => (typeof options[key] === 'number' ? String(options[key]) : '')
  return {
    name: tool?.name ?? '',
    description: tool?.description ?? '',
    // A declaration without the flag is enabled (registration default).
    enabled: tool?.enabled !== false,
    transport: tool?.transport === 'file' ? 'file' : 'http',
    url: readString('url'),
    method: tool?.transport === 'http' && options.method === 'GET' ? 'GET' : 'POST',
    directory: readString('directory'),
    pollMs: readMs('pollMs'),
    inPrefix: readString('inPrefix'),
    outPrefix: readString('outPrefix'),
    timeoutMs: typeof tool?.timeoutMs === 'number' ? String(tool.timeoutMs) : '',
    rows,
    unmodeled,
  }
}

/** Parse one positive integer option field; empty = absent, non-numeric/≤0 = NaN. */
function parsePositive(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : Number.NaN
}

/** Rebuild the declaration JSON from the form; unknown fields survive edits. */
function buildConfig(state: FormState, original: ExternalToolView | null): unknown {
  const base: Record<string, unknown> = original !== null ? { ...original } : {}
  delete base.parameters
  delete base.transport
  delete base.transportOptions
  delete base.timeoutMs
  const config: Record<string, unknown> = { ...base, name: state.name.trim(), description: state.description.trim(), enabled: state.enabled }

  const timeout = parsePositive(state.timeoutMs)
  if (timeout !== undefined && Number.isNaN(timeout)) config.timeoutMs = state.timeoutMs // keeps raw text; validation blocks the save
  else if (timeout !== undefined) config.timeoutMs = timeout
  else delete config.timeoutMs

  const options = (original?.transportOptions ?? {}) as Record<string, unknown>
  if (state.transport === 'http') {
    config.transport = 'http'
    const wasHttp = original?.transport === 'http' && typeof options === 'object'
    config.transportOptions = {
      ...(wasHttp ? options : {}),
      url: state.url.trim(),
      method: state.method,
    }
  } else {
    config.transport = 'file'
    const wasFile = original?.transport === 'file' && typeof options === 'object'
    const fileOptions: Record<string, unknown> = { ...(wasFile ? options : {}), directory: state.directory.trim() }
    const pollMs = parsePositive(state.pollMs)
    if (pollMs !== undefined && Number.isNaN(pollMs)) fileOptions.pollMs = state.pollMs // keeps raw text; validation blocks the save
    else if (pollMs !== undefined) fileOptions.pollMs = pollMs
    else delete fileOptions.pollMs
    for (const [key, text] of [['inPrefix', state.inPrefix], ['outPrefix', state.outPrefix]] as const) {
      const value = text.trim()
      if (value.length === 0) delete fileOptions[key]
      else fileOptions[key] = value
    }
    config.transportOptions = fileOptions
  }

  const parameters: Record<string, unknown> = {}
  for (const key of state.unmodeled) {
    const spec = (original?.parameters ?? {})[key]
    if (spec !== undefined) parameters[key] = spec
  }
  for (const row of state.rows) parameters[row.name.trim()] = buildParamSpec(row)
  config.parameters = parameters
  return config
}

/** Client-side checks (the host re-validates on save); returns translated messages. */
function validateForm(state: FormState): string[] {
  const errors: string[] = []
  if (!NAME_PATTERN.test(state.name.trim())) errors.push(t('invalidName'))
  if (state.transport === 'http') {
    if (!/^https?:\/\/.+/.test(state.url.trim())) errors.push(t('urlRequired'))
  } else if (state.directory.trim().length === 0) {
    errors.push(t('fileDirectoryRequired'))
  }
  const numberFields: Array<[keyof FormState, string]> = [
    ['timeoutMs', t('timeoutLabel')],
    ['pollMs', t('pollMsLabel')],
  ]
  for (const [key, label] of numberFields) {
    const text = String(state[key])
    if (text.trim().length === 0) continue
    const parsed = parsePositive(text)
    if (parsed !== undefined && Number.isNaN(parsed)) errors.push(t('positiveNumberRequired', { label }))
  }
  const seen = new Set<string>()
  for (const row of state.rows) {
    const name = row.name.trim()
    if (!NAME_PATTERN.test(name)) errors.push(t('invalidParamName', { name }))
    else if (seen.has(name)) errors.push(t('duplicateParamName', { name }))
    else seen.add(name)
  }
  return errors
}

/* ── Dialog chrome ────────────────────────────────────────────────────────── */

const controlStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-specific-input-major)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  outline: 'none',
  minWidth: 0,
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-secondary)',
  whiteSpace: 'nowrap',
}

/** One labelled field: tiny label above the control, grows to fill its row. */
function Field({ label, style, children }: { label: string; style?: React.CSSProperties; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0, ...style }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

/** The add/edit dialog: a guided form — no raw JSON. */
function EditorDialog({ editor, onClose, onSaved }: {
  editor: { tool: ExternalToolView | null } | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element | null {
  useAppLocale()
  const [state, setState] = useState<FormState>(() => seedForm(null))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed the form whenever a different tool opens the dialog.
  useEffect(() => {
    if (editor !== null) {
      setState(seedForm(editor.tool))
      setError('')
      setSaving(false)
    }
  }, [editor])

  if (editor === null) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }))
  }
  const setRow = (id: number, patch: Partial<ParamRow>): void => {
    setState((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) }))
  }
  const addRow = (): void => {
    const id = state.rows.reduce((max, row) => Math.max(max, row.id), -1) + 1
    set('rows', [...state.rows, { id, name: '', type: 'quantity', kind: 'none', itemType: 'quantity', itemKind: 'none', enumText: '', description: '', required: false }])
  }
  const removeRow = (id: number): void => {
    set('rows', state.rows.filter((row) => row.id !== id))
  }
  const isHttp = state.transport === 'http'

  const save = (): void => {
    const errors = validateForm(state)
    if (errors.length > 0) {
      setError(errors.join(' '))
      return
    }
    setSaving(true)
    setError('')
    void saveDeclaration(
      buildConfig(state, editor.tool),
      () => onSaved(),
      (message) => {
        setSaving(false)
        setError(t('saveFailed', { message }))
      },
    )
  }

  return (
    <Dialog
      open
      width={620}
      height={560}
      title={editor.tool === null ? t('addExternalTool') : t('editExternalTool')}
      onClose={() => { if (!saving) onClose() }}
      footer={[
        <GhostButton key="cancel" onClick={onClose}>{t('cancel')}</GhostButton>,
        <PrimaryButton key="save" disabled={saving} onClick={save}>{t('confirm')}</PrimaryButton>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Identity */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label={t('nameLabel')} style={{ flex: 1.4 }}>
            <input
              type="text"
              value={state.name}
              spellCheck={false}
              onChange={(event) => set('name', event.target.value)}
              style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }}
            />
          </Field>
          <Field label={t('transportLabel')} style={{ flex: 0.9 }}>
            <select value={state.transport} onChange={(event) => set('transport', event.target.value as 'http' | 'file')} style={controlStyle}>
              <option value="http">{t('transportHttp')}</option>
              <option value="file">{t('transportFile')}</option>
            </select>
          </Field>
          <Field label={t('timeoutLabel')} style={{ flex: 1 }}>
            <input type="text" inputMode="numeric" value={state.timeoutMs} onChange={(event) => set('timeoutMs', event.target.value)} style={controlStyle} />
          </Field>
        </div>
        <Field label={t('descriptionLabel')}>
          <input type="text" value={state.description} onChange={(event) => set('description', event.target.value)} style={controlStyle} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--dsw-alias-label-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={state.enabled} onChange={(event) => set('enabled', event.target.checked)} style={{ accentColor: 'var(--dsw-alias-state-business-primary)' }} />
          {t('enabledLabel')}
        </label>

        {/* Transport options */}
        {isHttp ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label={t('methodLabel')} style={{ flex: 0.7 }}>
              <select value={state.method} onChange={(event) => set('method', event.target.value as 'GET' | 'POST')} style={controlStyle}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </Field>
            <Field label={t('urlLabel')} style={{ flex: 2 }}>
              <input type="text" value={state.url} spellCheck={false} onChange={(event) => set('url', event.target.value)} style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }} />
            </Field>
          </div>
        ) : (
          <>
            <Field label={t('directoryLabel')}>
              <input type="text" value={state.directory} spellCheck={false} onChange={(event) => set('directory', event.target.value)} style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }} />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label={t('pollMsLabel')}>
                <input type="text" inputMode="numeric" value={state.pollMs} onChange={(event) => set('pollMs', event.target.value)} style={controlStyle} />
              </Field>
              <Field label={t('inPrefixLabel')}>
                <input type="text" value={state.inPrefix} spellCheck={false} onChange={(event) => set('inPrefix', event.target.value)} style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }} />
              </Field>
              <Field label={t('outPrefixLabel')}>
                <input type="text" value={state.outPrefix} spellCheck={false} onChange={(event) => set('outPrefix', event.target.value)} style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }} />
              </Field>
            </div>
          </>
        )}
        {isHttp && state.url.trim().length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>
            {t('warnHttp', { url: state.url.trim() })}
          </div>
        )}
        {!isHttp && state.directory.trim().length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>
            {t('warnFile', { directory: state.directory.trim() })}
          </div>
        )}

        {/* Parameters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }}>{t('parametersLabel')}</span>
          <GhostButton onClick={addRow}>{t('addParameter')}</GhostButton>
        </div>
        {state.rows.map((row) => (
          <div key={row.id} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Field label={t('paramTypeLabel')} style={{ flex: 0.8 }}>
                <select value={row.type} onChange={(event) => setRow(row.id, { type: event.target.value as ParamRowType })} style={controlStyle}>
                  <option value="quantity">quantity</option>
                  <option value="string">string</option>
                  <option value="boolean">boolean</option>
                  <option value="array">array</option>
                </select>
              </Field>
              <Field label={t('paramKindLabel')} style={{ flex: 1.2 }}>
                <select
                  value={row.type === 'array' ? row.itemKind : row.kind}
                  disabled={row.type !== 'quantity' && row.type !== 'array'}
                  onChange={(event) => setRow(row.id, row.type === 'array' ? { itemKind: event.target.value } : { kind: event.target.value })}
                  style={{ ...controlStyle, opacity: row.type !== 'quantity' && row.type !== 'array' ? 0.5 : 1 }}
                >
                  {QUANTITY_KIND_NAMES.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', paddingBottom: 6, flex: 'none' }}>
                <input type="checkbox" checked={row.required} onChange={(event) => setRow(row.id, { required: event.target.checked })} style={{ accentColor: 'var(--dsw-alias-state-business-primary)' }} />
                {t('paramRequiredLabel')}
              </label>
              <button
                type="button"
                aria-label={t('removeParameter')}
                title={t('removeParameter')}
                onClick={() => removeRow(row.id)}
                style={{ flex: 'none', border: 'none', background: 'none', color: 'var(--dsw-alias-state-error-primary)', cursor: 'pointer', fontSize: 14, padding: '2px 4px', marginBottom: 4 }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label={t('nameLabel')} style={{ flex: 1.2 }}>
                <input type="text" value={row.name} spellCheck={false} onChange={(event) => setRow(row.id, { name: event.target.value })} style={{ ...controlStyle, fontFamily: 'ui-monospace, monospace' }} />
              </Field>
              {row.type === 'array' && (
                <Field label={t('paramItemsLabel')} style={{ flex: 1 }}>
                  <select value={row.itemType} onChange={(event) => setRow(row.id, { itemType: event.target.value as SimpleRowType })} style={controlStyle}>
                    <option value="quantity">quantity</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                  </select>
                </Field>
              )}
              {row.type === 'string' && (
                <Field label={t('paramEnumLabel')} style={{ flex: 1.4 }}>
                  <input type="text" value={row.enumText} onChange={(event) => setRow(row.id, { enumText: event.target.value })} style={controlStyle} />
                </Field>
              )}
            </div>
            <Field label={t('paramDescriptionLabel')}>
              <input type="text" value={row.description} onChange={(event) => setRow(row.id, { description: event.target.value })} style={controlStyle} />
            </Field>
          </div>
        ))}
        {state.rows.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('parametersLabel')} —</div>
        )}
        {state.unmodeled.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }}>
            {t('unmodeledParams', { count: state.unmodeled.length })} {state.unmodeled.join(', ')}
          </div>
        )}
        {error.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>{error}</div>
        )}
      </div>
    </Dialog>
  )
}
