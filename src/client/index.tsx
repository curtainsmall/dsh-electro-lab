/**
 * Client half of dsh-electro-lab: the interactive ElectroLab panel.
 *
 * Registers two pieces of UI through the slots system:
 * - a header action button (conversation.session.header.actions) that toggles
 * - the floating panel (shell.overlay) with the Smith chart and readouts.
 * The slots service is optional: without it the plugin simply has no UI.
 */
import type { Context } from 'cordis'
import { PanelToggleButton, ElectroLabPanel } from './panel.tsx'

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
  if (slots === undefined) return
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    disposers.push(
      slots.inject('conversation.session.header.actions', () =>
        slots.register(
          { name: 'conversation.session.header.actions', id: 'electro-lab', order: 100, label: () => 'ElectroLab' },
          PanelToggleButton,
        ),
      ),
    )
    disposers.push(
      slots.inject('shell.overlay', () =>
        slots.register(
          { name: 'shell.overlay', id: 'electro-lab-panel', order: 100, label: () => 'ElectroLab panel' },
          ElectroLabPanel,
        ),
      ),
    )
    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: panel UI')
}
