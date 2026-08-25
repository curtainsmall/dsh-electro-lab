import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { Form, expectQuantity, serializeReal, serializeComplex, toComplex, toScalar } from './convert.ts'
import { QuantityKind } from './quantity-kind.ts'

function createRectValue(re: number, im: number, kind: QuantityKind): { form: Form.Rect; re: number; im: number; kind: QuantityKind } {
  return { form: Form.Rect, re, im, kind }
}

function createPolarDegreesValue(mag: number, angDeg: number, kind: QuantityKind): { form: Form.Polar; mag: number; angDeg: number; kind: QuantityKind } {
  return { form: Form.Polar, mag, angDeg, kind }
}

function createPolarRadiansValue(mag: number, angRad: number, kind: QuantityKind): { form: Form.Polar; mag: number; angRad: number; kind: QuantityKind } {
  return { form: Form.Polar, mag, angRad, kind }
}

describe('toScalar — unwrap with kind validation', () => {
  it('returns the real part when the kind matches', () => {
    expect(toScalar(createRectValue(1000, 0, QuantityKind.Frequency), QuantityKind.Frequency)).toBe(1000)
    expect(toScalar(createRectValue(1.5e-9, 0, QuantityKind.Capacitance), QuantityKind.Capacitance)).toBe(1.5e-9)
  })

  it('accepts polar values sitting on the real axis (0° / 180°)', () => {
    expect(toScalar(createPolarDegreesValue(5, 0, QuantityKind.Voltage), QuantityKind.Voltage)).toBe(5)
    expect(toScalar(createPolarDegreesValue(5, 180, QuantityKind.Voltage), QuantityKind.Voltage)).toBe(-5)
    expect(toScalar(createPolarRadiansValue(5, Math.PI, QuantityKind.Voltage), QuantityKind.Voltage)).toBe(-5)
  })

  it('rejects a mismatched kind', () => {
    expect(() => toScalar(createRectValue(1000, 0, QuantityKind.Resistance), QuantityKind.Frequency)).toThrow(/kind mismatch/)
  })

  it('rejects non-real values (createRectValue imaginary part, polar off-axis)', () => {
    expect(() => toScalar(createRectValue(1000, 0.5, QuantityKind.Frequency), QuantityKind.Frequency)).toThrow(/expected a real value/)
    expect(() => toScalar(createPolarDegreesValue(5, 45, QuantityKind.Voltage), QuantityKind.Voltage)).toThrow(/expected a real value/)
  })
})

describe('toComplex — unwrap with kind validation', () => {
  it('returns the complex.js value from createRectValue input', () => {
    const z = toComplex(createRectValue(50, 50, QuantityKind.Resistance), QuantityKind.Resistance)
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })

  it('converts polar input (degrees and radians)', () => {
    const z1 = toComplex(createPolarDegreesValue(5, 90, QuantityKind.Resistance), QuantityKind.Resistance)
    expect(z1.re).toBeCloseTo(0, 10)
    expect(z1.im).toBeCloseTo(5, 10)
    const z2 = toComplex(createPolarRadiansValue(5, Math.PI / 2, QuantityKind.Resistance), QuantityKind.Resistance)
    expect(z2.re).toBeCloseTo(0, 10)
    expect(z2.im).toBeCloseTo(5, 10)
  })

  it('rejects a mismatched kind', () => {
    expect(() => toComplex(createRectValue(50, 50, QuantityKind.Voltage), QuantityKind.Resistance)).toThrow(/kind mismatch/)
  })
})

describe('expectQuantity', () => {
  it('passes on match and throws on mismatch', () => {
    expect(() => expectQuantity(createRectValue(0, 0, QuantityKind.Time), QuantityKind.Time)).not.toThrow()
    expect(() => expectQuantity(createRectValue(0, 0, QuantityKind.Time), QuantityKind.Frequency)).toThrow(/kind mismatch/)
  })
})

describe('serializeComplex — tool output', () => {
  it('exposes the complete snapshot (both projections, both angle units)', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    expect(output.re).toBe(50)
    expect(output.im).toBe(50)
    expect(output.kind).toBe(QuantityKind.Resistance)
    expect(output.mag).toBeCloseTo(70.7107, 4)
    expect(output.angDeg).toBeCloseTo(45, 6)
    expect(output.angRad).toBeCloseTo(Math.PI / 4, 6)
  })

  it('round-trips: the output feeds straight back into toComplex (createRectValue or polar)', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    const backRect = toComplex(output, QuantityKind.Resistance)
    expect(backRect.re).toBe(50)
    expect(backRect.im).toBe(50)
    const backPolar = toComplex(createPolarDegreesValue(output.mag, output.angDeg, output.kind), QuantityKind.Resistance)
    expect(backPolar.re).toBeCloseTo(50, 10)
    expect(backPolar.im).toBeCloseTo(50, 10)
  })

  it('serializes to plain JSON (kind is a string value)', () => {
    const output = serializeComplex(new Complex(10, -0.965), QuantityKind.Resistance)
    const json = JSON.parse(JSON.stringify(output))
    expect(json.kind).toBe('resistance')
    expect(json.re).toBeCloseTo(10, 12)
  })

  it('folds negative zero to positive zero (lossless-JSON boundary)', () => {
    // complex.js arithmetic yields -0 routinely (e.g. +0 divided by a negative
    // real divisor); the harness lossless-JSON check rejects Object.is(x, -0).
    const output = serializeComplex(new Complex(0.2459667825807158, 0).div(new Complex(-0.34602076124567472, 0)), QuantityKind.None)
    for (const value of [output.re, output.im, output.mag, output.angDeg, output.angRad]) {
      expect(Object.is(value, -0)).toBe(false)
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(output.re).toBeCloseTo(-0.7108440016582688, 12)
  })

  it('raises a readable error for non-finite results instead of emitting them', () => {
    expect(() => serializeComplex(new Complex(Number.NaN, 0), QuantityKind.None)).toThrow(/not a finite number/)
    expect(() => serializeComplex(new Complex(Number.POSITIVE_INFINITY, 0), QuantityKind.None)).toThrow(/not a finite number/)
  })
})

describe('serializeReal — real result output', () => {
  it('wraps a real number as a complex value with zero imaginary part', () => {
    const output = serializeReal(2400, QuantityKind.Frequency)
    expect(output.re).toBe(2400)
    expect(output.im).toBe(0)
    expect(output.kind).toBe(QuantityKind.Frequency)
    expect(output.mag).toBe(2400)
    expect(output.angDeg).toBe(0)
  })

  it('folds negative zero input to positive zero', () => {
    const output = serializeReal(-0, QuantityKind.None)
    expect(Object.is(output.re, -0)).toBe(false)
    expect(output.re).toBe(0)
  })
})
