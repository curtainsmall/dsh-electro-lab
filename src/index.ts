/**
 * Host half of dsh-electro-lab.
 */
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry. */
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')
  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
