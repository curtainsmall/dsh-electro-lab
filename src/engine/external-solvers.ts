/**
 * External solver direct registration: declaration archive row → SolverDef (external block), with no compile/translation layer.
 * parameters/returns use the same spec language; returns is explicit (a spec or null = void);
 * a missing one or an unmappable any → report and skip.
 */
import type { SolverDef, ExternalBlock } from './registry.ts'
import { isKind, type Spec } from './values.ts'
import { DeclarationParamType } from '../tool.ts'
import type { DeclarationParamSpec, ToolDeclaration, ToolReturns } from '../tool.ts'

function specFromParam(param: DeclarationParamSpec, path: string): Spec {
  switch (param.type) {
    case DeclarationParamType.Quantity:
      if (!isKind(param.kind)) throw new Error(`${path}: unknown kind "${param.kind}"`)
      return { type: 'quantity', kind: param.kind }
    case DeclarationParamType.String:
      return param.enum === undefined ? { type: 'string' } : { type: 'string', enum: param.enum }
    case DeclarationParamType.Boolean:
      return { type: 'boolean' }
    case DeclarationParamType.Array:
      return { type: 'array', items: specFromParam(param.items, `${path}.items`) }
  }
}

/** returns → engine spec; null = void (explicit); a missing or unmappable any → throw and skip. */
function specFromReturns(returns: ToolReturns | null | undefined, path: string): Spec | null {
  if (returns === null) return null
  if (returns === undefined) throw new Error(`${path}: a declaration needs an explicit returns (a spec, or null for void)`)
  return specFromLeaf(returns, path)
}

/** Non-void leaf (recursive use; null/missing cannot appear at nested sites). */
function specFromLeaf(returns: ToolReturns, path: string): Spec {
  switch (returns.type) {
    case 'any':
      throw new Error(`${path}: returns "any" cannot be mapped to a typed spec`)
    case 'string':
      return { type: 'string' }
    case 'boolean':
      return { type: 'boolean' }
    case 'number':
      return { type: 'quantity', kind: returns.kind }
    case 'complex':
      return { type: 'quantity', kind: returns.kind, form: 'either' }
    case 'object': {
      const fields: Record<string, Spec> = {}
      for (const [key, field] of Object.entries(returns.fields)) fields[key] = specFromLeaf(field, `${path}.fields.${key}`)
      return { type: 'object', fields }
    }
    case 'array':
      return { type: 'array', items: specFromLeaf(returns.items, `${path}.items`) }
  }
}

/** Archive row → SolverDef. Unmappable cases (missing/any returns, bad parameters) return null or throw; the caller warns and skips. */
export function compileExternalSolver(declaration: ToolDeclaration): SolverDef | null {
  const parameters: Record<string, Spec> = {}
  for (const [key, param] of Object.entries(declaration.parameters)) {
    parameters[key] = specFromParam(param, `parameter "${key}"`)
  }
  const returns = specFromReturns(declaration.returns, `declaration "${declaration.name}"`)
  const external: ExternalBlock = {
    transport: declaration.transport,
    transportOptions: declaration.transportOptions,
    ...(declaration.timeoutMs === undefined ? {} : { timeoutMs: declaration.timeoutMs }),
  }
  return {
    id: declaration.name,
    summary: declaration.description,
    parameters,
    returns,
    run: () => {
      throw new Error('external solver runs through the transport — this run is never called')
    },
    external,
  }
}
