/**
 * External tool registry: the JSONL archive under the records home
 * (external-tools.jsonl, one declaration per line) plus validation. Changes
 * persist immediately but only take effect after a restart, so every write
 * sets the `restartRequired` dirty bit in state.json.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { QUANTITY_KIND_NAMES, ExternalHttpMethod, ExternalParamType, ExternalTransport, type ExternalToolConfig } from './types.ts'

export const EXTERNAL_TOOLS_FILE = 'external-tools.jsonl'
export const STATE_FILE = 'state.json'

/** Persistent restarts are tracked in state.json (application state, not the declaration file). */
const STATE_RESTART_KEY = 'restartRequired'

export function externalToolsPath(home: string): string {
  return join(home, EXTERNAL_TOOLS_FILE)
}

export function statePath(home: string): string {
  return join(home, STATE_FILE)
}

/** All declarations currently stored (enabled or not), in file order. */
export function readExternalTools(home: string): ExternalToolConfig[] {
  const file = externalToolsPath(home)
  if (!existsSync(file)) return []
  const tools: ExternalToolConfig[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      tools.push(JSON.parse(trimmed) as ExternalToolConfig)
    } catch {
      // one corrupt line never blocks the rest
    }
  }
  return tools
}

/** Rewrite the whole archive (idempotent, keeps file order). */
function writeExternalTools(home: string, tools: ExternalToolConfig[]): void {
  mkdirSync(home, { recursive: true })
  const content = tools.map((tool) => JSON.stringify(tool)).join('\n') + (tools.length > 0 ? '\n' : '')
  writeFileSync(externalToolsPath(home), content, 'utf8')
}

function setRestartRequired(home: string, required: boolean): void {
  const file = statePath(home)
  let state: Record<string, unknown> = {}
  try {
    state = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    // missing or corrupt state reads as {}
  }
  state[STATE_RESTART_KEY] = required
  writeFileSync(file, JSON.stringify(state), 'utf8')
}

/** True when a restart is pending for external-tool changes to take effect. */
export function restartRequired(home: string): boolean {
  try {
    const state = JSON.parse(readFileSync(statePath(home), 'utf8')) as Record<string, unknown>
    return state[STATE_RESTART_KEY] === true
  } catch {
    return false
  }
}

/** Clear the dirty bit; the host calls this once the tools are (re)registered at start. */
export function clearRestartRequired(home: string): void {
  setRestartRequired(home, false)
}

/** Append or update (by name) one declaration; sets the dirty bit. */
export function upsertExternalTool(home: string, config: ExternalToolConfig): void {
  const tools = readExternalTools(home)
  const index = tools.findIndex((tool) => tool.name === config.name)
  if (index === -1) tools.push(config)
  else tools[index] = config
  writeExternalTools(home, tools)
  setRestartRequired(home, true)
}

/** Delete one declaration by name; sets the dirty bit when something was removed. */
export function deleteExternalTool(home: string, name: string): boolean {
  const tools = readExternalTools(home)
  const next = tools.filter((tool) => tool.name !== name)
  if (next.length === tools.length) return false
  writeExternalTools(home, next)
  setRestartRequired(home, true)
  return true
}

/** Validation errors as a list of human-readable messages (empty = valid). */
export function validateExternalTool(config: unknown): string[] {
  const errors: string[] = []
  if (typeof config !== 'object' || config === null) return ['declaration must be an object']
  const tool = config as Partial<ExternalToolConfig>
  if (typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) {
    errors.push('name must match ^[a-z][a-z0-9_]{0,63}$ (lowercase start)')
  }
  if (typeof tool.description !== 'string') errors.push('description is required')
  if (tool.transport !== ExternalTransport.Http && tool.transport !== ExternalTransport.File) {
    errors.push(`transport must be one of ${Object.values(ExternalTransport).join(', ')}`)
  }
  if (typeof tool.parameters !== 'object' || tool.parameters === null) {
    errors.push('parameters must be an object')
  } else {
    for (const [key, spec] of Object.entries(tool.parameters as Record<string, unknown>)) {
      if (typeof spec !== 'object' || spec === null) {
        errors.push(`parameter "${key}" must be an object`)
        continue
      }
      const s = spec as { type?: string; kind?: string }
      if (s.kind !== undefined && !QUANTITY_KIND_NAMES.includes(s.kind)) {
        errors.push(`parameter "${key}": unknown kind "${s.kind}" (lowercase QuantityKind names only)`)
      }
      if (s.type !== undefined && s.type !== ExternalParamType.String && s.type !== ExternalParamType.Boolean) {
        errors.push(`parameter "${key}": type must be "string" or "boolean" (values use "kind")`)
      }
    }
  }
  if (tool.timeoutMs !== undefined && (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0)) {
    errors.push('timeoutMs must be a positive number')
  }
  const options = tool.transportOptions as unknown
  if (typeof options !== 'object' || options === null) {
    errors.push('transportOptions is required')
    return errors
  }
  const http = options as { url?: unknown; method?: unknown }
  const file = options as { directory?: unknown; pollMs?: unknown }
  if ('url' in http) {
    if (typeof http.url !== 'string' || !/^https?:\/\//.test(http.url)) {
      errors.push('transportOptions.url must be an http(s) URL')
    }
    if (http.method !== ExternalHttpMethod.Get && http.method !== ExternalHttpMethod.Post) {
      errors.push(`transportOptions.method must be one of ${Object.values(ExternalHttpMethod).join(', ')}`)
    }
  } else {
    if (typeof file.directory !== 'string' || (file.directory as string).length === 0) {
      errors.push('transportOptions.directory is required for file transport')
    }
    if (file.pollMs !== undefined && (!Number.isFinite(file.pollMs as number) || (file.pollMs as number) <= 0)) {
      errors.push('transportOptions.pollMs must be a positive number')
    }
  }
  return errors
}
