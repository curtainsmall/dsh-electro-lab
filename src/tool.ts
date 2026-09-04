/**
 * The tool core — everything a tool needs in one module:
 *
 * 1. Definition: ToolReturns (the declared output shape), TOOL_RETURNS,
 *    createValueParam (the value-payload schema), renderText and
 *    defineJsonTool — the one factory every tool definition goes through.
 * 2. Declarations: the archive-authored tool dialect (ToolDeclaration,
 *    Declaration*), the external-tools.jsonl archive with the restart dirty
 *    bit, validation, compilation into the same defineJsonTool definition,
 *    and the http/file transport executors (envelope protocol).
 *
 * Code-authored tool modules under tools/ import the factory from here;
 * declarations are the same factory's other author. ToolError/ToolErrorCode
 * are re-exported so tool files import the failure types from one place.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { QuantityKind, QUANTITY_KIND_NAMES } from './math/quantity-kind.ts'
import { ToolError, ToolErrorCode } from './errors.ts'

/** Re-exported so every tool file imports the failure types from one place. */
export { ToolError, ToolErrorCode }

/**
 * Declared return shape of a tool, used by the record layer to tag stored
 * results with quantity kinds (the values themselves carry no kind — it
 * lives here, in the static tool definition). Tagged forms (never plain
 * shape mirroring): real tool outputs contain fields literally named
 * "kind"/"type", so a mirror-style declaration would collide.
 */
export type ToolReturns =
  /** Any JSON, stored verbatim (no tagging). */
  | { type: 'any' }
  /** A plain string passthrough (echo fields: configuration/mode/kind/from/to…). */
  | { type: 'string' }
  /** A plain boolean passthrough (infinite, converges…). */
  | { type: 'boolean' }
  /** A real quantity (stored as a number) with its kind. */
  | { type: 'number'; kind: QuantityKind }
  /** A complex quantity (stored as {re,im}) with its kind. */
  | { type: 'complex'; kind: QuantityKind }
  /** A named-fields object; every field declared recursively. */
  | { type: 'object'; fields: Record<string, ToolReturns> }
  /** A homogeneous array; elements declared recursively (JSON-Schema naming, same as parameter arrays). */
  | { type: 'array'; items: ToolReturns }

/** Declared return shapes keyed by tool name — the record layer reads these when settling a result. */
export const TOOL_RETURNS = new Map<string, ToolReturns>()

/**
 * The one parameter shape for any value payload: a bare number (a real
 * value), a compact complex object — {re, im} for the rect form or {mag, ang}
 * (angles in radians) for the polar form. The payload carries no kind and no
 * form: the expected quantity kind is pinned per parameter by this factory's
 * `kind` argument (surfaced in the parameter description). The branches
 * deliberately allow extra keys, so legacy {form,…} payloads and output
 * snapshots (re/im plus mag/ang/kind) still match by key presence — the
 * runtime unwrapper reads re/im or mag/ang and ignores everything else.
 * Angles are radians (SI).
 */
