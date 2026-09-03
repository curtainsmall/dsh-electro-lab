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
import { RecordsTab, GenerationOverlay } from './records.tsx'
import { ExternalToolsTab } from './external-tools.tsx'
import { t, useAppLocale } from './locales.ts'
import { IconChevronLeft } from './icons.tsx'

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

  // Generation overlay root: a body-level mount (independent of the panel
  // container and its display toggle) so the progress dialog and minimized
  // pill stay visible across the records list, the session chat, and every
  // other page. The shell defines the theme tokens on <body>, so the overlay
  // inherits them; pointer-events are re-enabled on the dialog/pill themselves.
  const overlayContainer = document.createElement('div')
  overlayContainer.style.cssText = 'position: fixed; inset: 0; z-index: 95; pointer-events: none;'
  document.body.appendChild(overlayContainer)
  let overlayRoot: ReturnType<typeof createRoot> | undefined
  overlayRoot ??= createRoot(overlayContainer)
  overlayRoot.render(<GenerationOverlay />)
  const style = document.createElement('style')
  style.textContent = `
    [data-pane="conversation"], [class*="centerCol"] { position: relative; }
    [data-dsh-electrolab-view] { position: absolute; inset: 0; z-index: 40;
      background: var(--dsw-alias-bg-base, #171a21); overflow: auto; }
    /* Visible scrollbars in both themes: the shell's scrollbar-bg-l2 is
       near-white in light themes, so label-tertiary is used — a solid color
       on dark and light backgrounds. Safe since the extension now scales the
       iframe with CSS zoom (relayout), not transform:scale (post-raster
       scaling that blurred everything). */
    [data-dsh-electrolab-view]::-webkit-scrollbar,
    [data-dsh-electrolab-view] ::-webkit-scrollbar { width: 10px; height: 10px; }
    [data-dsh-electrolab-view]::-webkit-scrollbar-track,
    [data-dsh-electrolab-view] ::-webkit-scrollbar-track { background: transparent; }
    [data-dsh-electrolab-view]::-webkit-scrollbar-thumb,
    [data-dsh-electrolab-view] ::-webkit-scrollbar-thumb {
      background: var(--dsw-alias-label-tertiary);
      border: 2px solid transparent;
      border-radius: 5px;
      background-clip: padding-box; }
    [data-dsh-electrolab-view]::-webkit-scrollbar-thumb:hover,
    [data-dsh-electrolab-view] ::-webkit-scrollbar-thumb:hover {
      background: var(--dsw-alias-label-primary); }
  `
  document.head.appendChild(style)
  // The vendored directory-tree stylesheet, served by the host (injected on
  // arrival so the bundle never has to inline the CSS).
  void fetch('/api/dsh-electro-lab/directory-tree.css')
    .then((res) => (res.ok ? res.text() : ''))
    .then((css) => {
      if (css.length > 0) style.textContent += `\n${css}`
    })
    .catch(() => {})

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
      // Single-occupant center column: the sibling panels (ssh / task board)
      // only evict EACH OTHER — they don't know this plugin. Remove their html
      // attributes (hides their views) and dispatch their activation names so
      // their controllers close too (otherwise their sidebar entries stay
      // highlighted); the activate event covers any panel that listens.
      evicting = true
      try {
        // Generic view eviction: any center-column panel marks <html> with a
        // data-dsh-*-active attribute; remove all of them (unknown future
        // panels included) before claiming the column.
        for (const attr of Array.from(document.documentElement.attributes)) {
          if (attr.name.startsWith('data-dsh-') && attr.name.endsWith('-active') && attr.name !== ACTIVE_ATTR) {
            document.documentElement.removeAttribute(attr.name)
          }
        }
        // Controller eviction for the known sibling panels: their controllers
        // only close when they see each other's activation name.
        document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: 'taskboard' }))
        document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: 'ssh' }))
      } finally {
        evicting = false
      }
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }
  // While evicting the sibling panels we dispatch their own activation names
  // (the only event each of them reacts to); our own listener must ignore
  // those dispatches or it would close this panel the moment it opens.
  let evicting = false
  const onOtherActivate = (event: Event): void => {
    if (evicting) return
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
    overlayRoot?.unmount()
    overlayContainer.remove()
  }
}

