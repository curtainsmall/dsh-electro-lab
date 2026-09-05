/**
 * Engine.
 * Global singleton: variable table + solver registry + record storage + a single open lifecycle.
 * Primitives (set/get/call) and markers execute through it; every step appends one trace row (with inputs and outputs).
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import { VariableTable } from './table.ts'
import { SolverRegistry, type SolverDef } from './registry.ts'
import { RecordStore, type IndexRow, type TraceRow } from './storage.ts'
import { callExternal } from './external.ts'
import {
  fromNative, isSlotValue, refPath, toCanonical, validateAgainstSpec, validateValue,
  type Spec, type TypedValue,
} from './values.ts'

export type Receipt = { ok: true; [key: string]: unknown } | { ok: false; code: ToolErrorCode; error: string }

interface OpenState {
  id: string
  seq: number
  question: string
  openedAt: number
}

export class Engine {
  readonly table = new VariableTable()
  readonly registry = new SolverRegistry()
  readonly store: RecordStore
  private open: OpenState | null = null

  constructor(home: string) {
    this.store = new RecordStore(home)
  }

  /** Start: clear orphans; if a record with sealedAt null and a body exists, recover it (continue the same file, rebuild the table). */
  start(): void {
    this.store.clearOrphans()
    const row = this.store.readIndex().find((item) => item.sealedAt === null && this.store.hasRecord(item.id))
    if (row === undefined) return
    const rows = this.store.readRows(row.id)
    this.replayInto(rows)
    const lastSeq = rows.reduce((max, item) => Math.max(max, typeof item.seq === 'number' ? item.seq : 0), 0)
    this.open = { id: row.id, seq: lastSeq, question: row.question, openedAt: row.openedAt }
  }

  indexRows(): IndexRow[] {
    return this.store.readIndex()
  }

  isOpen(): boolean {
    return this.open !== null
  }

  openId(): string | null {
    return this.open?.id ?? null
  }

  /** Rebuild engine state: set/call/set-null are applied per row; markers are skipped. */
  private replayInto(rows: TraceRow[]): void {
    for (const row of rows) {
      if (row.ok !== true) continue
      if (row.tool === 'set') {
        if (row.deleted === true) this.table.delete(String(row.name))
        else this.table.set(String(row.name), row.value as TypedValue)
      } else if (row.tool === 'call') {
        if (row.result !== null && row.result !== undefined && typeof row.target === 'string') {
          this.table.set(row.target, row.result as TypedValue)
        }
      }
    }
  }

  private nextSeq(): number {
    if (this.open === null) return 1
    this.open.seq += 1
    return this.open.seq
  }

  private requireOpen(): OpenState {
    if (this.open === null) throw new ToolError('no open record — call record_question first', ToolErrorCode.SlotUndeclared)
    return this.open
  }

  private trace(row: Omit<TraceRow, 'seq' | 'at'>): void {
    const open = this.requireOpen()
    const line = { seq: this.nextSeq(), at: Date.now() } as TraceRow
    Object.assign(line, row)
    this.store.appendRow(open.id, line)
  }

  /* ── markers (lifecycle) ─────────────────────────────────────────────── */

  /** record_question: if open exists, seal it (duplicate-start) then open a new one. */
  markerQuestion(text: string): Receipt {
    if (this.open !== null) this.sealDuplicateStart()
    const created = this.store.createRecord(text)
    this.open = { id: created.id, seq: 0, question: text, openedAt: created.openedAt }
    this.trace({ tool: 'marker', kind: 'question', ok: true, text })
    return { ok: true, record: this.open.id }
  }

  markerAnalyse(text: string): Receipt {
    this.requireOpen()
    this.trace({ tool: 'marker', kind: 'analyse', ok: true, text })
    return { ok: true }
  }

  /** record_answer: submit the text and settle; no open record → duplicate-end error record. */
  markerAnswer(text: string): Receipt {
    if (this.open === null) {
      const created = this.store.createRecord('')
      this.open = { id: created.id, seq: 0, question: '', openedAt: created.openedAt }
      this.trace({ tool: 'seal', kind: 'duplicate-end', ok: true })
      this.store.updateIndex(created.id, { sealedAt: Date.now() })
      const id = this.open.id
      this.open = null
      return { ok: true, record: id, error: 'duplicate-end' }
    }
    this.trace({ tool: 'marker', kind: 'answer', ok: true, text })
    const id = this.open.id
    this.store.updateIndex(id, { sealedAt: Date.now() })
    this.open = null
    return { ok: true, record: id }
  }

  private sealDuplicateStart(): void {
    if (this.open === null) return
    this.trace({ tool: 'seal', kind: 'duplicate-start', ok: true })
    this.store.updateIndex(this.open.id, { sealedAt: Date.now() })
    this.open = null
  }

  /* ── set / get / call ────────────────────────────────────────────────── */

  opSet(name: string, value: unknown): Receipt {
    try {
      this.validateName(name)
      if (value === null) {
        const deleted = this.table.delete(name)
        this.trace({ tool: 'set', ok: true, name, value: null, deleted })
        return { ok: true, name, deleted }
      }
      if (isSlotValue(value)) {
        throw new ToolError('set: slot references cannot be stored — resolve them through call arguments', ToolErrorCode.InvalidArgs)
      }
      const error = validateValue(value)
      if (error !== undefined) throw new ToolError(`set: ${error}`, ToolErrorCode.InvalidArgs)
      const typed = value as TypedValue
      const slot = this.table.set(name, typed)
      this.trace({ tool: 'set', ok: true, name, value: typed, rev: slot.rev })
      return { ok: true, name, rev: slot.rev }
    } catch (error) {
      return this.failure('set', error)
    }
  }

  opGet(name: string): Receipt {
    try {
      const slot = this.table.get(name)
      if (slot === undefined) throw new ToolError(`slot "${name}" is not declared`, ToolErrorCode.SlotUndeclared)
      this.trace({ tool: 'get', ok: true, name, value: slot.value })
      return { ok: true, name, value: slot.value }
    } catch (error) {
      return this.failure('get', error)
    }
  }

  /** Inspect one solver: its exact signature from the registry, traced as its own row. */
  opInfo(solverId: string): Receipt {
    try {
      const solver = this.registry.require(solverId)
      this.trace({ tool: 'solver_info', ok: true, solver: solverId })
      // Specs are plain JSON by design; round-trip them so the receipt carries plain data.
      const signature = JSON.parse(JSON.stringify({ parameters: solver.parameters, returns: solver.returns })) as {
        parameters: unknown
        returns: unknown
      }
      return { ok: true, solver: solver.id, summary: solver.summary, parameters: signature.parameters, returns: signature.returns }
    } catch (error) {
      return this.failure('solver_info', error)
    }
  }

  async opCall(solverId: string, rawArgs: Record<string, unknown> | undefined, target: string | null): Promise<Receipt> {
    const args: Record<string, unknown> = rawArgs ?? {}
    try {
      const solver = this.registry.require(solverId)
      const { resolved, native } = this.resolveArgs(solver, args)
      if (solver.returns === null) {
        if (target !== null) throw new ToolError(`solver "${solverId}" returns void — target must be null`, ToolErrorCode.VoidTarget)
        await this.runVoid(solver, resolved, native)
        this.trace({ tool: 'call', ok: true, solver: solverId, args, resolved, result: null, target: null })
        return { ok: true, target: null }
      }
      if (target === null) throw new ToolError(`solver "${solverId}" returns a value — a named target is required`, ToolErrorCode.TargetRequired)
      const result = await this.execute(solver, resolved, native)
      const slot = this.table.set(target, result)
      this.trace({ tool: 'call', ok: true, solver: solverId, args, resolved, result, target, rev: slot.rev })
      return { ok: true, target, rev: slot.rev }
    } catch (error) {
      return this.failure('call', error)
    }
  }

  private async runVoid(solver: SolverDef, resolved: Record<string, TypedValue>, native: Record<string, unknown>): Promise<void> {
    try {
      if (solver.external !== undefined) {
        const result = await callExternal(solver.external, resolved)
        if (result !== null) throw new ToolError(`solver "${solver.id}" is void but the endpoint returned a result`, ToolErrorCode.ExternalResponse)
        return
      }
      await solver.run(native)
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.SolverFailed)
    }
  }

  /** Resolve args: expand slot references + validate typed values + kind/shape checks + conversion (resolved = SI rect endpoint). */
  private resolveArgs(solver: SolverDef, args: Record<string, unknown>): { resolved: Record<string, TypedValue>; native: Record<string, unknown> } {
    const resolved: Record<string, TypedValue> = {}
    const native: Record<string, unknown> = {}
    const missing: string[] = []
    for (const [name, spec] of Object.entries(solver.parameters)) {
      const raw = args[name]
      if (raw === undefined) {
        if (spec.optional === true) continue
        missing.push(`${name}: ${describeSpec(spec)}`)
        continue
      }
      const typed = this.resolveValue(raw, name, spec)
      const error = validateAgainstSpec(spec, typed, `argument "${name}"`)
      if (error !== undefined) throw new ToolError(`solver "${solver.id}": ${error}`, ToolErrorCode.KindMismatch)
      const canonical = toCanonical(typed)
      resolved[name] = canonical
      native[name] = nativeValue(spec, canonical)
    }
    if (missing.length > 0) {
      throw new ToolError(`solver "${solver.id}" is missing required arguments: ${missing.join(', ')}`, ToolErrorCode.InvalidArgs)
    }
    return { resolved, native }
  }

  /** One argument value: a slot reference ({type: 'slot', value: full path}) or a typed-value literal. */
  private resolveValue(raw: unknown, name: string, spec: Spec): TypedValue {
    if (isSlotValue(raw)) {
      const reference = raw.value
      const dot = reference.indexOf('.')
      const slotName = dot === -1 ? reference : reference.slice(0, dot)
      const path = dot === -1 ? undefined : reference.slice(dot + 1)
      const slot = this.table.get(slotName)
      if (slot === undefined) throw new ToolError(`argument "${name}": slot "${slotName}" is not declared`, ToolErrorCode.SlotUndeclared)
      return refPath(slot.value, path)
    }
    const error = validateValue(raw)
    if (error !== undefined) {
      const hint = typeof raw === 'string' && raw.startsWith('@')
        ? ' — "@name" strings are no longer references: pass { "type": "slot", "value": "name" }'
        : ''
      throw new ToolError(`argument "${name}": ${error}; expected ${describeSpec(spec)}${hint}`, ToolErrorCode.InvalidArgs)
    }
    return raw as TypedValue
  }

  /** Run a non-void solver (local run or external transport); shape the result per its returns spec. */
  private async execute(solver: SolverDef, resolved: Record<string, TypedValue>, native: Record<string, unknown>): Promise<TypedValue> {
    const spec = solver.returns
    if (spec === null) throw new ToolError(`solver "${solver.id}" is void`, ToolErrorCode.InvalidArgs)
    let raw: unknown
    try {
      if (solver.external !== undefined) {
        const result = await callExternal(solver.external, resolved)
        if (result === null) throw new ToolError(`solver "${solver.id}" is not void but the endpoint returned result: null`, ToolErrorCode.ExternalResponse)
        const error = validateAgainstSpec(spec, result, `solver "${solver.id}" result`)
        if (error !== undefined) throw new ToolError(`solver "${solver.id}": ${error}`, ToolErrorCode.ExternalResponse)
        return result
      }
      raw = await solver.run(native)
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.SolverFailed)
    }
    try {
      return fromNative(spec, raw, `solver "${solver.id}" result`)
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.SolverFailed)
    }
  }

  private validateName(name: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ToolError(`slot name "${name}" must match ^[A-Za-z_][A-Za-z0-9_]*$`, ToolErrorCode.InvalidArgs)
  }

  private failure(tool: string, error: unknown): Receipt {
    const code = error instanceof ToolError ? error.code : ToolErrorCode.Tool
    const message = error instanceof Error ? error.message : String(error)
    if (this.open !== null) {
      this.trace({ tool, ok: false, code, error: message })
    }
    return { ok: false, code, error: message }
  }
}

