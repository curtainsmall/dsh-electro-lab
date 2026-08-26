import { describe, expect, it } from 'vitest'
import {
  calcBandwidthFromRiseTime,
  calcCoaxialParameters,
  calcRiseTimeFromBandwidth,
  calcWavelength,
} from '../../src/math/transmission.ts'

describe('wavelength (known-value checks)', () => {
  it('300 MHz in vacuum → 1 m', () => {
    expect(calcWavelength(300e6)).toBeCloseTo(299792458 / 300e6, 8)
    expect(calcWavelength(300e6)).toBeCloseTo(0.9993, 3)
  })

  it('velocity factor shortens the wavelength', () => {
    expect(calcWavelength(300e6, 0.66)).toBeCloseTo((0.66 * 299792458) / 300e6, 8)
  })

  it('rejects non-positive frequency and invalid velocity factor', () => {
    expect(() => calcWavelength(0)).toThrow(/frequency/)
    expect(() => calcWavelength(1e6, 0)).toThrow(/velocity factor/)
    expect(() => calcWavelength(1e6, 1.5)).toThrow(/velocity factor/)
  })
})

describe('coaxial parameters (known-value checks)', () => {
  it('d = 1 mm, D = 3.58 mm, εr = 2.25 → ≈ 51 Ω (RG-58-like)', () => {
    const result = calcCoaxialParameters(1e-3, 3.58e-3, 2.25)
    expect(result.impedance).toBeCloseTo(50.9572, 3)
    expect(result.velocityFactor).toBeCloseTo(0.6667, 3)
    // C′ = 1/(vf·c·Z₀) ≈ 98.2 pF/m; L′ = Z₀/(vf·c) ≈ 255 nH/m
    expect(result.capacitancePerMeter).toBeCloseTo(9.81894149e-11, 15)
    expect(result.inductancePerMeter).toBeCloseTo(2.54962577e-7, 13)
  })

  it('rejects invalid geometry', () => {
    expect(() => calcCoaxialParameters(0, 1e-3, 2.25)).toThrow(/inner diameter/)
    expect(() => calcCoaxialParameters(2e-3, 1e-3, 2.25)).toThrow(/outer diameter/)
    expect(() => calcCoaxialParameters(1e-3, 2e-3, 0.5)).toThrow(/permittivity/)
  })
})

describe('rise time / bandwidth (known-value checks)', () => {
  it('1 MHz bandwidth → 350 ns rise time', () => {
    expect(calcRiseTimeFromBandwidth(1e6)).toBeCloseTo(350e-9, 10)
  })

  it('round-trips through both directions', () => {
    const riseTime = calcRiseTimeFromBandwidth(2.5e6)
    expect(calcBandwidthFromRiseTime(riseTime)).toBeCloseTo(2.5e6, 8)
  })

  it('rejects non-positive inputs', () => {
    expect(() => calcRiseTimeFromBandwidth(0)).toThrow(/bandwidth/)
    expect(() => calcBandwidthFromRiseTime(0)).toThrow(/rise time/)
  })
})
