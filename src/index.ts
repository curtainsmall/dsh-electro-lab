/**
 * Host half of dsh-electro-lab.
 *
 * Phase 0 skeleton: establishes the plugin shape (name / inject / apply).
 * Tools and HTTP routes arrive in later phases.
 */
import type { Context } from 'cordis'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry (tools arrive in Phase 1+). */
export const inject = ['tools']

export function apply(ctx: Context): void {
  console.log('[dsh-electro-lab] host half mounted')
}
