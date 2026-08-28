/**
 * ElectroLab panel: SSH-style main-area panel with settled run records.
 *
 * The product has no seat for a center-column takeover panel (the
 * conversation slot is single-occupant and external plugins cannot declare
 * slots), so — exactly like the SSH/task-board panels — the view mounts as a
 * container appended inside the center column at the DOM level, positioned
 * absolute over the conversation content, toggled by a data attribute on
 * <html>. The nav entry is a slot registration instead: `sidebar.footer.action`
 * (the additive seat beside Settings), which keeps the button in the same
 * sidebar-foot family as the SSH/task icons without DOM surgery.
 */
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { RecordsTab, type SessionListLike } from './records.tsx'

/** Tiny shared store: open state + subscription for the nav button and the panel. */
const panelStore = {
  open: false,
  listeners: new Set<() => void>(),
  toggle(): void {
    this.open = !this.open
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
}

/* ── Panel mount (SSH-style center-column takeover) ────────────────────────── */

const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'
const ACTIVE_ATTR = 'data-dsh-electrolab-active'
/** Cross-plugin panel activation event (the SSH/task-board panels share it). */
const ACTIVATE_EVENT = 'dsh-panel-activate'
const PANEL_NAME = 'electrolab'
/** Sidebar rows whose click returns the user to the session. */
const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'

/** Minimal observable snapshot face (the sessions service list satisfies it). */
export interface SnapshotLike<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

const NOOP_SUBSCRIBE = (): (() => void) => () => {}
const EMPTY_LIST: SessionListLike = {}
const EMPTY_GET = (): SessionListLike => EMPTY_LIST

/**
 * Mount the panel inside the center column and wire open-state side effects:
 * the active attribute on <html>, cross-panel mutual exclusion, and closing
 * when the user picks another sidebar row. Returns one disposer that removes
 * the DOM, the React root and every listener.
 */
export function mountElectroLabPanel(ctx: { get(name: string): unknown }): () => void {
  const sessions = ctx.get('sessions') as { list?: SnapshotLike<SessionListLike> } | undefined
  const store: SnapshotLike<SessionListLike> = sessions?.list ?? { getSnapshot: EMPTY_GET, subscribe: NOOP_SUBSCRIBE }

  const container = document.createElement('div')
  container.dataset.dshElectrolabView = ''
  const style = document.createElement('style')
  style.textContent = `
    [data-pane="conversation"], [class*="centerCol"] { position: relative; }
    [data-dsh-electrolab-view] { position: absolute; inset: 0; z-index: 40;
      background: var(--dsw-alias-bg-base, #171a21); overflow: auto; }
  `
  document.head.appendChild(style)

  let root: ReturnType<typeof createRoot> | undefined
  const tryPlace = (): void => {
    if (container.isConnected) return
    const column = document.querySelector(CONVERSATION_COLUMN_SELECTOR)
    if (column === null) return
    column.appendChild(container)
    root ??= createRoot(container)
    root.render(<ElectroLabPanel store={store} />)
  }
  const waitObserver = new MutationObserver(tryPlace)
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    if (panelStore.open) {
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }
  const onOtherActivate = (event: Event): void => {
    if ((event as CustomEvent<string>).detail !== PANEL_NAME && panelStore.open) panelStore.toggle()
  }
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!panelStore.open) return
    const target = event.target as Element | null
    if (target !== null && target.closest(SIDEBAR_ROW_SELECTOR) !== null) panelStore.toggle()
  }
  const unsubscribeActive = panelStore.subscribe(applyActive)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  document.addEventListener('click', onClickSidebarRow, true)

  applyActive()
  tryPlace()

  return () => {
    waitObserver.disconnect()
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
    document.removeEventListener('click', onClickSidebarRow, true)
    unsubscribeActive()
    style.remove()
    root?.unmount()
    container.remove()
  }
}

/* ── Nav entry (sidebar foot, beside Settings) ─────────────────────────────── */

/** The sidebar-foot nav button that toggles the panel. */
export function SidebarNavButton(_props: Record<string, unknown>): React.JSX.Element {
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  return (
    <button
      type="button"
      onClick={() => panelStore.toggle()}
      title="ElectroLab"
      aria-label="ElectroLab"
      aria-expanded={open}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        display: 'flex',
        alignItems: 'center',
        color: open ? '#e8b34b' : '#8b93a5',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
      </svg>
    </button>
  )
}

/* ── Panel chrome (SSH-style: back-to-session title bar, tabs, content) ────── */

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderBottom: '1px solid #2a2f3a',
  background: 'var(--dsw-specific-sidebar-fill, #171a21)',
}

const backButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#c8ccd4',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '8px 14px 0',
  borderBottom: '1px solid #2a2f3a',
  background: 'var(--dsw-specific-sidebar-fill, #171a21)',
}

/** The panel body: title bar with a back-to-session button, tabs, content. */
export function ElectroLabPanel(props: { store: SnapshotLike<SessionListLike> }): React.JSX.Element | null {
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  const [tab, setTab] = useState<'config' | 'records'>('records')

  if (!open) return null

  const tabButton = (key: 'config' | 'records', label: string): React.JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      style={{
        padding: '5px 12px',
        border: 'none',
        borderBottom: tab === key ? '2px solid #e8b34b' : '2px solid transparent',
        background: 'none',
        color: tab === key ? '#e8b34b' : '#c8ccd4',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#e6e8ec',
        font: '13px/1.5 ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={headerStyle}>
        <button
          type="button"
          aria-label="Back to session"
          onClick={() => panelStore.toggle()}
          style={backButtonStyle}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
          <span>Back to session</span>
        </button>
        <h2 style={{ margin: 0, fontSize: 15 }}>ElectroLab</h2>
      </div>
      <div role="tablist" style={tabBarStyle}>
        {tabButton('config', 'Config')}
        {tabButton('records', 'Records')}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {tab === 'records' ? <RecordsTab store={props.store} /> : <div />}
      </div>
    </div>
  )
}
