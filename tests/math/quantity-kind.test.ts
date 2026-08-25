import { describe, expect, it } from 'vitest'
import { QuantityKind, isNearlyEqual, isNegligible } from '../../src/math/quantity-kind.ts'

describe('isNearlyEqual — pure relative tolerance', () => {
  it('is scale-invariant: works for pF and GΩ alike', () => {
    expect(isNearlyEqual(1e-12, 1.5e-12)).toBe(false) // 50% difference
    expect(isNearlyEqual(1e12, 1e12 + 1)).toBe(true) // 1e-12 relative
    expect(isNearlyEqual(1e-15, 2e-15)).toBe(false) // 100% difference
    expect(isNearlyEqual(0, 0)).toBe(true)
    expect(isNearlyEqual(1, 1 + 1e-10)).toBe(true)
  })
})

describe('isNegligible — kind-aware zero thresholds', () => {
  it('uses engineering floors, not float math', () => {
    expect(isNegligible(1e-15, QuantityKind.Capacitance)).toBe(true) // below 0.01 pF floor
    expect(isNegligible(1e-13, QuantityKind.Capacitance)).toBe(false) // 0.1 pF is real
    expect(isNegligible(1e-7, QuantityKind.Resistance)).toBe(true) // below μΩ floor
    expect(isNegligible(1e-4, QuantityKind.Resistance)).toBe(false)
    expect(isNegligible(1e-13, QuantityKind.None)).toBe(true) // |Γ| below 1e-12
    expect(isNegligible(1e-2, QuantityKind.None)).toBe(false)
  })
})

describe('QuantityKind enum values', () => {
  it('are the lowercase quantity names', () => {
    expect(QuantityKind.Time).toBe('time')
    expect(QuantityKind.Length).toBe('length')
    expect(QuantityKind.Mass).toBe('mass')
    expect(QuantityKind.Current).toBe('current')
    expect(QuantityKind.Temperature).toBe('temperature')
    expect(QuantityKind.Frequency).toBe('frequency')
    expect(QuantityKind.Resistance).toBe('resistance')
    expect(QuantityKind.Capacitance).toBe('capacitance')
    expect(QuantityKind.Inductance).toBe('inductance')
    expect(QuantityKind.Voltage).toBe('voltage')
    expect(QuantityKind.Power).toBe('power')
    expect(QuantityKind.Angle).toBe('angle')
    expect(QuantityKind.Log).toBe('log')
    expect(QuantityKind.None).toBe('none')
  })
})
