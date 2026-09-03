import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { Form, serializeReal, serializeComplex, toComplex, toScalar, ConvertUnit, RatioKind, convertAngle, convertEnergy, convertLength, convertLogValue, convertMass, convertPower, convertPressure, convertTemperature } from '../../src/math/convert.ts'
import { QuantityKind } from '../../src/math/quantity-kind.ts'

function createRectValue(re: number, im: number, kind: QuantityKind): { form: Form.Rect; re: number; im: number; kind: QuantityKind } {
  return { form: Form.Rect, re, im, kind }
}

function createPolarRadiansValue(mag: number, ang: number, kind: QuantityKind): { form: Form.Polar; mag: number; ang: number; kind: QuantityKind } {
  return { form: Form.Polar, mag, ang, kind }
}

describe('toScalar — any accepted shape unwraps to a real number', () => {
  it('passes a bare number straight through (a real value)', () => {
    expect(toScalar(1000)).toBe(1000)
    expect(toScalar(1.5e-9)).toBe(1.5e-9)
    expect(toScalar(-5)).toBe(-5)
  })

  it('accepts compact {re, im} and legacy rect objects (kind ignored)', () => {
    expect(toScalar({ re: 1000, im: 0 })).toBe(1000)
    expect(toScalar(createRectValue(1000, 0, QuantityKind.Frequency))).toBe(1000)
    expect(toScalar(createRectValue(1.5e-9, 0, QuantityKind.Capacitance))).toBe(1.5e-9)
  })

  it('accepts polar values on the positive real axis (0 rad), compact and legacy', () => {
    expect(toScalar({ mag: 5, ang: 0 })).toBe(5)
    expect(toScalar(createPolarRadiansValue(5, 0, QuantityKind.Voltage))).toBe(5)
  })

  it('accepts output snapshots (extra mag/ang/kind keys are ignored)', () => {
    // A snapshot variable (not a literal) so the extra keys pass structurally.
    const snapshot: { re: number; im: number; mag: number; ang: number; kind: string } = { re: 1000, im: 0, mag: 1000, ang: 0, kind: 'frequency' }
    expect(toScalar(snapshot)).toBe(1000)
    expect(toScalar(createRectValue(1000, 0, QuantityKind.Resistance))).toBe(1000)
  })

  it('rejects non-real values (imaginary part, polar off-axis)', () => {
    expect(() => toScalar({ re: 1000, im: 0.5 })).toThrow(/expected a real value/)
    expect(() => toScalar(createRectValue(1000, 0.5, QuantityKind.Frequency))).toThrow(/expected a real value/)
    expect(() => toScalar({ mag: 5, ang: Math.PI / 4 })).toThrow(/expected a real value/)
    expect(() => toScalar(createPolarRadiansValue(5, Math.PI / 4, QuantityKind.Voltage))).toThrow(/expected a real value/)
    // a π-rad polar scalar is not exactly real in floating point: re = mag·cos(π)
    // is exact but im = mag·sin(π) ≈ 6e-16, and isNearlyEqual is purely relative
    expect(() => toScalar({ mag: 5, ang: Math.PI })).toThrow(/expected a real value/)
    expect(() => toScalar(createPolarRadiansValue(5, Math.PI, QuantityKind.Voltage))).toThrow(/expected a real value/)
  })
  // Non-payload shapes ('12', null, {}, {re:1}, {form:'rect'}) are rejected by
  // the schema layer before execute and by the ValuePayload type at compile
  // time — they are not ValuePayload members and need no runtime test here.
})

describe('toComplex — any accepted shape unwraps to a complex.js value', () => {
  it('treats a bare number as a real value', () => {
    const z = toComplex(5)
    expect(z.re).toBe(5)
    expect(z.im).toBe(0)
  })

  it('unwraps compact {re, im} (rect)', () => {
    const z = toComplex({ re: 50, im: 50 })
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })

  it('converts legacy rect objects with a kind', () => {
    const z = toComplex(createRectValue(50, 50, QuantityKind.Resistance))
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })

  it('converts compact {mag, ang} and legacy polar input (radians)', () => {
    const compact = toComplex({ mag: 5, ang: Math.PI / 2 })
    expect(compact.re).toBeCloseTo(0, 10)
    expect(compact.im).toBeCloseTo(5, 10)
    const legacy = toComplex(createPolarRadiansValue(5, Math.PI / 2, QuantityKind.Resistance))
    expect(legacy.re).toBeCloseTo(0, 10)
    expect(legacy.im).toBeCloseTo(5, 10)
  })

  it('accepts output snapshots regardless of their kind (no kind check)', () => {
    // A snapshot variable (not a literal) so the extra keys pass structurally.
    const snapshot: { re: number; im: number; kind: string; mag: number; ang: number } = { re: 50, im: 50, kind: 'voltage', mag: 70.7107, ang: Math.PI / 4 }
    const z = toComplex(snapshot)
    expect(z.re).toBe(50)
    expect(z.im).toBe(50)
  })
  // Non-payload shapes ('12', null, {}, {form:'rect'}) are rejected by the
  // schema layer before execute and by the ValuePayload type at compile time
  // — they are not ValuePayload members and need no runtime test here.
})

