import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseSkillFile } from '../src/skill.ts'

describe('parseSkillFile', () => {
  it('parses frontmatter metadata and the body', () => {
    const skill = parseSkillFile(
      [
        '---',
        'name: worked-solution',
        'description: "Worked electrical/electronics solutions: analyse, plan"',
        'whenToUse: "The user asks for a worked calculation"',
        '---',
        '# Worked Solution',
        '',
        'Some instructions.',
        '',
      ].join('\n'),
    )
    expect(skill.name).toBe('worked-solution')
    expect(skill.description).toBe('Worked electrical/electronics solutions: analyse, plan')
    expect(skill.whenToUse).toBe('The user asks for a worked calculation')
    expect(skill.content).toContain('# Worked Solution')
    expect(skill.content).toContain('Some instructions.')
  })

  it('raises when frontmatter is missing or incomplete', () => {
    expect(() => parseSkillFile('# No frontmatter')).toThrow(/missing YAML frontmatter/)
    expect(() => parseSkillFile('---\ndescription: only\n---\nbody')).toThrow(/needs name and description/)
  })

  it('parses the shipped template skill (format guard)', () => {
    const text = readFileSync(new URL('../skills/electro-lab-template.md', import.meta.url), 'utf8')
    const skill = parseSkillFile(text)
    expect(skill.name).toBe('electro-lab-template')
    expect(skill.description).toContain('five-part')
    expect(skill.whenToUse).toContain('electro-lab workflow')
    expect(skill.content).toContain('## Template')
  })

  it('parses the shipped interface skill (format guard)', () => {
    const text = readFileSync(new URL('../skills/electro-lab-interface.md', import.meta.url), 'utf8')
    const skill = parseSkillFile(text)
    expect(skill.name).toBe('electro-lab-interface')
    expect(skill.description).toContain('Operational interface')
    expect(skill.whenToUse).toContain('quantitative')
    expect(skill.content).toContain('Value format')
  })
})
