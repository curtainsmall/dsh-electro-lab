import { describe, expect, it } from 'vitest'
import { PowerSumKind, calcArithmeticSeries, calcGeometricSeries, calcPowerSum } from '../../src/math/series.ts'

describe('calcArithmeticSeries', () => {
  it('2, 5, 8, …, 10 terms: sum 155, last term 29 (known-value check)', () => {
    const result = calcArithmeticSeries(2, 3, 10)
    expect(result.lastTerm).toBe(29)
    expect(result.sum).toBe(155)
  })

  it('1..100 sums to 5050 (independent loop check)', () => {
    const expected = Array.from({ length: 100 }, (_, i) => i + 1).reduce((a, b) => a + b, 0)
    expect(calcArithmeticSeries(1, 1, 100).sum).toBe(expected)
  })

  it('rejects non-positive or non-integer counts', () => {
    expect(() => calcArithmeticSeries(1, 1, 0)).toThrow(/count/)
    expect(() => calcArithmeticSeries(1, 1, 2.5)).toThrow(/count/)
  })
})

describe('calcGeometricSeries', () => {
  it('1, 2, 4, 8, 16: sum 31, last term 16 (known-value check)', () => {
    const result = calcGeometricSeries(1, 2, 5)
    expect(result.lastTerm).toBe(16)
    expect(result.sum).toBe(31)
  })

  it('100 halved five times: sum 193.75, last term 6.25 (independent loop check)', () => {
    const expected = Array.from({ length: 5 }, (_, i) => 100 * 0.5 ** i).reduce((a, b) => a + b, 0)
    const result = calcGeometricSeries(100, 0.5, 5)
    expect(result.lastTerm).toBe(6.25)
    expect(result.sum).toBe(expected)
  })

  it('r = 1 is handled without division by zero', () => {
    const result = calcGeometricSeries(3, 1, 4)
    expect(result.sum).toBe(12)
    expect(result.lastTerm).toBe(3)
  })

  it('infinite sum converges to a₁/(1−r) when |r| < 1', () => {
    const result = calcGeometricSeries(1, 0.5, 1, true)
    expect(result.sum).toBe(2)
    expect(result.converges).toBe(true)
    expect(result.lastTerm).toBeUndefined()
  })

  it('a diverging infinite series raises an error', () => {
    expect(() => calcGeometricSeries(1, 2, 1, true)).toThrow(/diverges/)
  })
})

describe('calcPowerSum', () => {
  it('Σk: n = 100 → 5050', () => {
    expect(calcPowerSum(PowerSumKind.Linear, 100).sum).toBe(5050)
  })

  it('Σk²: n = 10 → 385', () => {
    expect(calcPowerSum(PowerSumKind.Square, 10).sum).toBe(385)
  })

  it('Σk³: n = 10 → 3025, and (Σk)² identity holds', () => {
    const cube = calcPowerSum(PowerSumKind.Cube, 10).sum
    expect(cube).toBe(3025)
    expect(cube).toBe(calcPowerSum(PowerSumKind.Linear, 10).sum ** 2)
  })

  it('rejects bad counts', () => {
    expect(() => calcPowerSum(PowerSumKind.Square, 0)).toThrow(/count/)
  })
})
