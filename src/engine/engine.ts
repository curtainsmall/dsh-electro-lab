/**
 * 引擎（engine）——蓝图 §0/§2/§4/§5。
 * 全局单实例：变量表 + fn 注册表 + 记录存储 + 单一 open 生命周期。
 * 原语（set/get/call）与 markers 经此执行；每步落一行轨迹（含输入输出）。
 */
import { ToolError, ToolErrorCode } from '../errors.ts'
import { VariableTable } from './table.ts'
import { FnRegistry, type FnDef } from './registry.ts'
import { RecordStore, type IndexRow, type TraceRow } from './storage.ts'
import { callExternal } from './external.ts'
import {
  fromNative, refPath, toCanonical, validateAgainstSpec, validateValue,
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
  readonly registry = new FnRegistry()
  readonly store: RecordStore
  private open: OpenState | null = null

  constructor(home: string) {
    this.store = new RecordStore(home)
  }

  /** 启动：清孤儿；若存在 sealedAt null 且有本体的记录则恢复（续写同文件、重建表）。 */
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

  /** 重建引擎状态：set/call/set-null 按行应用，marker 跳过。 */
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
    if (this.open === null) throw new ToolError('no open record — call record_question first', ToolErrorCode.EngineUndeclared)
    return this.open
  }

  private trace(row: Omit<TraceRow, 'seq' | 'at'>): void {
    const open = this.requireOpen()
    const line = { seq: this.nextSeq(), at: Date.now() } as TraceRow
    Object.assign(line, row)
    this.store.appendRow(open.id, line)
  }

  /* ── markers（生命周期） ─────────────────────────────────────────────── */

  /** record_question：open 已存在则封旧（duplicate-start）再开新。 */
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

  /** record_answer：提交文本并结算；无 open → duplicate-end 错误记录。 */
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
      const error = validateValue(value)
      if (error !== undefined) throw new ToolError(`set: ${error}`, ToolErrorCode.EngineArgs)
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
      if (slot === undefined) throw new ToolError(`slot "${name}" is not declared`, ToolErrorCode.EngineUndeclared)
      this.trace({ tool: 'get', ok: true, name, value: slot.value })
      return { ok: true, name, value: slot.value }
    } catch (error) {
      return this.failure('get', error)
    }
  }

  async opCall(fnId: string, rawArgs: Record<string, unknown> | undefined, target: string | null): Promise<Receipt> {
    const args: Record<string, unknown> = rawArgs ?? {}
    try {
      const fn = this.registry.require(fnId)
      const { resolved, native } = this.resolveArgs(fn, args)
      if (fn.returns === null) {
        if (target !== null) throw new ToolError(`fn "${fnId}" returns void — target must be null`, ToolErrorCode.EngineVoidTarget)
        await this.runVoid(fn, resolved, native)
        this.trace({ tool: 'call', ok: true, fn: fnId, args, resolved, result: null, target: null })
        return { ok: true, target: null }
      }
      if (target === null) throw new ToolError(`fn "${fnId}" returns a value — a named target is required`, ToolErrorCode.EngineTargetRequired)
      const result = await this.execute(fn, resolved, native)
      const slot = this.table.set(target, result)
      this.trace({ tool: 'call', ok: true, fn: fnId, args, resolved, result, target, rev: slot.rev })
      return { ok: true, target, rev: slot.rev }
    } catch (error) {
      return this.failure('call', error)
    }
  }

  private async runVoid(fn: FnDef, resolved: Record<string, TypedValue>, native: Record<string, unknown>): Promise<void> {
    try {
      if (fn.external !== undefined) {
        const result = await callExternal(fn.external, resolved)
        if (result !== null) throw new ToolError(`fn "${fn.id}" is void but the endpoint returned a result`, ToolErrorCode.ExternalResponse)
        return
      }
      await fn.run(native)
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.EngineFnFailed)
    }
  }

  /** 解析 args：@ 引用展开 + 类型化值校验 + kind/形态检查 + 换算（resolved = SI rect 终点）。 */
  private resolveArgs(fn: FnDef, args: Record<string, unknown>): { resolved: Record<string, TypedValue>; native: Record<string, unknown> } {
    const resolved: Record<string, TypedValue> = {}
    const native: Record<string, unknown> = {}
    for (const [name, spec] of Object.entries(fn.parameters)) {
      const raw = args[name]
      if (raw === undefined) {
        if (spec.optional === true) continue
        throw new ToolError(`fn "${fn.id}" is missing argument "${name}"`, ToolErrorCode.EngineArgs)
      }
      const typed = this.resolveValue(raw)
      const error = validateAgainstSpec(spec, typed, `argument "${name}"`)
      if (error !== undefined) throw new ToolError(`fn "${fn.id}": ${error}`, ToolErrorCode.EngineKindMismatch)
      const canonical = toCanonical(typed)
      resolved[name] = canonical
      native[name] = nativeValue(spec, canonical)
    }
    return { resolved, native }
  }

  /** 一个参数值：@name[.path] 引用或类型化值字面量。 */
  private resolveValue(raw: unknown): TypedValue {
    if (typeof raw === 'string' && raw.startsWith('@')) {
      const reference = raw.slice(1)
      const dot = reference.indexOf('.')
      const name = dot === -1 ? reference : reference.slice(0, dot)
      const path = dot === -1 ? undefined : reference.slice(dot + 1)
      const slot = this.table.get(name)
      if (slot === undefined) throw new ToolError(`slot "${name}" is not declared`, ToolErrorCode.EngineUndeclared)
      return refPath(slot.value, path)
    }
    const error = validateValue(raw)
    if (error !== undefined) throw new ToolError(`argument value: ${error}`, ToolErrorCode.EngineArgs)
    return raw as TypedValue
  }

  /** 执行非 void fn（本地 run 或外部传输）；结果按 returns 定型。 */
  private async execute(fn: FnDef, resolved: Record<string, TypedValue>, native: Record<string, unknown>): Promise<TypedValue> {
    const spec = fn.returns
    if (spec === null) throw new ToolError(`fn "${fn.id}" is void`, ToolErrorCode.EngineArgs)
    let raw: unknown
    try {
      if (fn.external !== undefined) {
        const result = await callExternal(fn.external, resolved)
        if (result === null) throw new ToolError(`fn "${fn.id}" is not void but the endpoint returned result: null`, ToolErrorCode.ExternalResponse)
        const error = validateAgainstSpec(spec, result, `fn "${fn.id}" result`)
        if (error !== undefined) throw new ToolError(`fn "${fn.id}": ${error}`, ToolErrorCode.ExternalResponse)
        return result
      }
      raw = await fn.run(native)
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.EngineFnFailed)
    }
    try {
      return fromNative(spec, raw, `fn "${fn.id}" result`)
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error), ToolErrorCode.EngineFnFailed)
    }
  }

  private validateName(name: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ToolError(`slot name "${name}" must match ^[A-Za-z_][A-Za-z0-9_]*$`, ToolErrorCode.EngineArgs)
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

/** resolved 类型化值 → 内核原生 JS（quantity 实数为 number、复数按声明形态；其余递归）。 */
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
