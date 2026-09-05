/**
 * The tool core — everything the surface outside the context needs in one
 * module:
 *
 * 1. Definition: ToolReturns (the declared output shape of a declaration),
 *    renderText and defineJsonTool — the factory used by the manager tools
 *    (external_tool_*) and the context primitives (set/get/call, markers).
 * 2. Declarations: the archive-authored tool dialect (ToolDeclaration,
 *    Declaration*), the external-tools.jsonl archive with the restart dirty
 *    bit, and validation. Declarations are not compiled into tools anymore —
 *    at plugin start every enabled declaration is recorded verbatim into the
 *    context's fn registry as an external fn (machine/external-fns.ts), which
 *    wraps the http/file transport itself.
 *
 * ToolError/ToolErrorCode are re-exported so callers import the failure
 * types from one place.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { QuantityKind, QUANTITY_KIND_NAMES } from './math/quantity-kind.ts'
import { ToolError, ToolErrorCode } from './errors.ts'

/** Re-exported so every caller imports the failure types from one place. */
export { ToolError, ToolErrorCode }

/**
 * Declared result shape of a declared tool (the context fn's `returns` spec
 * is mapped from this at registration — machine/external-fns.ts).
 */
export type ToolReturns =
  /** Any JSON (cannot be mapped to a typed spec — an external fn needs an explicit shape). */
  | { type: 'any' }
  /** A plain string passthrough. */
  | { type: 'string' }
  /** A plain boolean passthrough. */
  | { type: 'boolean' }
  /** A real quantity with its kind. */
  | { type: 'number'; kind: QuantityKind }
  /** A complex quantity with its kind (either form accepted). */
  | { type: 'complex'; kind: QuantityKind }
  /** A named-fields object; every field declared recursively. */
  | { type: 'object'; fields: Record<string, ToolReturns> }
  /** A homogeneous array; elements declared recursively. */
  | { type: 'array'; items: ToolReturns }

/** Pretty JSON text rendering for the model-facing presentation. */
export function renderText(value: JsonValue): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/**
 * Define a tool whose output is an unconstrained JSON value rendered as
 * pretty text. `execute` may be synchronous; it is wrapped into the async
 * contract the registry expects. The execution context is passed through
 * so orchestrator tools can propagate cancellation and parent tokens.
 */
export function defineJsonTool<S extends ParameterSchemaSpec>(
  options: Omit<DefineToolOptions<S, { type: 'json' }>, 'output' | 'execute'> & {
    execute: (args: InferArgs<S>, exec: ToolRunContext) => JsonValue | Promise<JsonValue>
  },
) {
  return defineTool({
    ...options,
    execute: async (args, exec) => {
      // One unified failure path at the tool boundary: every failure inside
      // TypeScript is a throw — kernels and lower layers throw whatever
      // they want, and any non-ToolError is re-wrapped here so every tool
      // call fails through the same structured channel.
      try {
        return await options.execute(args, exec)
      } catch (error) {
        if (error instanceof ToolError) throw error
        throw new ToolError(error instanceof Error ? error.message : String(error))
      }
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderText(value as JsonValue),
    },
  })
}

/** Re-exported for callers that only need the kind list (the pure source is math/quantity-kind). */
export { QUANTITY_KIND_NAMES }

/* ── Dialect ──────────────────────────────────────────────────────────────── */

/** Transports a declared fn can be reached over. */
export enum DeclarationTransport {
  Http = 'http',
  File = 'file',
}

/** HTTP verbs accepted by the archive dialect. The host transport is POST
 *  only (typed args travel as a JSON body), so a non-POST method is accepted
 *  for archive compatibility but not honored by the executor. */
export enum DeclarationHttpMethod {
  Get = 'GET',
  Post = 'POST',
}

/** A parameter's settled semantic type — quantity mirrors the returns leaves. */
export enum DeclarationParamType {
  Quantity = 'quantity',
  String = 'string',
  Boolean = 'boolean',
  Array = 'array',
}

/** One parameter of a declared tool: a single settled semantic type; kind is
 *  the semantic payload of the quantity type (mirrors returns). */
