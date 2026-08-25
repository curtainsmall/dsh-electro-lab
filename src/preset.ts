/**
 * Packaged-preset installation: the plugin ships an `electro-lab` agent
 * preset under its own `presets/` directory (no plugin, no tools — the
 * preset travels with the package). On apply it is synced into the DSH
 * user preset root ($DSH_HOME/.agent-presets/<id>), where the agentPresets
 * discovery re-reads the roots on every list(), so the picker sees it once
 * the plugin is loaded.
 *
 * The preset is plugin-owned: every apply overwrites the target with the
 * packaged files, so the shipped preset always matches the installed
 * plugin version. Local edits to the preset are intentionally not
 * preserved — a stale preset would drift from the tools the plugin
 * actually registers.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Package-relative presets directory (lib/.. = package root). */
const PRESETS_DIR = new URL('../presets/', import.meta.url)

/** Files a preset directory must carry to be installable. */
const REQUIRED_FILES = ['agent.cordis.yml', 'preset.yml']

/** The DSH user preset root (matches dsh-agent-presets' USER_PRESET_DIR). */
function userPresetRoot(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, '.agent-presets')
}

/**
 * Sync every packaged preset into the user preset root, overwriting any
 * existing copy. Returns the ids it synced (for logging); throws on
 * filesystem errors so the caller can warn without breaking the plugin.
 */
export function installPresets(): string[] {
  const synced: string[] = []
  for (const entry of readdirSync(PRESETS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    const target = join(userPresetRoot(), id)
    mkdirSync(target, { recursive: true })
    for (const file of REQUIRED_FILES) {
      copyFileSync(new URL(`${id}/${file}`, PRESETS_DIR), join(target, file))
    }
    synced.push(id)
  }
  return synced
}
