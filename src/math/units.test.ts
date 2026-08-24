import { describe, expect, it } from 'vitest'
import { Unit, isNearlyEqual, isNegligible } from './units.ts'

describe('isNearlyEqual — pure relative tolerance', () => {
  it('is scale-invariant: works for pF and GΩ alike', () => {
    expect(isNearlyEqual(1e-12, 1.5e-12)).toBe(false) // 50% difference
    expect(isNearlyEqual(1e12, 1e12 + 1)).toBe(true) // 1e-12 relative
    expect(isNearlyEqual(1e-15, 2e-15)).toBe(false) // 100% difference
    expect(isNearlyEqual(0, 0)).toBe(true)
    expect(isNearlyEqual(1, 1 + 1e-10)).toBe(true)
  })
})

describe('isNegligible — unit-aware zero thresholds', () => {
  it('uses engineering floors, not float math', () => {
    expect(isNegligible(1e-15, Unit.Capacitance)).toBe(true) // below 0.01 pF floor
    expect(isNegligible(1e-13, Unit.Capacitance)).toBe(false) // 0.1 pF is real
    expect(isNegligible(1e-7, Unit.Resistance)).toBe(true) // below μΩ floor
    expect(isNegligible(1e-4, Unit.Resistance)).toBe(false)
    expect(isNegligible(1e-13, Unit.None)).toBe(true) // |Γ| below 1e-12
    expect(isNegligible(1e-2, Unit.None)).toBe(false)
  })
})

describe('Unit enum values', () => {
  it('are the lowercase semantic strings', () => {
    expect(Unit.Frequency).toBe('frequency')
    expect(Unit.Resistance).toBe('resistance')
    expect(Unit.None).toBe('none')
  })
})