export type DeclarationParamSpec =
  /** A quantity (accepts bare-number, {re,im} or {mag,ang} payloads); kind is a lowercase QuantityKind name. */
  | { type: DeclarationParamType.Quantity; kind: string; description?: string; required?: boolean }
  /** A plain string (optionally enum-constrained). */
  | { type: DeclarationParamType.String; enum?: string[]; description?: string; required?: boolean }
  /** A plain boolean. */
  | { type: DeclarationParamType.Boolean; description?: string; required?: boolean }
  /** A homogeneous array of arbitrary length; every element matches the same recursive item spec. */
  | { type: DeclarationParamType.Array; items: DeclarationParamSpec; description?: string; required?: boolean }

export type DeclarationParameters = Record<string, DeclarationParamSpec>

/** Shared transport-agnostic declaration fields. */
interface DeclarationBase {
  name: string
  description: string
  /** Registers at plugin start when not false (a declaration without the flag defaults to enabled). */
  enabled: boolean
  parameters: DeclarationParameters
  /** Explicit result shape — required for registration as a context fn:
   *  a spec, or null = void. A declaration without it (or with the
   *  unmappable "any" leaf) is kept in the archive but skipped at start. */
  returns?: ToolReturns | null
  timeoutMs?: number
}

/** http transport options. The request is a POST with the typed envelope as body. */
export interface DeclarationHttpOptions {
  url: string
  method: DeclarationHttpMethod
  headers?: Record<string, string>
}

/** file transport options: a whitelisted directory where the host writes
 *  requests and polls for responses. */
export interface DeclarationFileOptions {
  directory: string
  inPrefix?: string
  outPrefix?: string
  pollMs?: number
}

/** One declaration — a discriminated union so `transport` narrows
 *  `transportOptions` precisely. */
export type ToolDeclaration = DeclarationBase & (
  | { transport: DeclarationTransport.Http; transportOptions: DeclarationHttpOptions }
  | { transport: DeclarationTransport.File; transportOptions: DeclarationFileOptions }
)

/* ── Archive ──────────────────────────────────────────────────────────────── */

/** The declaration archive file (one JSON declaration per line). */
export const DECLARATIONS_FILE = 'external-tools.jsonl'
/** Non-config serialized state (the restart dirty bit lives here). */
export const STATE_FILE = 'state.json'

/** Persistent restarts are tracked in state.json (application state, not the declaration file). */
const STATE_RESTART_KEY = 'restartRequired'

export function declarationsPath(home: string): string {
  return join(home, DECLARATIONS_FILE)
}

export function statePath(home: string): string {
  return join(home, STATE_FILE)
}

/** All declarations currently stored (enabled or not), in file order. */
export function readDeclarations(home: string): ToolDeclaration[] {
  const file = declarationsPath(home)
  if (!existsSync(file)) return []
  const declarations: ToolDeclaration[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      declarations.push(JSON.parse(trimmed) as ToolDeclaration)
    } catch {
      // one corrupt line never blocks the rest
    }
  }
  return declarations
}