/* ── Nav entry (sidebar rail, beside SSH / task board / skills) ─────────────── */

const SIDEBAR_COLUMN_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'
const ENTRY_ATTR = 'data-dsh-electrolab-entry'
/** The rail family this entry joins, in shell order — placed after the last one. */
const ENTRY_FAMILY = ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-skill-explorer-entry]']
/** Wave-square glyph (Font Awesome, CC BY 4.0) — the ElectroLab identity, rendered like the shell's line icons. */
const ENTRY_ICON =
  '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">' +
  '<path d="M64 96c0-17.7 14.3-32 32-32l160 0c17.7 0 32 14.3 32 32l0 288 96 0 0-128c0-17.7 14.3-32 32-32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0 0 128c0 17.7-14.3 32-32 32l-160 0c-17.7 0-32-14.3-32-32l0-288-96 0 0 128c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0 0-128z"/></svg>'
/** Entry styles: the exact rules the SSH/task-board/skills entries use, self-contained.
 *  The collapsed variant keys off ANY ancestor whose class contains "collapsed"
 *  (the shell's rail carries e.g. "hHd-Xa_collapsed"); there is no stable
 *  [data-dsh-frame] attribute to hang a selector on. */
const ENTRY_CSS = `
.dsh-elab-entry{box-sizing:border-box;width:100%;min-height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:10px;padding:0 10px;font-size:13px;display:flex}
.dsh-elab-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-elab-entry[data-active]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-elab-entryIcon{flex:none;justify-content:center;align-items:center;width:24px;height:24px;display:inline-flex}
.dsh-elab-entryIcon svg{width:18px;height:18px;display:block}
.dsh-elab-entryLabel{text-overflow:ellipsis;overflow:hidden}
[class*="collapsed"] .dsh-elab-entry{border-radius:50%;justify-content:center;width:36px;min-height:36px;margin:0 auto 12px;padding:0}
[class*="collapsed"] .dsh-elab-entryLabel{display:none}
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
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-specific-sidebar-fill, #171a21)',
}

const backButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--dsw-alias-label-tertiary)',
  borderRadius: 6,
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  flex: 'none',
  padding: '8px 14px 0',
  borderBottom: '1px solid var(--dsw-alias-border-l1)',
}

/** Active tab button, styled exactly like the dsh-ssh panel tabs (panel.module.css .tab + .tab[data-active]);
 *  only the selected tab carries the accent underline. */
function tabButtonStyle(hovered: boolean, active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px',
    fontSize: 13,
    color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
    fontWeight: active ? 600 : 400,
    background: hovered ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
    border: 'none',
    borderBottom: '2px solid',
    borderBottomColor: active ? 'var(--dsw-alias-state-business-primary)' : 'transparent',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

/** One tab button: active styling plus a self-managed hover state. */
function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? '' : undefined}
      data-dsh-part="tab"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={tabButtonStyle(hovered, active)}
    >
      {label}
    </button>
  )
}

/** The panel body: title bar with a back-to-session button, tabs, content. */
export function ElectroLabPanel(): React.JSX.Element | null {
  useAppLocale() // Re-render when the active language changes.
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  const [backHover, setBackHover] = useState(false)
  const [tab, setTab] = useState<'records' | 'external'>('records')

  if (!open) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: '13px/1.5 var(--dsw-font-family)',
      }}
    >
      <div style={headerStyle}>
        <button
          type="button"
          aria-label={t('backToSession')}
          onClick={() => panelStore.toggle()}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            ...backButtonStyle,
            background: backHover ? 'var(--dsw-alias-interactive-bg-hover)' : 'none',
            borderColor: backHover ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}><IconChevronLeft size={16} /></span>
          <span style={{ lineHeight: 1 }}>{t('backToSession')}</span>
        </button>
        <h2 style={{ margin: 0, fontSize: 15 }}>ElectroLab</h2>
      </div>
      <div role="tablist" style={tabBarStyle} data-dsh-part="tab-bar">
        <TabButton active={tab === 'records'} label={t('tabRecords')} onClick={() => setTab('records')} />
        <TabButton active={tab === 'external'} label={t('tabExternal')} onClick={() => setTab('external')} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {tab === 'records' ? <RecordsTab /> : <ExternalToolsTab />}
      </div>
    </div>
  )
}
