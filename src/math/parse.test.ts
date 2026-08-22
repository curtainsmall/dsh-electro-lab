import { describe, expect, it } from 'vitest'
import { parseComplex, parseScalar } from './parse.ts'
import { Unit } from './units.ts'

/** Relative comparison for tiny base-unit values (toBeCloseTo digit counts are brittle across magnitudes). */
function expectClose(actual: number, expected: number, relTol = 1e-12): void {
  expect(Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-300)).toBeLessThanOrEqual(relTol)
}

describe('parseScalar', () => {
  it('parses SI-prefixed strings into base units', () => {
    expectClose(parseScalar('1.5nF', Unit.Capacitance), 1.5e-9)
    expectClose(parseScalar('2.4kHz', Unit.Frequency), 2400)
    expectClose(parseScalar('1k', Unit.Resistance), 1000)
    expectClose(parseScalar('100pF', Unit.Capacitance), 1e-10)
    expectClose(parseScalar('1k Ω', Unit.Resistance), 1000)
    expectClose(parseScalar('2.4 kHz', Unit.Frequency), 2400)
  })

  it('accepts plain numbers and scientific notation', () => {
    expect(parseScalar(1000, Unit.Frequency)).toBe(1000)
    expect(parseScalar(1.5e-9, Unit.Capacitance)).toBe(1.5e-9)
  })

  it('rejects wrong-Unit units', () => {
    expect(() => parseScalar('1.5nF', Unit.Resistance)).toThrow()
    expect(() => parseScalar('1.5nF', Unit.Frequency)).toThrow()
  })
})

describe('parseComplex', () => {
  it('parses rectangular, polar, structured, and bare-real forms', () => {
    const z1 = parseComplex('50+50j')
    expectClose(z1.re, 50)
    expectClose(z1.im, 50)
    const z2 = parseComplex('5∠53.13°')
    expectClose(z2.abs(), 5)
    expectClose((z2.arg() * 180) / Math.PI, 53.13, 1e-3)
    const z3 = parseComplex({ re: 3, im: -4 })
    expect(z3.re).toBe(3)
    expect(z3.im).toBe(-4)
    const z4 = parseComplex(42, Unit.Resistance)
    expect(z4.re).toBe(42)
    expect(z4.im).toBe(0)
  })

  it('applies units to complex parts', () => {
    const z = parseComplex('50+50j Ω', Unit.Resistance)
    expectClose(z.re, 50)
    expectClose(z.im, 50)
    const zk = parseComplex('1k Ω', Unit.Resistance)
    expectClose(zk.re, 1000)
    expectClose(zk.im, 0)
  })
})