/** Rewrite the whole archive (idempotent, keeps file order). */
function writeDeclarations(home: string, declarations: ToolDeclaration[]): void {
  mkdirSync(home, { recursive: true })
  const content = declarations.map((tool) => JSON.stringify(tool)).join('\n') + (declarations.length > 0 ? '\n' : '')
  writeFileSync(declarationsPath(home), content, 'utf8')
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

/** True when a restart is pending for declaration changes to take effect. */
export function restartRequired(home: string): boolean {
  try {
    const state = JSON.parse(readFileSync(statePath(home), 'utf8')) as Record<string, unknown>
    return state[STATE_RESTART_KEY] === true
  } catch {
    return false
  }
}

/** Clear the dirty bit; the host calls this once the fns are (re)registered at start. */
export function clearRestartRequired(home: string): void {
  setRestartRequired(home, false)
}

/** Append or update (by name) one declaration; sets the dirty bit. */
export function upsertDeclaration(home: string, declaration: ToolDeclaration): void {
  const declarations = readDeclarations(home)
  const index = declarations.findIndex((tool) => tool.name === declaration.name)
  if (index === -1) declarations.push(declaration)
  else declarations[index] = declaration
  writeDeclarations(home, declarations)
  setRestartRequired(home, true)
}

/** Delete one declaration by name; sets the dirty bit when something was removed. */
export function deleteDeclaration(home: string, name: string): boolean {
  const declarations = readDeclarations(home)
  const next = declarations.filter((tool) => tool.name !== name)
  if (next.length === declarations.length) return false
  writeDeclarations(home, next)
  setRestartRequired(home, true)
  return true
}

/* ── Validation ───────────────────────────────────────────────────────────── */

/** Recursively validate one parameter spec (array items nest). */
function validateParamSpec(spec: unknown, path: string, errors: string[]): void {
  if (typeof spec !== 'object' || spec === null) {
    errors.push(`${path} must be an object`)
    return
  }
  const s = spec as { type?: string; kind?: string; enum?: unknown; items?: unknown }
  switch (s.type) {
    case DeclarationParamType.Quantity:
      if (s.kind === undefined || !QUANTITY_KIND_NAMES.includes(s.kind)) {
        errors.push(`${path}: quantity type requires a known kind (lowercase QuantityKind names)`)
      }
      break
    case DeclarationParamType.String:
      if (s.enum !== undefined && (!Array.isArray(s.enum) || s.enum.some((item) => typeof item !== 'string'))) {
        errors.push(`${path}: enum must be a string array`)
      }
      break
    case DeclarationParamType.Boolean:
      break
    case DeclarationParamType.Array:
      if (s.items === undefined) errors.push(`${path}: array type requires an items declaration`)
      else validateParamSpec(s.items, `${path}.items`, errors)
      break
    default:
      errors.push(`${path}: unknown type "${String(s.type)}" (one of ${Object.values(DeclarationParamType).join(', ')})`)
  }
}

/** Validation errors as a list of human-readable messages (empty = valid). */
export function validateDeclaration(config: unknown): string[] {
  const errors: string[] = []
  if (typeof config !== 'object' || config === null) return ['declaration must be an object']
  const tool = config as Partial<ToolDeclaration>
  if (typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) {
    errors.push('name must match ^[a-z][a-z0-9_]{0,63}$ (lowercase start)')
  }
  if (typeof tool.description !== 'string') errors.push('description is required')
  if (tool.enabled !== undefined && typeof tool.enabled !== 'boolean') errors.push('enabled must be a boolean when present')
  if (tool.transport !== DeclarationTransport.Http && tool.transport !== DeclarationTransport.File) {
    errors.push(`transport must be one of ${Object.values(DeclarationTransport).join(', ')}`)
  }
  if (typeof tool.parameters !== 'object' || tool.parameters === null || Array.isArray(tool.parameters)) {
    errors.push('parameters must be an object')
  } else {
    for (const [key, spec] of Object.entries(tool.parameters as Record<string, unknown>)) {
      validateParamSpec(spec, `parameter "${key}"`, errors)
    }
  }
  // The registration-side fn needs an explicit returns: a declaration without
  // one stays in the archive but never registers (validated at registration,
  // external-fns.ts — reported there, not here).
  if (tool.timeoutMs !== undefined && (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0)) {
    errors.push('timeoutMs must be a positive number')
  }
  const options = tool.transportOptions as unknown
  if (typeof options !== 'object' || options === null) {
    errors.push('transportOptions is required')
    return errors
  }
  // The declared transport decides which options shape is expected (the
  // union discriminant); an invalid transport already reported itself and
  // skips the per-shape checks.
  const http = options as { url?: unknown; method?: unknown }
  const file = options as { directory?: unknown; pollMs?: unknown }
  switch (tool.transport) {
    case DeclarationTransport.Http:
      if (typeof http.url !== 'string' || !/^https?:\/\//.test(http.url)) {
        errors.push('transportOptions.url must be an http(s) URL')
      }
      if (http.method !== DeclarationHttpMethod.Get && http.method !== DeclarationHttpMethod.Post) {
        errors.push(`transportOptions.method must be one of ${Object.values(DeclarationHttpMethod).join(', ')}`)
      }
      break
    case DeclarationTransport.File:
      if (typeof file.directory !== 'string' || (file.directory as string).length === 0) {
        errors.push('transportOptions.directory is required for file transport')
      }
      if (file.pollMs !== undefined && (!Number.isFinite(file.pollMs as number) || (file.pollMs as number) <= 0)) {
        errors.push('transportOptions.pollMs must be a positive number')
      }
      break
  }
  return errors
}
