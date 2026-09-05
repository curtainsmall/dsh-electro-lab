import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QuantityKind } from '../../src/math/quantity-kind.ts'
import { Context } from '../../src/machine/machine.ts'
import { VariableTable } from '../../src/machine/table.ts'
import { validateValue } from '../../src/machine/values.ts'

let home = ''

function makeContext(): Context {
  home = mkdtempSync(join(tmpdir(), 'elab-context-'))
  const context = new Context(home)
  context.start()
  return context
}

afterEach(() => {
  if (home.length > 0) rmSync(home, { recursive: true, force: true })
})

describe('值宇宙 validateValue', () => {
  it('接受类型化值并拒绝坏形状', () => {
    expect(validateValue({ type: 'number', value: 100, kind: 'resistance' })).toBeUndefined()
    expect(validateValue({ type: 'number', value: 25, kind: 'temperature', variant: 'degC' })).toBeUndefined()
    expect(validateValue({ type: 'number', value: 1500, kind: 'resistance', prefix: 'kilo' })).toBeUndefined()
    expect(validateValue({ type: 'complex', value: { re: 1, im: 2 }, kind: 'voltage' })).toBeUndefined()
    expect(validateValue({ type: 'complex', value: { mag: 3, ang: 0.5 }, kind: 'voltage' })).toBeUndefined()
    expect(validateValue({ type: 'string', value: 'x' })).toBeUndefined()
    expect(validateValue({ type: 'boolean', value: true })).toBeUndefined()
    expect(validateValue(5)).toMatch(/typed-value/)
    expect(validateValue({ type: 'number', value: 1, kind: 'bogus' })).toMatch(/unknown kind/)
    expect(validateValue({ type: 'number', value: 1, kind: 'resistance', prefix: 'k' })).toMatch(/unknown prefix/)
    expect(validateValue({ type: 'number', value: 1, kind: 'resistance', prefix: 'kilo', variant: 'degC' })).toMatch(/not supported for kind "resistance"/)
    expect(validateValue({ type: 'number', value: 1, kind: 'temperature', variant: 'kelvin' })).toMatch(/not supported for kind "temperature"/)
    expect(validateValue({ type: 'number', value: 25, kind: 'temperature', variant: 'degC', prefix: 'milli' })).toMatch(/SI base representation/)
  })
})

describe('变量表', () => {
  it('钉 kind、覆盖 rev、异 kind 拒绝、删除后重建 rev=1', () => {
    const table = new VariableTable()
    const r = table.set('R', { type: 'number', value: 100, kind: QuantityKind.Resistance })
    expect(r.rev).toBe(1)
    expect(table.set('R', { type: 'number', value: 220, kind: QuantityKind.Resistance }).rev).toBe(2)
    expect(() => table.set('R', { type: 'number', value: 5, kind: QuantityKind.Time })).toThrow(/pinned/)
    expect(table.delete('R')).toBe(true)
    expect(table.delete('R')).toBe(false)
    expect(table.set('R', { type: 'number', value: 7, kind: QuantityKind.Resistance }).rev).toBe(1)
  })
})

