/**
 * Compile an external tool declaration into a real tool definition: quantity
 * parameters are encoded into the framework's oneOf shape (createValueParam
 * output), returns pass through unchanged (ToolReturns), and the execute is
 * the transport executor for the declaration's transport.
 */
import { createValueParam, defineJsonTool } from '../tools/helpers.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { makeExecutor } from './transports.ts'
import { ExternalParamType, QUANTITY_KIND_NAMES, type ExternalParamSpec, type ExternalToolConfig } from './types.ts'

/** Resolve a lowercase kind name to its QuantityKind member. */
export function kindByName(name: string): QuantityKind {
  const index = QUANTITY_KIND_NAMES.indexOf(name)
  if (index === -1) throw new Error(`unknown kind "${name}"`)
  return Object.values(QuantityKind)[index] as QuantityKind
}

/** Common optional keys carried by every compiled parameter. */
function withOptions(spec: { description?: string; required?: boolean }, schema: Record<string, unknown>): Record<string, unknown> {
  if (spec.description !== undefined) schema.description = spec.description
  if (spec.required === true) schema.required = true
  return schema
}

/** Build one parameter schema; array items recurse. */
function buildOne(spec: ExternalParamSpec): Record<string, unknown> {
  switch (spec.type) {
    case ExternalParamType.Quantity:
      return {
        ...createValueParam(kindByName(spec.kind), spec.description ?? ''),
      }
    case ExternalParamType.String: {
      const schema: Record<string, unknown> = { type: 'string' }
      if (spec.enum !== undefined) schema.enum = spec.enum
      return schema
    }
    case ExternalParamType.Boolean:
      return { type: 'boolean' }
    case ExternalParamType.Array:
      return { type: 'array', items: buildOne(spec.items) }
  }
}

/** Build the dsh parameters spec: quantity params encode to the oneOf shape. */
function buildParameters(config: ExternalToolConfig): Record<string, unknown> {
  const parameters: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(config.parameters)) {
    parameters[key] = withOptions(spec, buildOne(spec))
  }
  return parameters
}

/** Compile one declaration into a tool definition (registration happens at plugin start). */
export function compileExternalTool(config: ExternalToolConfig): ReturnType<typeof defineJsonTool> {
  // Dynamic schemas cannot be inferred statically; the generic is widened on purpose.
  return defineJsonTool({
    name: config.name,
    description: config.description,
    parameters: buildParameters(config),
    returns: config.returns,
    execute: makeExecutor(config),
  } as never)
}
