/**
 * Skill registration. Skill bodies live as individual Markdown files under
 * skills/ (frontmatter carries name/description/whenToUse, the body is the
 * instruction content). The plugin reads them from the installed package at
 * runtime and registers them with the skills service; a missing service or
 * file is logged and skipped — tools keep working either way.
 */
import { readFileSync } from 'node:fs'
import type { Context } from 'cordis'

interface SkillFile {
  name: string
  description: string
  whenToUse?: string
  content: string
}

/** Strip matching surrounding double quotes (frontmatter values are valid YAML scalars). */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  return value
}

/** Parse leading YAML frontmatter (--- delimited, simple `key: value` lines) plus the body. */
export function parseSkillFile(text: string): SkillFile {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (match === null) throw new Error('skill file is missing YAML frontmatter')
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line)
    if (kv !== null) meta[kv[1]!] = unquote(kv[2]!)
  }
  const name = meta['name']
  const description = meta['description']
  if (name === undefined || description === undefined) throw new Error('skill frontmatter needs name and description')
  const skill: SkillFile = { name, description, content: match[2]!.trim() + '\n' }
  if (meta['whenToUse'] !== undefined) skill.whenToUse = meta['whenToUse']
  return skill
}

/** Package-relative skills directory (lib/.. = package root). */
const SKILLS_DIR = new URL('../skills/', import.meta.url)

/** Skill files shipped with the package, in registration order. Skill names
 *  carry the plugin prefix (electro-lab-*) so they never collide with
 *  skills from other plugins in the shared registry. */
const SKILL_FILES = ['electro-lab-template.md']

/** Register every packaged skill; returns one disposer that unregisters all. */
export function registerSkills(ctx: Context): () => void {
  const skills = ctx.get('skills') as
    | { register(reg: SkillFile): () => void }
    | undefined
  if (skills === undefined) return () => {}
  const disposers: Array<() => void> = []
  for (const file of SKILL_FILES) {
    try {
      const skill = parseSkillFile(readFileSync(new URL(file, SKILLS_DIR), 'utf8'))
      disposers.push(skills.register(skill))
    } catch (error) {
      ctx.logger?.warn(`[dsh-electro-lab] failed to register skill ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return () => {
    for (const off of disposers) off()
  }
}