describe('语境（set/get/call + markers + 轨迹）', () => {
  it('生命周期：question 开、answer 结算；重开封旧 duplicate-start', () => {
    const context = makeContext()
    const opened = context.markerQuestion('q1')
    expect(opened.ok).toBe(true)
    context.markerAnswer('answer one')
    expect(context.isOpen()).toBe(false)
    const reopened = context.markerQuestion('q2')
    const oldId = String((reopened as unknown as { record: string }).record)
    context.markerQuestion('q3') // 重开 → q2 被封 duplicate-start
    expect(context.isOpen()).toBe(true)
    const oldRows = context.store.readRows(oldId)
    expect(oldRows.some((row) => row.tool === 'seal' && row.kind === 'duplicate-start')).toBe(true)
    const index = context.indexRows()
    expect(index.find((row) => row.id === oldId)?.sealedAt).not.toBeNull()
    context.markerAnswer('final')
  })

  it('set/get 往返与删除；get 未声明槽报错且无副作用', () => {
    const context = makeContext()
    context.markerQuestion('q')
    const setReceipt = context.opSet('R', { type: 'number', value: 100, kind: QuantityKind.Resistance, prefix: 'kilo' })
    expect(setReceipt).toMatchObject({ ok: true, rev: 1 })
    const get = context.opGet('R')
    expect(get).toMatchObject({ ok: true })
    expect((get as unknown as { value: { value: number } }).value.value).toBe(100)
    // 表存原样：get 读回仍带 prefix
    expect((get as unknown as { value: { prefix: string } }).value.prefix).toBe('kilo')
    const missing = context.opGet('X')
    expect(missing).toMatchObject({ ok: false, code: 'CONTEXT_UNDECLARED' })
    const del = context.opSet('R', null)
    expect(del).toMatchObject({ ok: true, deleted: true })
    expect(context.opGet('R')).toMatchObject({ ok: false })
  })

  it('call 执行本地 fn：resolved/result 落行、target 恒覆盖', async () => {
    const context = makeContext()
    context.registry.register({
      id: 'double_rc',
      summary: 'double',
      parameters: { r: { type: 'quantity', kind: QuantityKind.Resistance } },
      returns: { type: 'quantity', kind: QuantityKind.Resistance },
      run: (args) => ({ re: (args.r as number) * 2, im: 0 }),
    })
    context.markerQuestion('q')
    context.opSet('R', { type: 'number', value: 10, kind: QuantityKind.Resistance })
    const receipt = await context.opCall('double_rc', { r: '@R' }, 'D')
    expect(receipt).toMatchObject({ ok: true, target: 'D', rev: 1 })
    const second = await context.opCall('double_rc', { r: '@R' }, 'D')
    expect(second).toMatchObject({ ok: true, rev: 2 })
    const got = context.opGet('D')
    expect((got as unknown as { value: { value: { re: number } } }).value.value.re).toBe(20)
    // 轨迹行含 result（输入输出都记录）
    const rows = context.store.readRows(String(context.openId()))
    const callRow = rows.find((row) => row.tool === 'call' && row.fn === 'double_rc')
    expect(callRow).toBeDefined()
    expect(callRow!.result).toBeDefined()
    expect((callRow!.resolved as { r: { value: number } }).r.value).toBe(10)
    context.markerAnswer('done')
  })

  it('call 校验：未声明引用、kind 不符、void target、非 void 缺 target', async () => {
    const context = makeContext()
    context.registry.register({
      id: 'needs_r',
      summary: 'needs r',
      parameters: { r: { type: 'quantity', kind: QuantityKind.Resistance } },
      returns: { type: 'quantity', kind: QuantityKind.None },
      run: (args) => (args.r as number),
    })
    context.registry.register({
      id: 'does_nothing',
      summary: 'void',
      parameters: {},
      returns: null,
      run: () => undefined,
    })
    context.markerQuestion('q')
    context.opSet('C', { type: 'number', value: 5, kind: QuantityKind.Capacitance })
    await expect(context.opCall('needs_r', { r: '@X' }, 'D')).resolves.toMatchObject({ ok: false, code: 'CONTEXT_UNDECLARED' })
    await expect(context.opCall('needs_r', { r: '@C' }, 'D')).resolves.toMatchObject({ ok: false, code: 'CONTEXT_KIND_MISMATCH' })
    await expect(context.opCall('does_nothing', {}, 'D')).resolves.toMatchObject({ ok: false, code: 'CONTEXT_VOID_TARGET' })
    await expect(context.opCall('does_nothing', {}, null)).resolves.toMatchObject({ ok: true, target: null })
    await expect(context.opCall('needs_r', { r: { type: 'number', value: 1, kind: QuantityKind.Resistance } }, null)).resolves.toMatchObject({ ok: false, code: 'CONTEXT_TARGET_REQUIRED' })
    await expect(context.opCall('ghost', {}, null)).resolves.toMatchObject({ ok: false, code: 'CONTEXT_UNKNOWN_FN' })
  })

  it('fn run 抛错 → ok:false CONTEXT_FN_FAILED，不建槽', async () => {
    const context = makeContext()
    context.registry.register({
      id: 'boom',
      summary: 'boom',
      parameters: {},
      returns: { type: 'quantity', kind: QuantityKind.None },
      run: () => {
        throw new Error('singular system')
      },
    })
    context.markerQuestion('q')
    await expect(context.opCall('boom', {}, 'X')).resolves.toMatchObject({ ok: false, code: 'CONTEXT_FN_FAILED', error: 'singular system' })
    expect(context.opGet('X')).toMatchObject({ ok: false })
  })

  it('中断恢复：重启后重建表并续写同一文件', () => {
    const context = makeContext()
    context.markerQuestion('q')
    context.opSet('R', { type: 'number', value: 100, kind: QuantityKind.Resistance })
    const id = String(context.openId())
    // 模拟重启：新语境同 home
    const revived = new Context(home)
    revived.start()
    expect(revived.openId()).toBe(id)
    const got = revived.opGet('R')
    expect((got as unknown as { value: { value: number } }).value.value).toBe(100)
    revived.markerAnswer('done')
    expect(revived.isOpen()).toBe(false)
  })
})

describe('收据可序列化（工具边界）', () => {
  it('receipt 都是 JSON 可序列化对象', () => {
    const context = makeContext()
    context.markerQuestion('q')
    const receipt = context.opSet('R', { type: 'number', value: 1, kind: QuantityKind.None })
    expect(() => JSON.stringify(receipt)).not.toThrow()
    expect(JSON.parse(JSON.stringify(receipt))).toMatchObject({ ok: true })
  })
})
