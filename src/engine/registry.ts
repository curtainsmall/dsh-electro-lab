/**
 * Solver registry (engine solver registry).
 * register replaces the defineJsonTool registration path: the spec is the validator, run points at the kernel.
 * returns is required and explicit: a spec or null (= void); a missing one = registration error.
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import type { Parameters } from './values.ts'
import type { DeclarationTransport, DeclarationHttpOptions, DeclarationFileOptions } from '../tool.ts'

/** An external solver's wiring block: when the engine sees one, it automatically wraps an http/file executor as its run. */
export interface ExternalBlock {
  transport: DeclarationTransport
  transportOptions: DeclarationHttpOptions | DeclarationFileOptions
  timeoutMs?: number
}

export interface SolverDef {
  id: string
  summary: string
  parameters: Parameters
  /** null = void (explicit). */
  returns: SpecOrVoid
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>
  external?: ExternalBlock
}

import type { Spec } from './values.ts'
type SpecOrVoid = Spec | null

const NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

export class SolverRegistry {
  private solvers = new Map<string, SolverDef>()

  register(solver: SolverDef): void {
    if (!NAME_PATTERN.test(solver.id)) throw new ToolError(`solver id "${solver.id}" must match ^[a-z][a-z0-9_]{0,63}$`, ToolErrorCode.InvalidArgs)
    if (solver.returns === undefined) throw new ToolError(`solver "${solver.id}" needs an explicit returns (a spec or null for void)`, ToolErrorCode.RegisterMissingReturns)
    if (this.solvers.has(solver.id)) throw new ToolError(`solver "${solver.id}" is already registered`, ToolErrorCode.RegisterDuplicate)
    this.solvers.set(solver.id, solver)
  }

  get(id: string): SolverDef | undefined {
    return this.solvers.get(id)
  }

  require(id: string): SolverDef {
    const solver = this.solvers.get(id)
    if (solver === undefined) throw new ToolError(`unknown solver "${id}"`, ToolErrorCode.UnknownSolver)
    return solver
  }

  ids(): string[] {
    return [...this.solvers.keys()]
  }

  clear(): void {
    this.solvers.clear()
  }
}

export type { SpecOrVoid }
