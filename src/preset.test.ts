import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installPresets } from './preset.ts'

const ORIGINAL_HOME = process.env.DSH_HOME

afterEach(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_HOME
})

describe('installPresets', () => {
  it('copies the packaged preset into the DSH user root', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-preset-test-'))
    process.env.DSH_HOME = home
    const installed = installPresets()
    expect(installed).toContain('electro-lab')
    const target = join(home, '.agent-presets', 'electro-lab')
    expect(existsSync(join(target, 'agent.cordis.yml'))).toBe(true)
    expect(existsSync(join(target, 'preset.yml'))).toBe(true)
    // the copy matches the packaged source
    const packaged = readFileSync(new URL('../presets/electro-lab/agent.cordis.yml', import.meta.url), 'utf8')
    expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8')).toBe(packaged)
    rmSync(home, { recursive: true, force: true })
  })

  it('is idempotent and never overwrites an existing preset', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-preset-test-'))
    process.env.DSH_HOME = home
    installPresets()
    // a second call installs nothing new
    expect(installPresets()).toEqual([])
    // user edits survive
    const target = join(home, '.agent-presets', 'electro-lab', 'preset.yml')
    const edited = 'name: user-tweaked\n'
    // (write through the fs we already imported)
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(target, edited)
    installPresets()
    expect(readFileSync(target, 'utf8')).toBe(edited)
    rmSync(home, { recursive: true, force: true })
  })
})
