/**
 * ElectroLab record list page + shared UI components.
 * The list reads the host's /records-index (a projection of record-index.jsonl); a record body is a process
 * (timeline), whose review form is left for later design — the list does not open bodies.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { t, useAppLocale } from './locales.ts'

/* ── Shared dialog shell + buttons ───────────────────────────────────────── */

/** Shared modal: mask, themed panel, title (optionally with right-side content), body, footer. */
export function Dialog({ open, title, width = 400, height, dismissible = true, headerRight, footer, children, onClose }: {
  open: boolean
  title: string
  width?: number
  /** Fixed panel height: content scrolls within the body. */
  height?: number
  dismissible?: boolean
  headerRight?: ReactNode
  footer?: ReactNode
  children: ReactNode
  onClose: () => void
}): React.JSX.Element | null {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dsw-alias-bg-mask-1)',
        pointerEvents: 'auto',
      }}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 48px)',
          ...(height === undefined ? {} : { height }),
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--dsw-alias-bg-layer-2)',
          border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 10,
          padding: 16,
          boxShadow: 'var(--dsw-shadow-lv3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          {headerRight}
        </div>
        <div style={{ marginTop: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>{children}</div>
        {footer !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flex: 'none' }}>{footer}</div>
        )}
      </div>
    </div>
  )
}

function ghostButtonStyle(hovered: boolean): React.CSSProperties {
  return {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-label-tertiary)',
    borderColor: hovered ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
    background: hovered ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
    color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
    fontSize: 13,
  }
}

function primaryButtonStyle(hovered: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-button-info-fill)',
    background: hovered && !disabled ? 'var(--dsw-alias-button-info-hover)' : 'var(--dsw-alias-button-info-fill)',
    color: 'var(--dsw-alias-label-primary-foreground)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    opacity: disabled ? 0.45 : 1,
  }
}

/** Ghost button (secondary action). */
export function GhostButton({ children, onClick, style }: { children: ReactNode; onClick: () => void; style?: React.CSSProperties }): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      style={{ ...ghostButtonStyle(hovered), ...style }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  )
}

/** Primary button (primary action). */
export function PrimaryButton({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      style={primaryButtonStyle(hovered, disabled)}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  )
}

/* ── record list ─────────────────────────────────────────────────────────── */

/** Index-row mirror (one line of record-index.jsonl). */
interface IndexRow {
  id: string
  openedAt: number
  sealedAt: number | null
  question: string
}

const INDEX_ENDPOINT = '/api/dsh-electro-lab/records-index'
const POLL_MS = 5000

const rowStyle: React.CSSProperties = {
  padding: '10px 12px',
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

/** Record list page: render from the index (title = question); unsealed rows are marked incomplete; polls every 5s. */
export function RecordsTab(): React.JSX.Element {
  useAppLocale()
  const [rows, setRows] = useState<IndexRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(INDEX_ENDPOINT)
        if (!res.ok) throw new Error(`records-index endpoint returned ${res.status}`)
        const body = (await res.json()) as { rows: IndexRow[] }
        if (!alive) return
        setRows(body.rows)
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

  if (failed && rows === null) {
    return (
      <div style={rowStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('unreachable')}</span>
      </div>
    )
  }

  const items = rows ?? []
  if (items.length === 0) {
    return (
      <div style={rowStyle}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('emptyHint')}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((row) => (
        <div key={row.id} style={rowStyle}>
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
              {row.question || row.id}
            </span>
            {row.sealedAt === null && (
              <span
                style={{
                  padding: '1px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  border: '1px solid var(--dsw-alias-state-warn-primary)',
                  color: 'var(--dsw-alias-state-warn-primary)',
                  flex: 'none',
                }}
              >
                {t('incomplete')}
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
            {formatTime(row.openedAt)}
          </div>
        </div>
      ))}
    </div>
  )
}
