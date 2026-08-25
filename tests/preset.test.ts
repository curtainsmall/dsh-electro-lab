import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installPresets } from '../src/preset.ts'

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

  it('always overwrites an existing preset with the packaged copy', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-preset-test-'))
    process.env.DSH_HOME = home
    const target = join(home, '.agent-presets', 'electro-lab')
    installPresets()
    // a local edit is discarded on the next sync — the preset is plugin-owned
    const packaged = readFileSync(new URL('../presets/electro-lab/agent.cordis.yml', import.meta.url), 'utf8')
    writeFileSync(join(target, 'agent.cordis.yml'), 'user-tampered\n')
    expect(installPresets()).toContain('electro-lab')
    expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8')).toBe(packaged)
    expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toBe(
      readFileSync(new URL('../presets/electro-lab/preset.yml', import.meta.url), 'utf8'),
    )
    rmSync(home, { recursive: true, force: true })
  })
})
