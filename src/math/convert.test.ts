import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { Form, expectUnit, realValue, serializeComplex, toComplex, toScalar } from './convert.ts'
import { Unit } from './units.ts'

function rect(re: number, im: number, unit: Unit): { form: Form.Rect; re: number; im: number; unit: Unit } {
  return { form: Form.Rect, re, im, unit }
}

function polarDeg(mag: number, angDeg: number, unit: Unit): { form: Form.Polar; mag: number; angDeg: number; unit: Unit } {
  return { form: Form.Polar, mag, angDeg, unit }
}

function polarRad(mag: number, angRad: number, unit: Unit): { form: Form.Polar; mag: number; angRad: number; unit: Unit } {
  return { form: Form.Polar, mag, angRad, unit }
}

describe('toScalar — unwrap with unit validation', () => {
  it('returns the real part when the unit matches', () => {
    expect(toScalar(rect(1000, 0, Unit.Frequency), Unit.Frequency)).toBe(1000)
    expect(toScalar(rect(1.5e-9, 0, Unit.Capacitance), Unit.Capacitance)).toBe(1.5e-9)
  })

  it('accepts polar values sitting on the real axis (0° / 180°)', () => {
    expect(toScalar(polarDeg(5, 0, Unit.Voltage), Unit.Voltage)).toBe(5)
    expect(toScalar(polarDeg(5, 180, Unit.Voltage), Unit.Voltage)).toBe(-5)
    expect(toScalar(polarRad(5, Math.PI, Unit.Voltage), Unit.Voltage)).toBe(-5)
  })

  it('rejects a mismatched unit', () => {
    expect(() => toScalar(rect(1000, 0, Unit.Resistance), Unit.Frequency)).toThrow(/unit mismatch/)
  })

  it('rejects non-real values (rect imaginary part, polar off-axis)', () => {
    expect(() => toScalar(rect(1000, 0.5, Unit.Frequency), Unit.Frequency)).toThrow(/expected a real value/)
    expect(() => toScalar(polarDeg(5, 45, Unit.Voltage), Unit.Voltage)).toThrow(/expected a real value/)
  })
})

describe('toComplex — unwrap with unit validation', () => {
  it('returns the complex.js value from rect input', () => {
    const z = toComplex(rect(50, 50, Unit.Resistance), Unit.Resistance)
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })

  it('converts polar input (degrees and radians)', () => {
    const z1 = toComplex(polarDeg(5, 90, Unit.Resistance), Unit.Resistance)
    expect(z1.re).toBeCloseTo(0, 10)
    expect(z1.im).toBeCloseTo(5, 10)
    const z2 = toComplex(polarRad(5, Math.PI / 2, Unit.Resistance), Unit.Resistance)
    expect(z2.re).toBeCloseTo(0, 10)
    expect(z2.im).toBeCloseTo(5, 10)
  })

  it('rejects a mismatched unit', () => {
    expect(() => toComplex(rect(50, 50, Unit.Voltage), Unit.Resistance)).toThrow(/unit mismatch/)
  })
})

describe('expectUnit', () => {
  it('passes on match and throws on mismatch', () => {
    expect(() => expectUnit(rect(0, 0, Unit.Time), Unit.Time)).not.toThrow()
    expect(() => expectUnit(rect(0, 0, Unit.Time), Unit.Frequency)).toThrow(/unit mismatch/)
  })
})

describe('serializeComplex — tool output', () => {
  it('exposes the complete snapshot (both projections, both angle units)', () => {
    const output = serializeComplex(new Complex(50, 50), Unit.Resistance)
    expect(output.re).toBe(50)
    expect(output.im).toBe(50)
    expect(output.unit).toBe(Unit.Resistance)
    expect(output.mag).toBeCloseTo(70.7107, 4)
    expect(output.angDeg).toBeCloseTo(45, 6)
    expect(output.angRad).toBeCloseTo(Math.PI / 4, 6)
  })

  it('round-trips: the output feeds straight back into toComplex (rect or polar)', () => {
    const output = serializeComplex(new Complex(50, 50), Unit.Resistance)
    const backRect = toComplex(output, Unit.Resistance)
    expect(backRect.re).toBe(50)
    expect(backRect.im).toBe(50)
    const backPolar = toComplex(polarDeg(output.mag, output.angDeg, output.unit), Unit.Resistance)
    expect(backPolar.re).toBeCloseTo(50, 10)
    expect(backPolar.im).toBeCloseTo(50, 10)
  })

  it('serializes to plain JSON (unit is a string value)', () => {
    const output = serializeComplex(new Complex(10, -0.965), Unit.Resistance)
    const json = JSON.parse(JSON.stringify(output))
    expect(json.unit).toBe('resistance')
    expect(json.re).toBeCloseTo(10, 12)
  })
})

describe('realValue — real result output', () => {
  it('wraps a real number as a complex value with zero imaginary part', () => {
    const output = realValue(2400, Unit.Frequency)
    expect(output.re).toBe(2400)
    expect(output.im).toBe(0)
    expect(output.unit).toBe(Unit.Frequency)
    expect(output.mag).toBe(2400)
    expect(output.angDeg).toBe(0)
  })
})
