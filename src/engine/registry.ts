/**
 * 函数注册表（引擎 fn registry）——蓝图 §3。
 * registerFn 替代 defineJsonTool 注册路径：spec 即校验器，run 指向内核。
 * returns 必填且显式：spec 或 null（= void）；缺失 = 注册错误。
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import type { Parameters } from './values.ts'
import type { DeclarationTransport, DeclarationHttpOptions, DeclarationFileOptions } from '../tool.ts'

/** 外部 fn 的接线块：引擎见它即自动包 http/file 执行器作 run。 */
export interface ExternalBlock {
  transport: DeclarationTransport
  transportOptions: DeclarationHttpOptions | DeclarationFileOptions
  timeoutMs?: number
}

export interface FnDef {
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

export class FnRegistry {
  private fns = new Map<string, FnDef>()

  register(fn: FnDef): void {
    if (!NAME_PATTERN.test(fn.id)) throw new ToolError(`fn id "${fn.id}" must match ^[a-z][a-z0-9_]{0,63}$`, ToolErrorCode.EngineArgs)
    if (fn.returns === undefined) throw new ToolError(`fn "${fn.id}" needs an explicit returns (a spec or null for void)`, ToolErrorCode.RegisterMissingReturns)
    if (this.fns.has(fn.id)) throw new ToolError(`fn "${fn.id}" is already registered`, ToolErrorCode.RegisterDuplicate)
    this.fns.set(fn.id, fn)
  }

  get(id: string): FnDef | undefined {
    return this.fns.get(id)
  }

  require(id: string): FnDef {
    const fn = this.fns.get(id)
    if (fn === undefined) throw new ToolError(`unknown fn "${id}"`, ToolErrorCode.EngineUnknownFn)
    return fn
  }

  ids(): string[] {
    return [...this.fns.keys()]
  }

  clear(): void {
    this.fns.clear()
  }
}

export type { SpecOrVoid }