describe('serializeComplex — tool output', () => {
  it('exposes the complete snapshot (both projections, angle in radians)', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    expect(output.re).toBe(50)
    expect(output.im).toBe(50)
    expect(output.kind).toBe(QuantityKind.Resistance)
    expect(output.mag).toBeCloseTo(70.7107, 4)
    expect(output.ang).toBeCloseTo(Math.PI / 4, 6)
  })

  it('round-trips: the output feeds straight back into toComplex', () => {
    const output = serializeComplex(new Complex(50, 50), QuantityKind.Resistance)
    const backRect = toComplex(output)
    expect(backRect.re).toBe(50)
    expect(backRect.im).toBe(50)
    const backPolar = toComplex(createPolarRadiansValue(output.mag, output.ang, output.kind))
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
    for (const value of [output.re, output.im, output.mag, output.ang]) {
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
    expect(output.ang).toBe(0)
  })

  it('folds negative zero input to positive zero', () => {
    const output = serializeReal(-0, QuantityKind.None)
    expect(Object.is(output.re, -0)).toBe(false)
    expect(output.re).toBe(0)
  })
})

describe('convertTemperature — affine, real only', () => {
  it('celsius/fahrenheit are affine: 0 °C = 32 °F = 273.15 K, 100 °C = 212 °F, −40 °F = −40 °C', () => {
    expect(convertTemperature(0, ConvertUnit.Celsius, ConvertUnit.Kelvin).re).toBeCloseTo(273.15, 9)
    expect(convertTemperature(100, ConvertUnit.Celsius, ConvertUnit.Fahrenheit).re).toBeCloseTo(212, 9)
    expect(convertTemperature(32, ConvertUnit.Fahrenheit, ConvertUnit.Celsius).re).toBeCloseTo(0, 9)
    expect(convertTemperature(-40, ConvertUnit.Fahrenheit, ConvertUnit.Celsius).re).toBeCloseTo(-40, 9)
    expect(convertTemperature(300, ConvertUnit.Kelvin, ConvertUnit.Kelvin).re).toBe(300)
  })
  it('rejects a complex temperature', () => {
    expect(() => convertTemperature(new Complex(20, 1), ConvertUnit.Celsius, ConvertUnit.Kelvin)).toThrow(/real/)
  })
})

describe('convertPressure', () => {
  it('1 bar = 1e5 Pa, 1 atm = 101325 Pa, 1 psi ≈ 6894.76 Pa', () => {
    expect(convertPressure(1, ConvertUnit.Bar, ConvertUnit.Pascal).re).toBe(1e5)
    expect(convertPressure(1, ConvertUnit.Atm, ConvertUnit.Pascal).re).toBe(101325)
    expect(convertPressure(1, ConvertUnit.Psi, ConvertUnit.Pascal).re).toBeCloseTo(6894.757293168, 6)
  })
})

describe('convertEnergy', () => {
  it('1 cal = 4.184 J, 1 kWh = 3.6e6 J, 1 Wh = 0.001 kWh', () => {
    expect(convertEnergy(1, ConvertUnit.Calorie, ConvertUnit.Joule).re).toBe(4.184)
    expect(convertEnergy(1, ConvertUnit.KilowattHour, ConvertUnit.Joule).re).toBe(3.6e6)
    expect(convertEnergy(1, ConvertUnit.WattHour, ConvertUnit.KilowattHour).re).toBe(0.001)
  })
})

