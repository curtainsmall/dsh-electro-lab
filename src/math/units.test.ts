import { describe, expect, it } from 'vitest'
import { BaseUnit, UnitFamily, engineeringFormat, familyFromToken, isNegligible, nearlyEqual, splitUnitToken } from './units.ts'

describe('engineeringFormat', () => {
  it('formats with SI prefixes (engineering notation)', () => {
    expect(engineeringFormat(2400, UnitFamily.FREQUENCY)).toBe('2.4 k')
    expect(engineeringFormat(1.5e-9, UnitFamily.CAPACITANCE)).toBe('1.5 n')
    expect(engineeringFormat(0.15, UnitFamily.VOLTAGE)).toBe('150 m')
    expect(engineeringFormat(5, UnitFamily.DIMENSIONLESS)).toBe('5')
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
    expect(isNegligible(1e-15, UnitFamily.CAPACITANCE)).toBe(true) // below 0.01 pF floor
    expect(isNegligible(1e-13, UnitFamily.CAPACITANCE)).toBe(false) // 0.1 pF is real
    expect(isNegligible(1e-7, UnitFamily.RESISTANCE)).toBe(true) // below μΩ floor
    expect(isNegligible(1e-4, UnitFamily.RESISTANCE)).toBe(false)
    expect(isNegligible(1e-13, UnitFamily.DIMENSIONLESS)).toBe(true) // |Γ| below 1e-12
    expect(isNegligible(1e-2, UnitFamily.DIMENSIONLESS)).toBe(false)
  })
})

describe('unit tokens', () => {
  it('recognizes bases, aliases, and prefixed tokens', () => {
    expect(familyFromToken(BaseUnit.HERTZ)).toBe(UnitFamily.FREQUENCY)
    expect(familyFromToken('ohm')).toBe(UnitFamily.RESISTANCE)
    expect(familyFromToken(BaseUnit.FARAD)).toBe(UnitFamily.CAPACITANCE)
    expect(splitUnitToken('kHz')?.factor).toBeCloseTo(1e3, 12)
    expect(splitUnitToken('nF')?.factor).toBeCloseTo(1e-9, 18)
    expect(splitUnitToken('k')?.factor).toBeCloseTo(1e3, 12) // bare prefix
  })
})
