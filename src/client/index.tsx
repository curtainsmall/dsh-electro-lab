/**
 * Client half of DSH ElectroLab: the ElectroLab records panel.
 *
 * Registers two pieces of UI:
 * - a nav entry in the sidebar rail (DOM-mounted beside the SSH, task-board
 *   and skills entries — the product has no slot for that rail) that toggles
 * - the panel mounted over the center column (see panel.tsx).
 *
 * The UI dictionaries are registered into the DSH locale service, so the
 * panel follows the user's chosen language (see locales.ts).
 */
import type { Context } from 'cordis'
import { mountElectroLabEntry, mountElectroLabPanel } from './panel.tsx'
import { installLocale, LOCALE_NS, dictionaries } from './locales.ts'

/** The locale service the UI copy and language subscriptions ride on. */
interface LocaleLike {
  register(namespace: string, dicts: unknown): () => void
  getSnapshot(): { active: string; revision: number }
  subscribe(solver: () => void): () => void
}

declare module 'cordis' {
  interface Context {
    locale: LocaleLike
  }
}

/** Required services: the locale registry for the dual-language UI copy. */
export const inject = ['locale']

export function apply(ctx: Context): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(LOCALE_NS, dictionaries)
    } catch {
      // A missing locale service must never break the panel.
      return () => {}
    }
  }, 'dsh-electro-lab: dictionaries')

  installLocale(ctx.locale)

  ctx.effect(() => {
    const disposers: Array<() => void> = [
      mountElectroLabEntry(),
      mountElectroLabPanel(),
    ]
    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: panel UI')
}