/** Compact human description of a spec, used in failure receipts so the model can self-correct. */
function describeSpec(spec: Spec): string {
  switch (spec.type) {
    case 'quantity':
      return `quantity(${spec.kind})${spec.form === undefined ? '' : ` ${spec.form}`}`
    case 'string':
      return spec.enum === undefined ? 'string' : `string(${spec.enum.join('|')})`
    case 'boolean':
      return 'boolean'
    case 'array':
      return `array of ${describeSpec(spec.items)}`
    case 'object':
      return `object with fields {${Object.keys(spec.fields).join(', ')}}`
  }
}

/** resolved typed value → kernel-native JS (quantity reals become number, complex per the declared form; the rest recurse). */
function nativeValue(spec: Spec, canonical: TypedValue): unknown {
  switch (spec.type) {
    case 'quantity': {
      if (canonical.type === 'number') return canonical.value
      const rect = canonical.value as { re: number; im: number }
      return spec.form === 'mag-ang'
        ? { mag: Math.hypot(rect.re, rect.im), ang: Math.atan2(rect.im, rect.re) }
        : rect
    }
    case 'string':
    case 'boolean':
      return canonical.value
    case 'array': {
      if (canonical.type !== 'array') return canonical.value
      return canonical.value.map((item) => nativeValue(spec.items, item))
    }
    case 'object': {
      if (canonical.type !== 'object') return canonical.value
      const out: Record<string, unknown> = {}
      for (const [key, fieldSpec] of Object.entries(spec.fields)) {
        const field = canonical.value[key]
        if (field !== undefined) out[key] = nativeValue(fieldSpec, field)
      }
      return out
    }
  }
}
