/**
 * solver 注册表（引擎 solver registry）——蓝图 §3。
 * register 替代 defineJsonTool 注册路径：spec 即校验器，run 指向内核。
 * returns 必填且显式：spec 或 null（= void）；缺失 = 注册错误。
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import type { Parameters } from './values.ts'
import type { DeclarationTransport, DeclarationHttpOptions, DeclarationFileOptions } from '../tool.ts'

/** 外部 solver 的接线块：引擎见它即自动包 http/file 执行器作 run。 */
export interface ExternalBlock {
  transport: DeclarationTransport
  transportOptions: DeclarationHttpOptions | DeclarationFileOptions
  timeoutMs?: number
}

export interface SolverDef {
  id: string
  summary: string
  parameters: Parameters
  /** null = void（显式）。 */
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
    if (!NAME_PATTERN.test(solver.id)) throw new ToolError(`solver id "${solver.id}" must match ^[a-z][a-z0-9_]{0,63}$`, ToolErrorCode.EngineArgs)
    if (solver.returns === undefined) throw new ToolError(`solver "${solver.id}" needs an explicit returns (a spec or null for void)`, ToolErrorCode.RegisterMissingReturns)
    if (this.solvers.has(solver.id)) throw new ToolError(`solver "${solver.id}" is already registered`, ToolErrorCode.RegisterDuplicate)
    this.solvers.set(solver.id, solver)
  }

  get(id: string): SolverDef | undefined {
    return this.solvers.get(id)
  }

  require(id: string): SolverDef {
    const solver = this.solvers.get(id)
    if (solver === undefined) throw new ToolError(`unknown solver "${id}"`, ToolErrorCode.EngineUnknownSolver)
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
