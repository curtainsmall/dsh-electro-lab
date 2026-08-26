import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  CircuitMode,
  SwitchingMode,
  calcAcPower,
  calcRcTransientSeries,
  calcResonance,
  calcRlTransientSeries,
} from '../../src/math/circuits.ts'

describe('calcResonance', () => {
  it('computes f0, Q, and bandwidth (known-value check)', () => {
    // L = 1 mH, C = 1 nF → f0 = 159.15 kHz; series Q = (1/10)√(1e-3/1e-9) = 100
    const { resonantFrequency, qualityFactor, bandwidth } = calcResonance(1e-3, 1e-9, 10, CircuitMode.Series)
    expect(resonantFrequency).toBeCloseTo(159154.9, 1)
    expect(qualityFactor).toBeCloseTo(100, 6)
    expect(bandwidth).toBeCloseTo(1591.5, 1)
  })

  it('computes parallel Q', () => {
    const { qualityFactor } = calcResonance(1e-3, 1e-9, 1000, CircuitMode.Parallel)
    // Q = R·√(C/L) = 1000·√(1e-9/1e-3) = 1000·0.001 = 1
    expect(qualityFactor).toBeCloseTo(1, 6)
  })
})

describe('AC Power', () => {
  it('computes S, P, Q, and Power factor (known-value check)', () => {
    const { apparent, real, reactive, powerFactor } = calcAcPower(100, 2, 30)
    expect(apparent).toBeCloseTo(200, 12)
    expect(real).toBeCloseTo(173.205, 3)
    expect(reactive).toBeCloseTo(100, 6)
    expect(powerFactor).toBeCloseTo(Math.sqrt(3) / 2, 6)
  })
})

describe('RC transient', () => {
  it('charges to 63.2% after one time constant (known-value check)', () => {
    // τ = RC = 1 ms; at t = τ: v = 5·(1 − e⁻¹) ≈ 3.1606 V
    const { voltage, current, timeConstant } = calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, [1e-3])[0]!
    expect(timeConstant).toBeCloseTo(1e-3, 12)
    expect(voltage).toBeCloseTo(5 * (1 - Math.exp(-1)), 6)
    expect(current).toBeCloseTo((5 - voltage) / 1e3, 6)
  })

  it('discharges exponentially', () => {
    const { voltage } = calcRcTransientSeries(SwitchingMode.Discharge, 0, 10, 1e3, 1e-6, [1e-3])[0]!
    expect(voltage).toBeCloseTo(10 * Math.exp(-1), 6)
  })

  it('batch evaluation covers every time point', () => {
    const times = [0, 0.5e-3, 1e-3, 2e-3]
    const points = calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, times)
    expect(points).toHaveLength(4)
    points.forEach((point, index) => {
      const expected = 5 * (1 - Math.exp(-times[index]! / 1e-3))
      expect(point.voltage).toBeCloseTo(expected, 10)
      expect(point.time).toBe(times[index])
    })
  })
})

describe('RL transient', () => {
  it('charges toward Vs/R with time constant L/R', () => {
    // τ = L/R = 10 µs; at t = τ: i = 0.1·(1 − e⁻¹) ≈ 63.21 mA
    const { current, timeConstant } = calcRlTransientSeries(SwitchingMode.Charge, 10, 0, 100, 1e-3, [1e-5])[0]!
    expect(timeConstant).toBeCloseTo(1e-5, 12)
    expect(current).toBeCloseTo(0.1 * (1 - Math.exp(-1)), 6)
  })

  it('discharges from I0', () => {
    const { current } = calcRlTransientSeries(SwitchingMode.Discharge, 0, 0.2, 100, 1e-3, [1e-5])[0]!
    expect(current).toBeCloseTo(0.2 * Math.exp(-1), 6)
  })

  it('rejects non-positive parameters and negative times', () => {
    expect(() => calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 0, 1e-6, [1e-3])).toThrow(/resistance/)
    expect(() => calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, [-1])).toThrow(/non-negative/)
    expect(() => calcRlTransientSeries(SwitchingMode.Charge, 10, 0, 100, 0, [1e-5])).toThrow(/inductance/)
  })
})
