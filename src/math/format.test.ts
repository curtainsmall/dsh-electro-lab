import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { serializeComplex } from './format.ts'
import { BaseUnit } from './units.ts'

describe('serializeComplex', () => {
  it('always exposes both rectangular and polar forms', () => {
    const json = serializeComplex(new Complex(50, 50), BaseUnit.Ohm)
    expect(json.real).toBeCloseTo(50, 12)
    expect(json.imaginary).toBeCloseTo(50, 12)
    expect(json.magnitude).toBeCloseTo(70.7107, 4)
    expect(json.phaseAngleDegrees).toBeCloseTo(45, 6)
    expect(json.display).toContain('Ω')
    expect(json.displayPolar).toContain('∠')
    expect(json.unit).toBe('Ω')
  })

  it('renders engineering display strings', () => {
    expect(serializeComplex(new Complex(2400, 0), BaseUnit.Hertz).displayPolar).toBe('2.4 k ∠ 0.00° Hz')
    expect(serializeComplex(new Complex(1.5e-9, 0), BaseUnit.Farad).display).toBe('1.5e-9 + 0j F')
  })

  it('handles Dimensionless values (no unit suffix)', () => {
    const json = serializeComplex(new Complex(0.2, 0.4), BaseUnit.Dimensionless)
    expect(json.display).toBe('0.2 + 0.4j')
    expect(String(json.displayPolar).endsWith('°')).toBe(true)
  })
})
