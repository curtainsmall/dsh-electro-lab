/**
 * Client half of dsh-electro-lab.
 *
 * Phase 0 skeleton: establishes the client plugin shape (inject / apply).
 * The interactive panel (Smith chart canvas + calculators) registers into
 * slots in Phase 3.
 */
import type { Context } from 'cordis'

/** Services required before mounting (provided by the client runtime). */
export const inject = ['slots']

export function apply(ctx: Context): void {
  console.log('[dsh-electro-lab] client half mounted')
}
