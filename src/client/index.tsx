/**
 * Client half of DSH ElectroLab: the ElectroLab run-records panel.
 *
 * Registers two pieces of UI, both in the SSH/task-board style:
 * - a nav entry in the sidebar rail (DOM-mounted beside the SSH, task-board
 *   and skills entries — the product has no slot for that rail) that toggles
 * - the SSH-style panel mounted over the center column (see panel.tsx).
 */
import type { Context } from 'cordis'
import { mountElectroLabEntry, mountElectroLabPanel } from './panel.tsx'

export function apply(ctx: Context): void {
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
