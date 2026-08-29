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
import { RecordsTab } from './records.tsx'

/** Tiny shared store: open state + subscription for the nav button and the panel.
 *  Methods never use `this`: they are passed around detached (React's
 *  useSyncExternalStore hands `subscribe` to the store), and a `this`-bound
 *  method would lose its receiver and crash on `this.listeners`. */
const panelListeners = new Set<() => void>()
const panelStore = {
  open: false,
  toggle(): void {
    panelStore.open = !panelStore.open
    for (const listener of panelListeners) listener()
  },
  subscribe(listener: () => void): () => void {
    panelListeners.add(listener)
    return () => {
      panelListeners.delete(listener)
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

/**
 * Mount the panel inside the center column and wire open-state side effects:
 * the active attribute on <html>, cross-panel mutual exclusion, and closing
 * when the user picks another sidebar row. Returns one disposer that removes
 * the DOM, the React root and every listener.
 */
export function mountElectroLabPanel(): () => void {
  const container = document.createElement('div')
  container.dataset.dshElectrolabView = ''
  container.style.display = 'none'
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
    root.render(<ElectroLabPanel />)
  }
  const waitObserver = new MutationObserver(tryPlace)
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    // The container itself paints the opaque overlay, so it must be hidden
    // while the panel is closed — otherwise it would cover the conversation
    // and swallow every click even though the React tree renders nothing.
    container.style.display = panelStore.open ? 'block' : 'none'
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

/* ── Nav entry (sidebar rail, beside SSH / task board / skills) ─────────────── */

const SIDEBAR_COLUMN_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'
const ENTRY_ATTR = 'data-dsh-electrolab-entry'
/** The rail family this entry joins, in shell order — placed after the last one. */
const ENTRY_FAMILY = ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-skill-explorer-entry]']
/** Oscilloscope trace glyph: a sine wave on a baseline — the ElectroLab identity, rendered like the shell's 16px line icons. */
const ENTRY_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M2 8h2c.5-3.5 1.5-3.5 2 0s1.5 3.5 2 0 1.5-3.5 2 0 1.5 3.5 2 0h2"/></svg>'
/** Entry styles: the exact rules the SSH/task-board/skills entries use, self-contained. */
const ENTRY_CSS = `
.dsh-elab-entry{box-sizing:border-box;width:100%;min-height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:10px;padding:0 10px;font-size:13px;display:flex}
.dsh-elab-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-elab-entry[data-active]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-elab-entryIcon{flex:none;justify-content:center;align-items:center;width:24px;height:24px;display:inline-flex}
.dsh-elab-entryIcon svg{width:18px;height:18px;display:block}
.dsh-elab-entryLabel{text-overflow:ellipsis;overflow:hidden}
[data-dsh-frame][data-sidebar-collapsed] .dsh-elab-entry{border-radius:50%;justify-content:center;width:36px;min-height:36px;margin:0 auto 12px;padding:0}
[data-dsh-frame][data-sidebar-collapsed] .dsh-elab-entryLabel{display:none}
`

/**
 * Mount the nav entry into the sidebar rail exactly like the SSH/task-board/
 * skills panels: a button appended inside the sidebar column root, anchored
 * after the existing entry family, with self-healing observers that re-place
 * it when the shell re-renders. Returns one disposer that removes it.
 */
export function mountElectroLabEntry(): () => void {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.setAttribute(ENTRY_ATTR, '')
  entry.setAttribute('data-dsh-plugin', 'electro-lab')
  entry.setAttribute('data-dsh-part', 'sidebar-entry')
  entry.setAttribute('aria-label', 'ElectroLab')
  entry.setAttribute('title', 'ElectroLab')
  entry.className = 'dsh-elab-entry'
  entry.innerHTML = `<span class="dsh-elab-entryIcon">${ENTRY_ICON}</span><span class="dsh-elab-entryLabel">ElectroLab</span>`
  const style = document.createElement('style')
  style.textContent = ENTRY_CSS
  document.head.appendChild(style)

  const syncActive = (): void => {
    if (panelStore.open) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  entry.addEventListener('click', () => panelStore.toggle())
  const unsubscribeActive = panelStore.subscribe(syncActive)
  syncActive()

  let root: HTMLElement | undefined
  let placed = false
  const sidebarRoot = (): HTMLElement | undefined => {
    const column = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
    if (column === null) return undefined
    return column.querySelector('[class*="logoRow"]')?.parentElement ?? (column.firstElementChild as HTMLElement | undefined)
  }
  const place = (): boolean => {
    const baseEl = root
    if (baseEl === undefined) return false
    const newSession = baseEl.querySelector('button[class*="newSession"]')
    const firstButton = newSession ?? Array.from(baseEl.children).find((el) => el.tagName === 'BUTTON')
    if (firstButton === undefined) return false
    const row = firstButton.closest('[class*="logoRow"]')
    const base = row !== null && row.parentElement === baseEl ? row : firstButton
    const family = Array.from(baseEl.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches(ENTRY_FAMILY.join(', ')))
    const anchor = family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling
    baseEl.insertBefore(entry, anchor)
    return true
  }
  const rootObserver = new MutationObserver(() => {
    if (placed && entry.isConnected) return
    if (root !== undefined && !entry.isConnected) placed = false
    tryPlace()
  })
  const tryPlace = (): void => {
    if (placed && entry.isConnected) return
    root ??= sidebarRoot()
    if (root === undefined) return
    if (!placed) placed = place()
    if (placed) rootObserver.observe(root, { childList: true, subtree: true })
  }
  const waitObserver = new MutationObserver(tryPlace)
  waitObserver.observe(document.body, { childList: true, subtree: true })
  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribeActive()
    style.remove()
    entry.remove()
  }
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
  border: '1px solid #2a2f3a',
  borderRadius: 6,
  color: '#c8ccd4',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '8px 14px 0',
  borderBottom: '1px solid #2a2f3a',
  background: 'var(--dsw-specific-sidebar-fill, #171a21)',
}

/** The panel body: title bar with a back-to-session button, tabs, content. */
export function ElectroLabPanel(): React.JSX.Element | null {
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  const [tab, setTab] = useState<'config' | 'records'>('records')
  const [backHover, setBackHover] = useState(false)
  const [tabHover, setTabHover] = useState<'config' | 'records' | null>(null)

  if (!open) return null

  const tabButton = (key: 'config' | 'records', label: string): React.JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      onMouseEnter={() => setTabHover(key)}
      onMouseLeave={() => setTabHover(null)}
      style={{
        padding: '5px 12px',
        border: '1px solid #2a2f3a',
        borderBottomColor: tab === key ? '#e8b34b' : '#2a2f3a',
        borderRadius: 6,
        background: tabHover === key ? '#22262e' : 'none',
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
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            ...backButtonStyle,
            background: backHover ? '#22262e' : 'none',
            borderColor: backHover ? '#39404d' : '#2a2f3a',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>‹</span>
          <span style={{ lineHeight: 1 }}>Back to session</span>
        </button>
        <h2 style={{ margin: 0, fontSize: 15 }}>ElectroLab</h2>
      </div>
      <div role="tablist" style={tabBarStyle}>
        {tabButton('config', 'Config')}
        {tabButton('records', 'Records')}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {tab === 'records' ? <RecordsTab /> : <div />}
      </div>
    </div>
  )
}
