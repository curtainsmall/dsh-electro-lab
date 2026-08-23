/**
 * Host half of dsh-electro-lab.
 */
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry. */
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')
}
