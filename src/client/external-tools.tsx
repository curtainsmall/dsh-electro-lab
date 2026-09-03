/**
 * ElectroLab External tools tab: one page with every external tool
 * declaration (external-tools.jsonl), read through the
 * `/api/dsh-electro-lab/external-tools` endpoint and polled while the tab
 * is open. Declarations are edited here or through the LLM manager tools
 * (external_tool_add/update/delete); both paths only register the tools at
 * the next host restart, so the dirty bit returned by the endpoint drives
 * the pending-restart banner. Saving a declaration IS the authorization for
 * its transport — the editor shows the reach of http/file transports in
 * warning text before the save button.
 */
import { useEffect, useState } from 'react'
import { t, useAppLocale } from './locales.ts'
import { Dialog, GhostButton, PrimaryButton } from './records.tsx'

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

/** Pretty JSON text of one declaration (or a fallback for malformed tools). */
function declarationText(tool: ExternalToolView | null): string {
  return JSON.stringify(tool ?? {}, null, 2)
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

/* ── Add / edit editor dialog ─────────────────────────────────────────────── */

const editorInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 260,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-specific-input-major)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'ui-monospace, monospace',
  resize: 'vertical',
  whiteSpace: 'pre',
}

/** The add/edit dialog: a JSON declaration textarea with live warnings. */
function EditorDialog({ editor, onClose, onSaved }: {
  editor: { tool: ExternalToolView | null } | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element | null {
  useAppLocale()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed the editor text whenever a different tool opens the dialog.
  useEffect(() => {
    if (editor !== null) {
      setText(declarationText(editor.tool))
      setError('')
      setSaving(false)
    }
  }, [editor])

  if (editor === null) return null

  // Live parse for the transport-reach warnings (the save re-validates fully).
  let parsed: unknown
  let parseError = ''
  try {
    parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parsed = undefined
      parseError = t('declarationNotObject')
    }
  } catch {
    parseError = t('declarationInvalid')
  }
  const config = parsed as { transport?: unknown; transportOptions?: Record<string, unknown> } | undefined
  const isHttp = config?.transport === 'http'
  const isFile = config?.transport === 'file'
  const httpUrl = isHttp && typeof config?.transportOptions?.url === 'string' ? config.transportOptions.url : ''
  const fileDirectory = isFile && typeof config?.transportOptions?.directory === 'string' ? config.transportOptions.directory : ''

  return (
    <Dialog
      open
      width={560}
      height={480}
      title={editor.tool === null ? t('addExternalTool') : t('editExternalTool')}
      onClose={() => { if (!saving) onClose() }}
      footer={[
        <GhostButton key="cancel" onClick={onClose}>{t('cancel')}</GhostButton>,
        <PrimaryButton
          key="save"
          disabled={saving}
          onClick={() => {
            let declaration: unknown
            try {
              declaration = JSON.parse(text)
              if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) {
                setError(t('declarationNotObject'))
                return
              }
            } catch {
              setError(t('declarationInvalid'))
              return
            }
            setSaving(true)
            setError('')
            void saveDeclaration(
              declaration,
              () => onSaved(),
              (message) => {
                setSaving(false)
                setError(t('saveFailed', { message }))
              },
            )
          }}
        >
          {t('confirm')}
        </PrimaryButton>,
      ]}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>{t('declarationLabel')}</div>
      <textarea
        aria-label={t('declarationLabel')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        style={editorInputStyle}
      />
      {isHttp && httpUrl.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>
          {t('warnHttp', { url: httpUrl })}
        </div>
      )}
      {isFile && fileDirectory.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>
          {t('warnFile', { directory: fileDirectory })}
        </div>
      )}
      {parseError.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>{parseError}</div>
      )}
      {error.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 }}>{error}</div>
      )}
    </Dialog>
  )
}
