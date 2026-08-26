import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { Form, expectQuantity, serializeReal, serializeComplex, toComplex, toScalar, CommonUnit, convertCommonUnit } from '../../src/math/convert.ts'
import { QuantityKind } from '../../src/math/quantity-kind.ts'

function createRectValue(re: number, im: number, kind: QuantityKind): { form: Form.Rect; re: number; im: number; kind: QuantityKind } {
  return { form: Form.Rect, re, im, kind }
}

function createPolarRadiansValue(mag: number, angRad: number, kind: QuantityKind): { form: Form.Polar; mag: number; angRad: number; kind: QuantityKind } {
  return { form: Form.Polar, mag, angRad, kind }
}

describe('toScalar — unwrap with kind validation', () => {
  it('returns the real part when the kind matches', () => {
    expect(toScalar(createRectValue(1000, 0, QuantityKind.Frequency), QuantityKind.Frequency)).toBe(1000)
    expect(toScalar(createRectValue(1.5e-9, 0, QuantityKind.Capacitance), QuantityKind.Capacitance)).toBe(1.5e-9)
  })

  it('accepts polar values sitting on the real axis (0 rad / π rad)', () => {
    expect(toScalar(createPolarRadiansValue(5, 0, QuantityKind.Voltage), QuantityKind.Voltage)).toBe(5)
    expect(toScalar(createPolarRadiansValue(5, Math.PI, QuantityKind.Voltage), QuantityKind.Voltage)).toBe(-5)
  })

  it('rejects a mismatched kind', () => {
    expect(() => toScalar(createRectValue(1000, 0, QuantityKind.Resistance), QuantityKind.Frequency)).toThrow(/kind mismatch/)
  })

  it('rejects non-real values (createRectValue imaginary part, polar off-axis)', () => {
    expect(() => toScalar(createRectValue(1000, 0.5, QuantityKind.Frequency), QuantityKind.Frequency)).toThrow(/expected a real value/)
    expect(() => toScalar(createPolarRadiansValue(5, Math.PI / 4, QuantityKind.Voltage), QuantityKind.Voltage)).toThrow(/expected a real value/)
  })
})

