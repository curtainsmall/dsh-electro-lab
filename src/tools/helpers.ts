/**
 * Shared tool-building helpers: literal-typed parameter schema builders so
 * DefineToolOptions inference keeps precise argument types, and a thin
 * defineTool wrapper with a consistent JSON output contract.
 */
import { defineTool, type DefineToolOptions, type InferArgs, type ParameterSchemaSpec, type ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

/** Scalar parameter accepting a number (base units) or string with SI prefix ("1.5nF"). */
export function quantityParam(description: string): {
  oneOf: [
    { type: 'number'; description: string },
    { type: 'string'; description: string },
  ]
} {
  return {
    oneOf: [
      { type: 'number', description: 'value in base SI units (e.g. 1000 for 1 kHz)' },
      { type: 'string', description: `value with optional SI prefix and unit (e.g. "1k", "1kHz") — ${description}` },
    ],
  }
}

/** Complex parameter accepting { re, im }, a string ("50+50j", "5∠53.13°"), or a number. */
export function complexParam(description: string): {
  oneOf: [
    {
      type: 'object'
      description: string
      additionalProperties: false
      properties: {
        re: { type: 'number'; description: string; required: true }
        im: { type: 'number'; description: string; required: true }
      }
    },
    { type: 'string'; description: string },
    { type: 'number'; description: string },
  ]
} {
  return {
    oneOf: [
      {
        type: 'object',
        description: 'rectangular complex value',
        additionalProperties: false,
        properties: {
          re: { type: 'number', description: 'real part', required: true },
          im: { type: 'number', description: 'imaginary part', required: true },
        },
      },
      { type: 'string', description: `complex value — "a+bj", "r∠θ°", optionally with unit — ${description}` },
      { type: 'number', description: `real value — ${description}` },
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
 * contract the registry expects.
 */
export function defineJsonTool<S extends ParameterSchemaSpec>(
  options: Omit<DefineToolOptions<S, { type: 'json' }>, 'output' | 'execute'> & {
    execute: (args: InferArgs<S>) => JsonValue | Promise<JsonValue>
  },
) {
  return defineTool({
    ...options,
    execute: (args, exec) => Promise.resolve(options.execute(args)),
    output: {
      schema: { type: 'json' },
      render: (args, value) => renderText(value as JsonValue),
    },
  })
}
