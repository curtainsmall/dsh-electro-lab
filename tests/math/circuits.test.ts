import { describe, expect, it } from 'vitest'
import {
  CircuitMode,
  SwitchingMode,
  TransientDamping,
  calcAcPower,
  calcRcTransientSeries,
  calcResonance,
  calcRlTransientSeries,
  calcRlcTransientSeries,
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
    const { apparent, real, reactive, powerFactor } = calcAcPower(100, 2, Math.PI / 6) // 30° in radians
    expect(apparent).toBeCloseTo(200, 12)
    expect(real).toBeCloseTo(173.205, 3)
    expect(reactive).toBeCloseTo(100, 6)
    expect(powerFactor).toBeCloseTo(Math.sqrt(3) / 2, 6)
  })
})

describe('RC transient', () => {
  it('charges to 63.2% after one time constant (known-value check)', () => {
    // τ = RC = 1 ms; at t = τ: v = 5·(1 − e⁻¹) ≈ 3.1606 V
    const { points } = calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, [1e-3])
    const { voltage, current, timeConstant } = points[0]!
    expect(timeConstant).toBeCloseTo(1e-3, 12)
    expect(voltage).toBeCloseTo(5 * (1 - Math.exp(-1)), 6)
    expect(current).toBeCloseTo((5 - voltage) / 1e3, 6)
  })

  it('discharges exponentially', () => {
    const { points } = calcRcTransientSeries(SwitchingMode.Discharge, 0, 10, 1e3, 1e-6, [1e-3])
    expect(points[0]!.voltage).toBeCloseTo(10 * Math.exp(-1), 6)
  })

  it('batch evaluation covers every time point', () => {
    const times = [0, 0.5e-3, 1e-3, 2e-3]
    const { points } = calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, times)
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
    const { points } = calcRlTransientSeries(SwitchingMode.Charge, 10, 0, 100, 1e-3, [1e-5])
    const { current, timeConstant } = points[0]!
    expect(timeConstant).toBeCloseTo(1e-5, 12)
    expect(current).toBeCloseTo(0.1 * (1 - Math.exp(-1)), 6)
  })

  it('discharges from I0', () => {
    const { points } = calcRlTransientSeries(SwitchingMode.Discharge, 0, 0.2, 100, 1e-3, [1e-5])
    expect(points[0]!.current).toBeCloseTo(0.2 * Math.exp(-1), 6)
  })

  it('rejects non-positive parameters and negative times', () => {
    expect(() => calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 0, 1e-6, [1e-3])).toThrow(/resistance/)
    expect(() => calcRcTransientSeries(SwitchingMode.Charge, 5, 0, 1e3, 1e-6, [-1])).toThrow(/non-negative/)
    expect(() => calcRlTransientSeries(SwitchingMode.Charge, 10, 0, 100, 0, [1e-5])).toThrow(/inductance/)
  })
})

describe('RLC transient — second order', () => {
  // Series RLC: L = 1 mH, C = 1 µF → ω₀ = 1/√(LC) = 31622.78 rad/s
  const L = 1e-3
  const C = 1e-6

  it('underdamped charge matches the closed form (known-value check)', () => {
    // R = 10 → α = 5000 rad/s, ω_d ≈ 31225 rad/s; Vs = 1 V, at t = 50 µs
    const { points, damping, dampingRatio } = calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, 10, C, L, [5e-5])
    expect(damping).toBe(TransientDamping.Underdamped)
    expect(dampingRatio).toBeCloseTo(0.1581139, 6)
    expect(points[0]!.voltage).toBeCloseTo(0.8678631955, 6)
    expect(points[0]!.current).toBeCloseTo(0.02494045704, 6)
  })

  it('critical damping decays as (1 + αt)·e^(−αt) (known-value check)', () => {
    // R = 2√(L/C) = 63.2456 → α = ω₀; at t = 1/α: v = 1 − 2/e ≈ 0.26424 V
    const resistance = 2 * Math.sqrt(L / C)
    const { points, damping } = calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, resistance, C, L, [1 / (resistance / (2 * L))])
    expect(damping).toBe(TransientDamping.Critical)
    expect(points[0]!.voltage).toBeCloseTo(1 - 2 / Math.E, 6)
  })

  it('overdamped charge matches the two-exponential closed form (known-value check)', () => {
    // R = 100 → α = 50000 rad/s, ζ ≈ 1.581; at t = 100 µs
    const { points, damping } = calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, 100, C, L, [1e-4])
    expect(damping).toBe(TransientDamping.Overdamped)
    expect(points[0]!.voltage).toBeCloseTo(0.6288811687, 6)
  })

  it('discharge honors both initial conditions at t = 0', () => {
    const { points, damping } = calcRlcTransientSeries(SwitchingMode.Discharge, 0, 5, 0.1, 10, C, L, [0])
    expect(points[0]!.voltage).toBeCloseTo(5, 12)
    expect(points[0]!.current).toBeCloseTo(0.1, 12)
    expect(damping).toBe(TransientDamping.Underdamped)
  })

  it('rejects non-positive capacitance/inductance and negative times', () => {
    expect(() => calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, 10, 0, L, [1e-4])).toThrow(/capacitance/)
    expect(() => calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, 10, C, 0, [1e-4])).toThrow(/inductance/)
    expect(() => calcRlcTransientSeries(SwitchingMode.Charge, 1, 0, 0, 10, C, L, [-1e-4])).toThrow(/non-negative/)
  })
})
