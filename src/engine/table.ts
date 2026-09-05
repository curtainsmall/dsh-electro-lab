/**
 * 变量表（引擎 variable table）——蓝图 §4。
 * 槽 = { name, 类型化值, rev }：kind 首次钉死后不可变，覆盖须同 kind；
 * rev 从 1 起，每次同 kind 覆盖 +1；删除（set null）后重建 = rev 1。
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import type { TypedValue } from './values.ts'

export interface Slot {
  value: TypedValue
  rev: number
}

export class VariableTable {
  private slots = new Map<string, Slot>()

  /** 槽的语义身份：number/complex 用 kind；其它类型用 type（string/boolean/array/object）。 */
  static identity(value: TypedValue): string {
    if (value.type === 'number' || value.type === 'complex') return `${value.type}:${value.kind}`
    return value.type
  }

  get(name: string): Slot | undefined {
    return this.slots.get(name)
  }

  has(name: string): boolean {
    return this.slots.has(name)
  }

  /** 写槽：新槽 rev 1；同 identity 覆盖 rev+1；异 identity 拒绝且不推进。 */
  set(name: string, value: TypedValue): Slot {
    const existing = this.slots.get(name)
    if (existing === undefined) {
      const slot = { value, rev: 1 }
      this.slots.set(name, slot)
      return slot
    }
    if (VariableTable.identity(existing.value) !== VariableTable.identity(value)) {
      throw new ToolError(`slot "${name}" is pinned to ${VariableTable.identity(existing.value)}, got ${VariableTable.identity(value)}`, ToolErrorCode.EngineKindMismatch)
    }
    const slot = { value, rev: existing.rev + 1 }
    this.slots.set(name, slot)
    return slot
  }

  /** 删除槽：不存在幂等（返回 false）；存在返回 true。 */
  delete(name: string): boolean {
    return this.slots.delete(name)
  }

  /** 当前全部槽（按插入序）。 */
  entries(): Array<[string, Slot]> {
    return [...this.slots.entries()]
  }

  clear(): void {
    this.slots.clear()
  }
}
