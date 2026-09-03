/**
 * Shared tool-building helpers: the JSON-and-complex IO parameter schema,
 * the JSON output contract, and a thin defineTool wrapper.
 */
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { QuantityKind } from '../math/quantity-kind.ts'
import { Form } from '../math/convert.ts'

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
  /** A plain number or string/boolean passthrough (echo fields etc.). */
  | { type: 'scalar' }
  /** A quantity; the stored value form (number vs {re,im}) is read from the value itself. */
  | { type: 'quantity'; kind: QuantityKind }
  /** A named-fields object; every field declared recursively. */
  | { type: 'object'; fields: Record<string, ToolReturns> }
  /** A homogeneous array; items declared recursively. */
  | { type: 'array'; item: ToolReturns }

/** Declared return shapes keyed by tool name — the record layer reads these when settling a result. */
export const TOOL_RETURNS = new Map<string, ToolReturns>()

/**
 * The one parameter shape: a self-describing value, enum-union of two
 * mutually exclusive forms (rect | polar-radians). The expected kind is
 * baked into each branch as an enum and the form into consts, so mismatches
 * fail framework validation before execute runs. Angles are radians (SI).
 */
export function createValueParam<const U extends QuantityKind>(kind: U, description: string): {
  oneOf: [
    {
      type: 'object'
      additionalProperties: false
      description: string
      properties: {
        form: { type: 'string'; const: Form.Rect; description: string; required: true }
        re: { type: 'number'; description: string; required: true }
        im: { type: 'number'; description: string; required: true }
        kind: { type: 'string'; enum: [U]; description: string; required: true }
      }
    },
    {
      type: 'object'
      additionalProperties: false
      description: string
      properties: {
        form: { type: 'string'; const: Form.Polar; description: string; required: true }
        mag: { type: 'number'; description: string; required: true }
        ang: { type: 'number'; description: string; required: true }
        kind: { type: 'string'; enum: [U]; description: string; required: true }
      }
    },
  ]
} {
  return {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
          form: { type: 'string', const: Form.Rect, description: 'rectangular form', required: true },
          re: { type: 'number', description: 'real part in base SI units', required: true },
          im: { type: 'number', description: 'imaginary part in base SI units (0 for real values)', required: true },
          kind: { type: 'string', enum: [kind], description: `kind (fixed): ${kind}`, required: true },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
          form: { type: 'string', const: Form.Polar, description: 'polar form', required: true },
          mag: { type: 'number', description: 'mag in base SI units', required: true },
          ang: { type: 'number', description: 'phase angle in radians', required: true },
          kind: { type: 'string', enum: [kind], description: `kind (fixed): ${kind}`, required: true },
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
    execute: (args, exec) => Promise.resolve(options.execute(args, exec)),
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderText(value as JsonValue),
    },
  })
}
