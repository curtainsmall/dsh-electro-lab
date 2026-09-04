/**
 * Shared tool-building helpers: the JSON-and-complex IO parameter schema,
 * the JSON output contract, and a thin defineTool wrapper.
 */
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { QuantityKind } from '../math/quantity-kind.ts'

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
 * The one tool-failure error. Every plugin tool fails through this channel:
 * built-in math tools raise ordinary errors, manager tools express failures
 * as `{ok:false, error|errors}` result boxes, and external endpoints return
 * an envelope `error` field — whatever the source, the call surfaces as ONE
 * structured error result to the agent and is recorded with its name/code in
 * the record. Codes: `TOOL_ERROR` (default), `EXTERNAL_ERROR` (endpoint
 * reported), `EXTERNAL_HTTP`, `EXTERNAL_TIMEOUT`, `EXTERNAL_RESPONSE`.
 */
export class ToolError extends Error {
  readonly code: string
  constructor(message: string, code = 'TOOL_ERROR') {
    super(message)
    this.name = 'ToolError'
    this.code = code
  }
}

/**
 * Extract the message of one failure box — a result value shaped
 * `{ok: false, error: "…"}` or `{ok: false, errors: ["…", …]}` — or
 * undefined when the value is not a failure box. Any tool that returns such
 * a box (an external endpoint signalling a failed computation, a manager
 * tool refusing a request) is turned into a thrown ToolError by
 * defineJsonTool, so errors never travel as plain values.
 */
export function failureBoxMessage(value: JsonValue): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const box = value as Record<string, unknown>
  if (box.ok !== false) return undefined
  if (typeof box.error === 'string' && box.error.length > 0) return box.error
  if (Array.isArray(box.errors) && box.errors.length > 0 && box.errors.every((item) => typeof item === 'string')) {
    return (box.errors as string[]).join('; ')
  }
  return undefined
}

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
      // One unified failure path: a returned failure box is raised as a
      // ToolError so every tool — built-in, external or manager — fails
      // through the same structured error channel as a thrown error.
      const value = await options.execute(args, exec)
      const message = failureBoxMessage(value)
      if (message !== undefined) throw new ToolError(message)
      return value
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderText(value as JsonValue),
    },
  })
}
