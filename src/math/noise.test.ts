import { describe, expect, it } from 'vitest'
import { calcCascadeNoiseFigure, calcQuantizationSnr, calcThermalNoisePower } from './noise.ts'

describe('thermal noise (textbook checks)', () => {
  it('290 K in 1 MHz ≈ −114 dBm', () => {
    const watts = calcThermalNoisePower(290, 1e6)
    expect(watts).toBeCloseTo(1.380649e-23 * 290 * 1e6, 25)
    const dbm = 10 * Math.log10(watts / 1e-3)
    expect(dbm).toBeCloseTo(-113.98, 1)
  })

  it('rejects negative temperature or bandwidth', () => {
    expect(() => calcThermalNoisePower(-1, 1e6)).toThrow(/temperature/)
    expect(() => calcThermalNoisePower(290, -1)).toThrow(/bandwidth/)
  })
})

describe('quantization SNR (textbook checks)', () => {
  it('16 bits ≈ 98 dB', () => {
    expect(calcQuantizationSnr(16)).toBeCloseTo(6.02 * 16 + 1.76, 6) // 98.08
  })

  it('rejects non-positive bits', () => {
    expect(() => calcQuantizationSnr(0)).toThrow(/positive integer/)
    expect(() => calcQuantizationSnr(1.5)).toThrow(/positive integer/)
  })
})

describe('cascade noise figure (textbook checks)', () => {
  it('3 dB NF at 10 dB gain followed by 5 dB NF → ≈ 3.45 dB', () => {
    // F₁ = 10^0.3 = 1.995, G₁ = 10, F₂ = 10^0.5 = 3.162 → F = 2.2115 → 3.447 dB
    const total = calcCascadeNoiseFigure([3, 5], [10, 0])
    expect(total).toBeCloseTo(10 * Math.log10(10 ** 0.3 + (10 ** 0.5 - 1) / 10), 10)
    expect(total).toBeCloseTo(3.447, 2)
  })

  it('a single stage returns its own NF', () => {
    expect(calcCascadeNoiseFigure([3], [10])).toBeCloseTo(3, 10)
  })

  it('rejects mismatched or empty arrays', () => {
    expect(() => calcCascadeNoiseFigure([], [])).toThrow(/at least one stage/)
    expect(() => calcCascadeNoiseFigure([3, 5], [10])).toThrow(/same length/)
  })
})
