import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { serializeComplex } from './format.ts'
import { BaseUnit } from './units.ts'

describe('serializeComplex', () => {
  it('always exposes both rectangular and polar forms', () => {
    const json = serializeComplex(new Complex(50, 50), BaseUnit.OHM)
    expect(json.re).toBeCloseTo(50, 12)
    expect(json.im).toBeCloseTo(50, 12)
    expect(json.magnitude).toBeCloseTo(70.7107, 4)
    expect(json.phi_deg).toBeCloseTo(45, 6)
    expect(json.display).toContain('Ω')
    expect(json.display_polar).toContain('∠')
    expect(json.unit).toBe('Ω')
  })

  it('renders engineering display strings', () => {
    expect(serializeComplex(new Complex(2400, 0), BaseUnit.HERTZ).display_polar).toBe('2.4 k ∠ 0.00° Hz')
    expect(serializeComplex(new Complex(1.5e-9, 0), BaseUnit.FARAD).display).toBe('1.5e-9 + 0j F')
  })

  it('handles dimensionless values (no unit suffix)', () => {
    const json = serializeComplex(new Complex(0.2, 0.4), BaseUnit.DIMENSIONLESS)
    expect(json.display).toBe('0.2 + 0.4j')
    expect(String(json.display_polar).endsWith('°')).toBe(true)
  })
})
