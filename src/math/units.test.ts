import { describe, expect, it } from 'vitest'
import { BaseUnit, Unit, engineeringFormat, unitFromToken, isNegligible, nearlyEqual, splitUnitToken } from './units.ts'

describe('engineeringFormat', () => {
  it('formats with SI prefixes (engineering notation)', () => {
    expect(engineeringFormat(2400, Unit.Frequency)).toBe('2.4 k')
    expect(engineeringFormat(1.5e-9, Unit.Capacitance)).toBe('1.5 n')
    expect(engineeringFormat(0.15, Unit.Voltage)).toBe('150 m')
    expect(engineeringFormat(5, Unit.Dimensionless)).toBe('5')
  })
})

describe('nearlyEqual — pure relative tolerance', () => {
  it('is scale-invariant: works for pF and GΩ alike', () => {
    expect(nearlyEqual(1e-12, 1.5e-12)).toBe(false) // 50% difference
    expect(nearlyEqual(1e12, 1e12 + 1)).toBe(true) // 1e-12 relative
    expect(nearlyEqual(1e-15, 2e-15)).toBe(false) // 100% difference
    expect(nearlyEqual(0, 0)).toBe(true)
    expect(nearlyEqual(1, 1 + 1e-10)).toBe(true)
  })
})

describe('isNegligible — unit-aware zero thresholds', () => {
  it('uses engineering floors, not float math', () => {
    expect(isNegligible(1e-15, Unit.Capacitance)).toBe(true) // below 0.01 pF floor
    expect(isNegligible(1e-13, Unit.Capacitance)).toBe(false) // 0.1 pF is real
    expect(isNegligible(1e-7, Unit.Resistance)).toBe(true) // below μΩ floor
    expect(isNegligible(1e-4, Unit.Resistance)).toBe(false)
    expect(isNegligible(1e-13, Unit.Dimensionless)).toBe(true) // |Γ| below 1e-12
    expect(isNegligible(1e-2, Unit.Dimensionless)).toBe(false)
  })
})

describe('unit tokens', () => {
  it('recognizes bases, aliases, and prefixed tokens', () => {
    expect(unitFromToken(BaseUnit.Hertz)).toBe(Unit.Frequency)
    expect(unitFromToken('ohm')).toBe(Unit.Resistance)
    expect(unitFromToken(BaseUnit.Farad)).toBe(Unit.Capacitance)
    expect(splitUnitToken('kHz')?.factor).toBeCloseTo(1e3, 12)
    expect(splitUnitToken('nF')?.factor).toBeCloseTo(1e-9, 18)
    expect(splitUnitToken('k')?.factor).toBeCloseTo(1e3, 12) // bare prefix
  })
})
