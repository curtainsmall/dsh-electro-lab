/**
 * Compile an external tool declaration into a real tool definition, reusing
 * the internal building blocks: value parameters expand through
 * createValueParam, returns pass through unchanged (ToolReturns), and the
 * execute is the transport executor for the declaration's transport.
 */
import { createValueParam, defineJsonTool } from '../tools/helpers.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { makeExecutor } from './transports.ts'
import { QUANTITY_KIND_NAMES, type ExternalToolConfig } from './types.ts'

/** Resolve a lowercase kind name to its QuantityKind member. */
export function kindByName(name: string): QuantityKind {
  const index = QUANTITY_KIND_NAMES.indexOf(name)
  if (index === -1) throw new Error(`unknown kind "${name}"`)
  return Object.values(QuantityKind)[index] as QuantityKind
}

/** Build the dsh parameters spec: JSON value specs expand to createValueParam output. */
function buildParameters(config: ExternalToolConfig): Record<string, unknown> {
  const parameters: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(config.parameters)) {
    if ('kind' in spec) {
      const required = spec.required ?? false
      parameters[key] = {
        ...createValueParam(kindByName(spec.kind as string), spec.description ?? ''),
        ...(required ? { required: true } : {}),
      }
    } else {
      const plain: Record<string, unknown> = { type: spec.type }
      if (spec.enum !== undefined) plain.enum = spec.enum
      if (spec.description !== undefined) plain.description = spec.description
      if (spec.required === true) plain.required = true
      parameters[key] = plain
    }
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