describe('toComplex — unwrap with kind validation', () => {
  it('returns the complex.js value from createRectValue input', () => {
    const z = toComplex(createRectValue(50, 50, QuantityKind.Resistance), QuantityKind.Resistance)
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })

  it('converts polar input (radians)', () => {
    const z = toComplex(createPolarRadiansValue(5, Math.PI / 2, QuantityKind.Resistance), QuantityKind.Resistance)
    expect(z.re).toBeCloseTo(0, 10)
    expect(z.im).toBeCloseTo(5, 10)
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
  it('exposes the complete snapshot (both projections, angle in radians)', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    expect(output.re).toBe(50)
    expect(output.im).toBe(50)
    expect(output.kind).toBe(QuantityKind.Resistance)
    expect(output.mag).toBeCloseTo(70.7107, 4)
    expect(output.angRad).toBeCloseTo(Math.PI / 4, 6)
  })

  it('round-trips: the output feeds straight back into toComplex (createRectValue or polar)', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    const backRect = toComplex(output, QuantityKind.Resistance)
    expect(backRect.re).toBe(50)
    expect(backRect.im).toBe(50)
    const backPolar = toComplex(createPolarRadiansValue(output.mag, output.angRad, output.kind), QuantityKind.Resistance)
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
    for (const value of [output.re, output.im, output.mag, output.angRad]) {
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
    expect(output.angRad).toBe(0)
  })

  it('folds negative zero input to positive zero', () => {
    const output = serializeReal(-0, QuantityKind.None)
    expect(Object.is(output.re, -0)).toBe(false)
    expect(output.re).toBe(0)
  })
})

describe('convertCommonUnit — temperature to kelvin', () => {
  it('celsius is affine: 0 °C = 273.15 K, 100 °C = 373.15 K', () => {
    expect(convertCommonUnit(0, CommonUnit.Celsius)).toEqual({ value: 273.15, kind: QuantityKind.Temperature })
    expect(convertCommonUnit(100, CommonUnit.Celsius)).toEqual({ value: 373.15, kind: QuantityKind.Temperature })
  })
  it('fahrenheit is affine: 32 °F = 273.15 K, −40 °F = 233.15 K', () => {
    expect(convertCommonUnit(32, CommonUnit.Fahrenheit).value).toBeCloseTo(273.15, 9)
    expect(convertCommonUnit(-40, CommonUnit.Fahrenheit).value).toBeCloseTo(233.15, 9)
    expect(convertCommonUnit(32, CommonUnit.Fahrenheit).kind).toBe(QuantityKind.Temperature)
  })
})

describe('convertCommonUnit — pressure to pascal', () => {
  it('1 bar = 1e5 Pa, 1 atm = 101325 Pa', () => {
    expect(convertCommonUnit(1, CommonUnit.Bar)).toEqual({ value: 1e5, kind: QuantityKind.Pressure })
    expect(convertCommonUnit(1, CommonUnit.Atm)).toEqual({ value: 101325, kind: QuantityKind.Pressure })
  })
  it('1 psi ≈ 6894.76 Pa', () => {
    const { value } = convertCommonUnit(1, CommonUnit.Psi)
    expect(value).toBeCloseTo(6894.757293168, 6)
    expect(convertCommonUnit(1, CommonUnit.Psi).kind).toBe(QuantityKind.Pressure)
  })
})

describe('convertCommonUnit — energy to joule', () => {
  it('1 cal = 4.184 J, 1 kcal = 4184 J', () => {
    expect(convertCommonUnit(1, CommonUnit.Calorie)).toEqual({ value: 4.184, kind: QuantityKind.Energy })
    expect(convertCommonUnit(1, CommonUnit.Kilocalorie)).toEqual({ value: 4184, kind: QuantityKind.Energy })
  })
  it('1 Wh = 3600 J, 1 kWh = 3.6e6 J', () => {
    expect(convertCommonUnit(1, CommonUnit.WattHour)).toEqual({ value: 3600, kind: QuantityKind.Energy })
    expect(convertCommonUnit(1, CommonUnit.KilowattHour)).toEqual({ value: 3.6e6, kind: QuantityKind.Energy })
  })
})

describe('convertCommonUnit — power to watt', () => {
  it('1 hp ≈ 745.7 W', () => {
    const { value } = convertCommonUnit(1, CommonUnit.Horsepower)
    expect(value).toBeCloseTo(745.6998715822702, 6)
    expect(convertCommonUnit(1, CommonUnit.Horsepower).kind).toBe(QuantityKind.Power)
  })
})

describe('convertCommonUnit — length to metre', () => {
  it('1 in = 0.0254 m, 1 ft = 0.3048 m, 1 yd = 0.9144 m, 1 mi = 1609.344 m', () => {
    expect(convertCommonUnit(1, CommonUnit.Inch)).toEqual({ value: 0.0254, kind: QuantityKind.Length })
    expect(convertCommonUnit(1, CommonUnit.Foot)).toEqual({ value: 0.3048, kind: QuantityKind.Length })
    expect(convertCommonUnit(1, CommonUnit.Yard)).toEqual({ value: 0.9144, kind: QuantityKind.Length })
    expect(convertCommonUnit(1, CommonUnit.Mile)).toEqual({ value: 1609.344, kind: QuantityKind.Length })
  })
})

describe('convertCommonUnit — mass to kilogram', () => {
  it('1 lb = 0.45359237 kg, 1 oz ≈ 0.02835 kg', () => {
    expect(convertCommonUnit(1, CommonUnit.Pound)).toEqual({ value: 0.45359237, kind: QuantityKind.Mass })
    expect(convertCommonUnit(1, CommonUnit.Ounce)).toEqual({ value: 0.028349523125, kind: QuantityKind.Mass })
  })
})
