import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QuantityKind } from '../../src/math/quantity-kind.ts'
import { Engine } from '../../src/engine/engine.ts'
import { VariableTable } from '../../src/engine/table.ts'
import { validateValue } from '../../src/engine/values.ts'

let home = ''

function makeEngine(): Engine {
  home = mkdtempSync(join(tmpdir(), 'elab-engine-'))
  const engine = new Engine(home)
  engine.start()
  return engine
}

afterEach(() => {
  if (home.length > 0) rmSync(home, { recursive: true, force: true })
})

describe('value universe validateValue', () => {
  it('accepts typed values and rejects malformed shapes', () => {
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

describe('variable table', () => {
  it('pins kind, bumps rev on overwrite, rejects different kinds, restarts rev at 1 after delete', () => {
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

describe('engine (set/get/call + markers + trace)', () => {
  it('lifecycle: question opens, answer settles; reopening seals the old record as duplicate-start', () => {
    const engine = makeEngine()
    const opened = engine.markerQuestion('q1')
    expect(opened.ok).toBe(true)
    engine.markerAnswer('answer one')
    expect(engine.isOpen()).toBe(false)
    const reopened = engine.markerQuestion('q2')
    const oldId = String((reopened as unknown as { record: string }).record)
    engine.markerQuestion('q3') // reopening → q2 is sealed as duplicate-start
    expect(engine.isOpen()).toBe(true)
    const oldRows = engine.store.readRows(oldId)
    expect(oldRows.some((row) => row.tool === 'seal' && row.kind === 'duplicate-start')).toBe(true)
    const index = engine.indexRows()
    expect(index.find((row) => row.id === oldId)?.sealedAt).not.toBeNull()
    engine.markerAnswer('final')
  })

  it('set/get round-trip and delete; get on an undeclared slot errors with no side effects', () => {
    const engine = makeEngine()
    engine.markerQuestion('q')
    const setReceipt = engine.opSet('R', { type: 'number', value: 100, kind: QuantityKind.Resistance, prefix: 'kilo' })
    expect(setReceipt).toMatchObject({ ok: true, rev: 1 })
    const get = engine.opGet('R')
    expect(get).toMatchObject({ ok: true })
    expect((get as unknown as { value: { value: number } }).value.value).toBe(100)
    // The table stores verbatim: get reads back with the prefix still attached
    expect((get as unknown as { value: { prefix: string } }).value.prefix).toBe('kilo')
    const missing = engine.opGet('X')
    expect(missing).toMatchObject({ ok: false, code: 'ENGINE_UNDECLARED' })
    // Slot references cannot be stored into the table
    expect(engine.opSet('Y', { type: 'slot', value: 'R' })).toMatchObject({ ok: false, code: 'ENGINE_ARGS' })
    const del = engine.opSet('R', null)
    expect(del).toMatchObject({ ok: true, deleted: true })
    expect(engine.opGet('R')).toMatchObject({ ok: false })
  })

  it('call executes a local solver: resolved/result land in the trace row, target is always overwritten', async () => {
    const engine = makeEngine()
    engine.registry.register({
      id: 'double_rc',
      summary: 'double',
      parameters: { r: { type: 'quantity', kind: QuantityKind.Resistance } },
      returns: { type: 'quantity', kind: QuantityKind.Resistance },
      run: (args) => ({ re: (args.r as number) * 2, im: 0 }),
    })
    engine.markerQuestion('q')
    engine.opSet('R', { type: 'number', value: 10, kind: QuantityKind.Resistance })
    const receipt = await engine.opCall('double_rc', { r: { type: 'slot', value: 'R' } }, 'D')
    expect(receipt).toMatchObject({ ok: true, target: 'D', rev: 1 })
    const second = await engine.opCall('double_rc', { r: { type: 'slot', value: 'R' } }, 'D')
    expect(second).toMatchObject({ ok: true, rev: 2 })
    const got = engine.opGet('D')
    expect((got as unknown as { value: { value: { re: number } } }).value.value.re).toBe(20)
    // Trace rows carry result (both inputs and outputs are recorded)
    const rows = engine.store.readRows(String(engine.openId()))
    const callRow = rows.find((row) => row.tool === 'call' && row.solver === 'double_rc')
    expect(callRow).toBeDefined()
    expect(callRow!.result).toBeDefined()
    expect((callRow!.resolved as { r: { value: number } }).r.value).toBe(10)
    engine.markerAnswer('done')
  })

  it('call validation: undeclared reference, kind mismatch, void target, non-void without target', async () => {
    const engine = makeEngine()
    engine.registry.register({
      id: 'needs_r',
      summary: 'needs r',
      parameters: { r: { type: 'quantity', kind: QuantityKind.Resistance } },
      returns: { type: 'quantity', kind: QuantityKind.None },
      run: (args) => (args.r as number),
    })
    engine.registry.register({
      id: 'does_nothing',
      summary: 'void',
      parameters: {},
      returns: null,
      run: () => undefined,
    })
    engine.markerQuestion('q')
    engine.opSet('C', { type: 'number', value: 5, kind: QuantityKind.Capacitance })
    await expect(engine.opCall('needs_r', { r: { type: 'slot', value: 'X' } }, 'D')).resolves.toMatchObject({ ok: false, code: 'ENGINE_UNDECLARED' })
    await expect(engine.opCall('needs_r', { r: { type: 'slot', value: 'C' } }, 'D')).resolves.toMatchObject({ ok: false, code: 'ENGINE_KIND_MISMATCH' })
    // A bare string is a literal, never a reference: it fails the typed-value check
    await expect(engine.opCall('needs_r', { r: '@X' }, 'D')).resolves.toMatchObject({ ok: false, code: 'ENGINE_ARGS' })
    await expect(engine.opCall('does_nothing', {}, 'D')).resolves.toMatchObject({ ok: false, code: 'ENGINE_VOID_TARGET' })
    await expect(engine.opCall('does_nothing', {}, null)).resolves.toMatchObject({ ok: true, target: null })
    await expect(engine.opCall('needs_r', { r: { type: 'number', value: 1, kind: QuantityKind.Resistance } }, null)).resolves.toMatchObject({ ok: false, code: 'ENGINE_TARGET_REQUIRED' })
    await expect(engine.opCall('ghost', {}, null)).resolves.toMatchObject({ ok: false, code: 'ENGINE_UNKNOWN_SOLVER' })
  })

  it('solver run throws → ok:false ENGINE_SOLVER_FAILED, no slot is created', async () => {
    const engine = makeEngine()
    engine.registry.register({
      id: 'boom',
      summary: 'boom',
      parameters: {},
      returns: { type: 'quantity', kind: QuantityKind.None },
      run: () => {
        throw new Error('singular system')
      },
    })
    engine.markerQuestion('q')
    await expect(engine.opCall('boom', {}, 'X')).resolves.toMatchObject({ ok: false, code: 'ENGINE_SOLVER_FAILED', error: 'singular system' })
    expect(engine.opGet('X')).toMatchObject({ ok: false })
  })

  it('interruption recovery: a restart rebuilds the table and continues the same file', () => {
    const engine = makeEngine()
    engine.markerQuestion('q')
    engine.opSet('R', { type: 'number', value: 100, kind: QuantityKind.Resistance })
    const id = String(engine.openId())
    // Simulate a restart: a new engine on the same home
    const revived = new Engine(home)
    revived.start()
    expect(revived.openId()).toBe(id)
    const got = revived.opGet('R')
    expect((got as unknown as { value: { value: number } }).value.value).toBe(100)
    revived.markerAnswer('done')
    expect(revived.isOpen()).toBe(false)
  })
})

describe('receipts are serializable (tool boundary)', () => {
  it('every receipt is a JSON-serializable object', () => {
    const engine = makeEngine()
    engine.markerQuestion('q')
    const receipt = engine.opSet('R', { type: 'number', value: 1, kind: QuantityKind.None })
    expect(() => JSON.stringify(receipt)).not.toThrow()
    expect(JSON.parse(JSON.stringify(receipt))).toMatchObject({ ok: true })
  })
})
