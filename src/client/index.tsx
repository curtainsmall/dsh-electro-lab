/**
 * Client half of dsh-electro-lab: the ElectroLab run-records panel.
 *
 * Registers two pieces of UI:
 * - a nav button in the sidebar foot (sidebar.footer.action, beside
 *   Settings — the same family as the SSH/task-board entries) that toggles
 * - the SSH-style panel mounted over the center column (see panel.tsx).
 * The slots service is optional: without it the plugin simply has no button.
 */
import type { Context } from 'cordis'
import { mountElectroLabPanel, SidebarNavButton } from './panel.tsx'

/** Services required before mounting (provided by the client runtime). */
export const inject = ['slots']

/** Minimal structural shape of the slots service (loose-typed on purpose —
 *  the runtime module table provides the real implementation). */
interface SlotRegistration {
  name: string
  id: string
  order?: number
  label?: string | (() => string)
}

interface SlotsLike {
  inject(key: string, callback: () => () => void): () => void
  register(registration: SlotRegistration, component: unknown): () => void
}

export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as SlotsLike | undefined
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    if (slots !== undefined) {
      disposers.push(
        slots.inject('sidebar.footer.action', () =>
          slots.register(
            { name: 'sidebar.footer.action', id: 'electro-lab', order: 100, label: () => 'ElectroLab' },
            SidebarNavButton,
          ),
        ),
      )
    }
    disposers.push(mountElectroLabPanel())
    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: panel UI')
}
