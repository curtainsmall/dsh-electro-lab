/**
 * Shared tool-building helpers: the JSON-and-complex IO parameter schema,
 * the JSON output contract, and a thin defineTool wrapper.
 */
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Unit } from '../math/units.ts'

/**
 * The one parameter shape: a self-describing value, enum-union of three
 * mutually exclusive forms (rect | polar-degrees | polar-radians). The
 * expected unit is baked into each branch as an enum and the form into
 * consts, so mismatches fail framework validation before execute runs.
 */
export function valueParam<const U extends Unit>(unit: U, description: string): {
  oneOf: [
    {
      type: 'object'
      additionalProperties: false
      description: string
      properties: {
        form: { type: 'string'; const: 'rect'; description: string; required: true }
        re: { type: 'number'; description: string; required: true }
        im: { type: 'number'; description: string; required: true }
        unit: { type: 'string'; enum: [U]; description: string; required: true }
      }
    },
    {
      type: 'object'
      additionalProperties: false
      description: string
      properties: {
        form: { type: 'string'; const: 'polar'; description: string; required: true }
        mag: { type: 'number'; description: string; required: true }
        angDeg: { type: 'number'; description: string; required: true }
        unit: { type: 'string'; enum: [U]; description: string; required: true }
      }
    },
    {
      type: 'object'
      additionalProperties: false
      description: string
      properties: {
        form: { type: 'string'; const: 'polar'; description: string; required: true }
        mag: { type: 'number'; description: string; required: true }
        angRad: { type: 'number'; description: string; required: true }
        unit: { type: 'string'; enum: [U]; description: string; required: true }
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
          form: { type: 'string', const: 'rect', description: 'rectangular form', required: true },
          re: { type: 'number', description: 'real part in base SI units', required: true },
          im: { type: 'number', description: 'imaginary part in base SI units (0 for real values)', required: true },
          unit: { type: 'string', enum: [unit], description: `unit (fixed): ${unit}`, required: true },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
          form: { type: 'string', const: 'polar', description: 'polar form', required: true },
          mag: { type: 'number', description: 'mag in base SI units', required: true },
          angDeg: { type: 'number', description: 'phase angle in degrees', required: true },
          unit: { type: 'string', enum: [unit], description: `unit (fixed): ${unit}`, required: true },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
          form: { type: 'string', const: 'polar', description: 'polar form', required: true },
          mag: { type: 'number', description: 'mag in base SI units', required: true },
          angRad: { type: 'number', description: 'phase angle in radians', required: true },
          unit: { type: 'string', enum: [unit], description: `unit (fixed): ${unit}`, required: true },
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
    execute: (args: InferArgs<S>, exec: ToolRunContext) => JsonValue | Promise<JsonValue>
  },
) {
  return defineTool({
    ...options,
    execute: (args, exec) => Promise.resolve(options.execute(args, exec)),
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderText(value as JsonValue),
    },
  })
}
