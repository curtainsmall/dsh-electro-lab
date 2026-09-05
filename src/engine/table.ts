/**
 * Variable table (engine variable table).
 * Slots = { name, typed value, rev }: a kind is pinned on first write and immutable; overwrites must carry the same kind;
 * rev starts at 1 and +1 per same-kind overwrite; a rebuild after delete (set null) = rev 1.
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import type { TypedValue } from './values.ts'

export interface Slot {
  value: TypedValue
  rev: number
}

export class VariableTable {
  private slots = new Map<string, Slot>()

  /** A slot's semantic identity: number/complex use kind; other types use type (string/boolean/array/object). */
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

  /** Write a slot: new slot rev 1; same-identity overwrite rev+1; a different identity is rejected and does not advance. */
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

  /** Delete a slot: idempotent when absent (returns false); returns true when present. */
  delete(name: string): boolean {
    return this.slots.delete(name)
  }

  /** All current slots (in insertion order). */
  entries(): Array<[string, Slot]> {
    return [...this.slots.entries()]
  }

  clear(): void {
    this.slots.clear()
  }
}
