import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  acPower,
  parallelImpedance,
  parallelTwo,
  rcTransient,
  resonance,
  rlTransient,
  seriesImpedance,
} from './circuits.ts'

describe('series RLC impedance', () => {
  it('is purely resistive at resonance (textbook check)', () => {
    // L = 1 mH, C = 1 µF → f0 = 1/(2π√(LC)) ≈ 5032.9 Hz
    const f0 = 1 / (2 * Math.PI * Math.sqrt(1e-3 * 1e-6))
    const z = seriesImpedance(f0, 10, 1e-3, 1e-6)
    expect(z.re).toBeCloseTo(10, 12)
    expect(z.im).toBeCloseTo(0, 6)
  })

  it('computes off-resonance reactances', () => {
    // f = 1 kHz: XL = 2π·1000·1e-3 ≈ 6.283 Ω, XC = 1/(2π·1000·1e-6) ≈ 159.15 Ω
    const z = seriesImpedance(1000, 10, 1e-3, 1e-6)
    expect(z.re).toBeCloseTo(10, 12)
    expect(z.im).toBeCloseTo(6.2832 - 159.1549, 3)
  })

  it('omits zero elements', () => {
    const z = seriesImpedance(1000, 10, 0, 1e-6)
    expect(z.re).toBeCloseTo(10, 12)
    expect(z.im).toBeCloseTo(-159.1549, 3)
  })
})

describe('parallel impedance', () => {
  it('combines two impedances (50 ∥ 50+j50 = 30+j10)', () => {
    const z = parallelTwo(new Complex(50, 0), new Complex(50, 50))
    expect(z.re).toBeCloseTo(30, 6)
    expect(z.im).toBeCloseTo(10, 6)
  })

  it('parallel RLC peaks near resonance', () => {
    // L = 1 mH, C = 1 µF, R = 1 kΩ → at f0 the impedance is purely real = R
    const f0 = 1 / (2 * Math.PI * Math.sqrt(1e-3 * 1e-6))
    const z = parallelImpedance(f0, 1000, 1e-3, 1e-6)
    expect(z.re).toBeCloseTo(1000, 3)
    expect(Math.abs(z.im)).toBeLessThan(1e-6)
  })
})

describe('resonance', () => {
  it('computes f0, Q, and bandwidth (textbook check)', () => {
    // L = 1 mH, C = 1 nF → f0 = 159.15 kHz; series Q = (1/10)√(1e-3/1e-9) = 100
    const { f0, q, bandwidth } = resonance(1e-3, 1e-9, 10, 'series')
    expect(f0).toBeCloseTo(159154.9, 1)
    expect(q).toBeCloseTo(100, 6)
    expect(bandwidth).toBeCloseTo(1591.5, 1)
  })

  it('computes parallel Q', () => {
    const { q } = resonance(1e-3, 1e-9, 1000, 'parallel')
    // Q = R·√(C/L) = 1000·√(1e-9/1e-3) = 1000·0.001 = 1
    expect(q).toBeCloseTo(1, 6)
  })
})

describe('AC Power', () => {
  it('computes S, P, Q, and Power factor (textbook check)', () => {
    const { apparent, real, reactive, powerFactor } = acPower(100, 2, 30)
    expect(apparent).toBeCloseTo(200, 12)
    expect(real).toBeCloseTo(173.205, 3)
    expect(reactive).toBeCloseTo(100, 6)
    expect(powerFactor).toBeCloseTo(Math.sqrt(3) / 2, 6)
  })
})

describe('RC transient', () => {
  it('charges to 63.2% after one time constant (textbook check)', () => {
    // τ = RC = 1 ms; at t = τ: v = 5·(1 − e⁻¹) ≈ 3.1606 V
    const { voltage, current, tau } = rcTransient('charge', 5, 0, 1e3, 1e-6, 1e-3)
    expect(tau).toBeCloseTo(1e-3, 12)
    expect(voltage).toBeCloseTo(5 * (1 - Math.exp(-1)), 6)
    expect(current).toBeCloseTo((5 - voltage) / 1e3, 6)
  })

  it('discharges exponentially', () => {
    const { voltage } = rcTransient('discharge', 0, 10, 1e3, 1e-6, 1e-3)
    expect(voltage).toBeCloseTo(10 * Math.exp(-1), 6)
  })
})

describe('RL transient', () => {
  it('charges toward Vs/R with time constant L/R', () => {
    // τ = L/R = 10 µs; at t = τ: i = 0.1·(1 − e⁻¹) ≈ 63.21 mA
    const { current, tau } = rlTransient('charge', 10, 0, 100, 1e-3, 1e-5)
    expect(tau).toBeCloseTo(1e-5, 12)
    expect(current).toBeCloseTo(0.1 * (1 - Math.exp(-1)), 6)
  })

  it('discharges from I0', () => {
    const { current } = rlTransient('discharge', 0, 0.2, 100, 1e-3, 1e-5)
    expect(current).toBeCloseTo(0.2 * Math.exp(-1), 6)
  })
})