describe('convertPower', () => {
  it('1 hp ≈ 745.7 W, 1000 W ≈ 1.341 hp', () => {
    expect(convertPower(1, ConvertUnit.Horsepower, ConvertUnit.Watt).re).toBeCloseTo(745.6998715822702, 6)
    expect(convertPower(1000, ConvertUnit.Watt, ConvertUnit.Horsepower).re).toBeCloseTo(1.3410220896, 6)
  })
})

describe('convertLength', () => {
  it('1 in = 0.0254 m, 1 mi = 1609.344 m, 1 m ≈ 39.37 in', () => {
    expect(convertLength(1, ConvertUnit.Inch, ConvertUnit.Metre).re).toBe(0.0254)
    expect(convertLength(1, ConvertUnit.Mile, ConvertUnit.Metre).re).toBe(1609.344)
    expect(convertLength(1, ConvertUnit.Metre, ConvertUnit.Inch).re).toBeCloseTo(39.3700787402, 6)
  })
})

describe('convertMass', () => {
  it('1 lb = 0.45359237 kg, 1 kg ≈ 35.274 oz', () => {
    expect(convertMass(1, ConvertUnit.Pound, ConvertUnit.Kilogram).re).toBe(0.45359237)
    expect(convertMass(1, ConvertUnit.Kilogram, ConvertUnit.Ounce).re).toBeCloseTo(35.2739619496, 6)
  })
})

describe('convertAngle — degrees to radians (angles are always radians)', () => {
  it('30° = π/6 rad, 180° = π rad, −90° = −π/2 rad', () => {
    expect(convertAngle(30).re).toBeCloseTo(Math.PI / 6, 12)
    expect(convertAngle(180).re).toBeCloseTo(Math.PI, 12)
    expect(convertAngle(-90).re).toBeCloseTo(-Math.PI / 2, 12)
  })
  it('complex values scale both components', () => {
    const result = convertAngle(new Complex(30, 60))
    expect(result.re).toBeCloseTo(Math.PI / 6, 12)
    expect(result.im).toBeCloseTo(Math.PI / 3, 12)
  })
})

describe('convertLogValue — real only, kind required', () => {
  it('ratio ↔ dB: power uses 10·log10, voltage uses 20·log10', () => {
    expect(convertLogValue(10, ConvertUnit.Db, ConvertUnit.Ratio, RatioKind.Linear).re).toBeCloseTo(10, 12)
    expect(convertLogValue(20, ConvertUnit.Db, ConvertUnit.Ratio, RatioKind.Quadratic).re).toBeCloseTo(10, 12)
    expect(convertLogValue(100, ConvertUnit.Ratio, ConvertUnit.Db, RatioKind.Linear).re).toBeCloseTo(20, 12)
    expect(convertLogValue(1000, ConvertUnit.Ratio, ConvertUnit.Db, RatioKind.Quadratic).re).toBeCloseTo(60, 12)
    expect(convertLogValue(4, ConvertUnit.Ratio, ConvertUnit.Ratio, RatioKind.Linear).re).toBe(4)
    expect(convertLogValue(10, ConvertUnit.Db, ConvertUnit.Db, RatioKind.Linear).re).toBe(10)
    // the classic dB landmarks: ×2 power ≈ 3.01 dB, ×2 voltage ≈ 6.02 dB
    expect(convertLogValue(2, ConvertUnit.Ratio, ConvertUnit.Db, RatioKind.Linear).re).toBeCloseTo(3.0103, 3)
    expect(convertLogValue(2, ConvertUnit.Ratio, ConvertUnit.Db, RatioKind.Quadratic).re).toBeCloseTo(6.0206, 3)
    expect(convertLogValue(-6.0206, ConvertUnit.Db, ConvertUnit.Ratio, RatioKind.Quadratic).re).toBeCloseTo(0.5, 3)
  })
  it('rejects non-positive ratios and complex values', () => {
    expect(() => convertLogValue(0, ConvertUnit.Ratio, ConvertUnit.Db, RatioKind.Linear)).toThrow(/positive/)
    expect(() => convertLogValue(new Complex(1, 1), ConvertUnit.Db, ConvertUnit.Ratio, RatioKind.Linear)).toThrow(/real/)
  })
})

describe('convert — complex values', () => {
  it('linear families scale both components of a complex value', () => {
    const result = convertPower(new Complex(3, 4), ConvertUnit.Horsepower, ConvertUnit.Watt)
    expect(result.re).toBeCloseTo(3 * 745.6998715822702, 6)
    expect(result.im).toBeCloseTo(4 * 745.6998715822702, 6)
  })
})