export function createValueParam<const U extends QuantityKind>(kind: U, description: string): {
  oneOf: [
    { type: 'number'; description: string },
    {
      type: 'object'
      additionalProperties: true
      description: string
      properties: {
        re: { type: 'number'; description: string; required: true }
        im: { type: 'number'; description: string; required: true }
      }
    },
    {
      type: 'object'
      additionalProperties: true
      description: string
      properties: {
        mag: { type: 'number'; description: string; required: true }
        ang: { type: 'number'; description: string; required: true }
      }
    },
  ]
} {
  return {
    oneOf: [
      { type: 'number', description },
      {
        type: 'object',
        additionalProperties: true,
        description,
        properties: {
          re: { type: 'number', description: 'real part in base SI units', required: true },
          im: { type: 'number', description: 'imaginary part in base SI units (0 for real values)', required: true },
        },
      },
      {
        type: 'object',
        additionalProperties: true,
        description,
        properties: {
          mag: { type: 'number', description: 'magnitude in base SI units', required: true },
          ang: { type: 'number', description: 'phase angle in radians', required: true },
        },
      },
    ],
  }
}

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
    /** Declared return shape for record-side kind tagging (optional; omitted = any). */
    returns?: ToolReturns
    execute: (args: InferArgs<S>, exec: ToolRunContext) => JsonValue | Promise<JsonValue>
  },
) {
  // `returns` is plugin metadata for the record layer — the framework must
  // not see it, so it is stripped before defineTool and stored in TOOL_RETURNS.
  const { returns, ...rest } = options
  if (returns !== undefined) TOOL_RETURNS.set(rest.name, returns)
  return defineTool({
    ...rest,
    execute: async (args, exec) => {
      // One unified failure path at the tool boundary: every failure inside
      // TypeScript is a throw — math kernels and lower layers throw whatever
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

/** Transports a declared tool can be reached over. */
export enum DeclarationTransport {
  Http = 'http',
  File = 'file',
}

/** HTTP verbs supported by the http transport. */
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
  returns?: ToolReturns
  timeoutMs?: number
}

/** http transport options. */
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

/** Clear the dirty bit; the host calls this once the tools are (re)registered at start. */
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

/* ── Compilation ──────────────────────────────────────────────────────────── */

/** Resolve a lowercase kind name to its QuantityKind member. */
export function kindByName(name: string): QuantityKind {
  const index = QUANTITY_KIND_NAMES.indexOf(name)
  if (index === -1) throw new ToolError(`unknown kind "${name}"`)
  return Object.values(QuantityKind)[index] as QuantityKind
}

/** Common optional keys carried by every compiled parameter. */
function withOptions(spec: { description?: string; required?: boolean }, schema: Record<string, unknown>): Record<string, unknown> {
  if (spec.description !== undefined) schema.description = spec.description
  if (spec.required === true) schema.required = true
  return schema
}

/** Build one parameter schema; array items recurse. */
function buildOne(spec: DeclarationParamSpec): Record<string, unknown> {
  switch (spec.type) {
    case DeclarationParamType.Quantity:
      return {
        ...createValueParam(kindByName(spec.kind), spec.description ?? ''),
      }
    case DeclarationParamType.String: {
      const schema: Record<string, unknown> = { type: 'string' }
      if (spec.enum !== undefined) schema.enum = spec.enum
      return schema
    }
    case DeclarationParamType.Boolean:
      return { type: 'boolean' }
    case DeclarationParamType.Array:
      return { type: 'array', items: buildOne(spec.items) }
  }
}

/** Build the dsh parameters spec: quantity params encode to the oneOf shape. */
function buildParameters(declaration: ToolDeclaration): Record<string, unknown> {
  const parameters: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(declaration.parameters)) {
    parameters[key] = withOptions(spec, buildOne(spec))
  }
  return parameters
}

/** Compile one declaration into a tool definition (registration happens at plugin start). */
export function compileDeclaration(declaration: ToolDeclaration): ReturnType<typeof defineJsonTool> {
  // Dynamic schemas cannot be inferred statically; the generic is widened on purpose.
  return defineJsonTool({
    name: declaration.name,
    description: declaration.description,
    parameters: buildParameters(declaration),
    returns: declaration.returns,
    execute: makeExecutor(declaration),
  } as never)
}

/** Pick the transport executor for a declaration (the discriminant narrows the options). */
export function makeExecutor(
  declaration: ToolDeclaration,
): (args: Record<string, JsonValue | undefined>, exec: ToolRunContext) => Promise<JsonValue> {
  const timeoutMs = declaration.timeoutMs ?? 30000
  switch (declaration.transport) {
    case DeclarationTransport.Http:
      return (args, exec) => executeHttp(declaration.parameters, declaration.transportOptions, timeoutMs, args, exec)
    case DeclarationTransport.File:
      return (args, exec) => executeFile(declaration.parameters, declaration.transportOptions, timeoutMs, args, exec)
  }
}

/* ── Transports (http / file) ─────────────────────────────────────────────── */

/** Build the envelope body from the validated args (params are flat keys). */
function envelope(args: Record<string, JsonValue | undefined>): Record<string, JsonValue | undefined> {
  return { requestId: randomUUID(), ...args }
}

/** Result convention: pick {requestId, result} out of a raw response body.
 *  An `error` field overrides everything: when present, `result` is ignored
 *  and the error content is raised as the tool failure. */
function readResult(body: unknown, requestId: string): JsonValue {
  if (typeof body !== 'object' || body === null)
    throw new ToolError('the tool response must be a JSON object', ToolErrorCode.ExternalResponse)
  const box = body as { requestId?: unknown; result?: unknown; error?: unknown }
  if (box.requestId !== requestId)
    throw new ToolError(`response requestId mismatch (got ${String(box.requestId)})`, ToolErrorCode.ExternalResponse)
  if ('error' in box) {
    if (typeof box.error !== 'string' || box.error.length === 0)
      throw new ToolError('the tool response "error" field must be a non-empty string', ToolErrorCode.ExternalResponse)
    throw new ToolError(box.error, ToolErrorCode.ExternalError)
  }
  if (!('result' in box))
    throw new ToolError('the tool response must contain a "result" field', ToolErrorCode.ExternalResponse)
  return box.result as JsonValue
}

/** http executor: POST (or GET with query) the envelope and read the JSON body. */
export async function executeHttp(
  _params: DeclarationParameters,
  options: DeclarationHttpOptions,
  timeoutMs: number,
  args: Record<string, JsonValue | undefined>,
  _exec: ToolRunContext,
): Promise<JsonValue> {
  const body = envelope(args)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const request: RequestInit = {
      method: options.method,
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
      body: options.method === DeclarationHttpMethod.Post ? JSON.stringify(body) : undefined,
    }
    const url = options.method === DeclarationHttpMethod.Get
      ? `${options.url}${options.url.includes('?') ? '&' : '?'}${new URLSearchParams(body as Record<string, string>).toString()}`
      : options.url
    const response = await fetch(url, request)
    if (!response.ok) throw new ToolError(`http ${response.status} from ${options.url}`, ToolErrorCode.ExternalHttp)
    const text = await response.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ToolError(`the tool returned non-JSON: ${text.slice(0, 120)}`, ToolErrorCode.ExternalResponse)
    }
    return readResult(parsed, String(body.requestId))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new ToolError(`http request timed out after ${timeoutMs} ms`, ToolErrorCode.ExternalTimeout)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** file executor: write <dir>/<inPrefix>.<requestId>.json, poll for
 *  <dir>/<outPrefix>.<requestId>.json, then clean both up. */
export async function executeFile(
  _params: DeclarationParameters,
  options: DeclarationFileOptions,
  timeoutMs: number,
  args: Record<string, JsonValue | undefined>,
  _exec: ToolRunContext,
): Promise<JsonValue> {
  const requestId = randomUUID()
  const inPrefix = options.inPrefix ?? 'in'
  const outPrefix = options.outPrefix ?? 'out'
  const inFile = join(options.directory, `${inPrefix}.${requestId}.json`)
  const outFile = join(options.directory, `${outPrefix}.${requestId}.json`)
  const pollMs = Math.max(20, options.pollMs ?? 200)
  mkdirSync(options.directory, { recursive: true })
  writeFileSync(inFile, JSON.stringify({ requestId, ...args }), 'utf8')
  const deadline = Date.now() + timeoutMs
  try {
    for (;;) {
      if (existsSync(outFile)) {
        let parsed: unknown
        try {
          parsed = JSON.parse(readFileSync(outFile, 'utf8'))
        } catch (error) {
          throw new ToolError(
            `the tool wrote an unreadable out file: ${error instanceof Error ? error.message : String(error)}`,
            ToolErrorCode.ExternalResponse,
          )
        }
        return readResult(parsed, requestId)
      }
      if (Date.now() > deadline)
        throw new ToolError(
          `file transport timed out after ${timeoutMs} ms (no ${outPrefix}.* file appeared)`,
          ToolErrorCode.ExternalTimeout,
        )
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  } finally {
    for (const file of [inFile, outFile]) {
      try {
        rmSync(file, { force: true })
      } catch {
        // best effort cleanup
      }
    }
  }
}
