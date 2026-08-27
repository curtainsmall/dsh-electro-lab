import { describe, expect, it } from 'vitest'
import { calcAdcBudget, calcJitterSnr, calcThd } from '../../src/math/signal-quality.ts'

/** Coherently sampled test tone: x[n] = Σ Aₘ·sin(2π·m·k·n/N). */
function tone(length: number, k: number, harmonics: Array<[order: number, amplitude: number]>): number[] {
  return Array.from({ length }, (_, n) =>
    harmonics.reduce((sum, [order, amplitude]) => sum + amplitude * Math.sin((2 * Math.PI * order * k * n) / length), 0),
  )
}

describe('calcThd — total harmonic distortion', () => {
  it('reports THD of a fundamental plus a 5% second harmonic (known-value check)', () => {
    // N = 1024, fundamental at bin 10, second harmonic at bin 20
    const result = calcThd(tone(1024, 10, [[1, 1], [2, 0.05]]), 10)
    expect(result.fundamental).toBeCloseTo(512, 6) // N/2 bin magnitude
    expect(result.harmonicAmplitudes).toHaveLength(9) // orders 2..10, absent harmonics ≈ 0
    expect(result.harmonicAmplitudes[0]).toBeCloseTo(25.6, 6) // 0.05 · N/2
    expect(result.thd).toBeCloseTo(0.05, 9)
    expect(result.thdDb).toBeCloseTo(-26.0205999, 6)
  })

  it('sums harmonic energies in quadrature (5% + 2%)', () => {
    const result = calcThd(tone(1024, 10, [[1, 1], [2, 0.05], [3, 0.02]]), 5)
    expect(result.harmonicAmplitudes).toHaveLength(4) // orders 2..5
    expect(result.harmonicAmplitudes[0]).toBeCloseTo(25.6, 6)
    expect(result.harmonicAmplitudes[1]).toBeCloseTo(10.24, 6)
    expect(result.thd).toBeCloseTo(Math.sqrt(0.05 ** 2 + 0.02 ** 2), 9)
  })

  it('a pure sine has no harmonics (thd ≈ 0, thdDb below −300 dB)', () => {
    const result = calcThd(tone(1024, 10, [[1, 1]]), 10)
    expect(result.thd).toBeLessThan(1e-12) // float noise, not an exact zero
    expect(result.thdDb).toBeLessThan(-300)
  })

  it('aliases harmonics back (spectral folding) and rejects bad input', () => {
    // fundamental near Nyquist (bin 500 or its mirror 524): the 2nd harmonic
    // aliases back into the band (bin 1000 or 24) and is still counted
    const result = calcThd(tone(1024, 500, [[1, 1], [2, 0.05]]), 5)
    expect(result.harmonicAmplitudes).toHaveLength(4) // orders 2..5
    expect(result.harmonicAmplitudes[0]).toBeCloseTo(25.6, 6)
    expect(result.thd).toBeCloseTo(0.05, 9)
    expect(() => calcThd([], 5)).toThrow(/at least one/)
    expect(() => calcThd([1, 2], 0)).toThrow(/harmonics/)
    expect(() => calcThd([0, 0, 0], 5)).toThrow(/fundamental/)
  })
})

describe('calcJitterSnr — clock-jitter SNR ceiling', () => {
  it('100 MHz signal with 1 ps RMS jitter → ≈ 64.04 dB (known-value check)', () => {
    expect(calcJitterSnr(1e8, 1e-12)).toBeCloseTo(64.0364026, 6)
  })

  it('rejects non-positive inputs', () => {
    expect(() => calcJitterSnr(0, 1e-12)).toThrow(/frequency/)
    expect(() => calcJitterSnr(1e8, 0)).toThrow(/jitter/)
  })
})

describe('calcAdcBudget — quantization + jitter (+ thermal) into SNR/ENOB', () => {
  it('16-bit, 100 MHz, 1 ps jitter: quantization 98.08 dB, jitter 64.04 dB, total ≈ 64.03 dB (known-value check)', () => {
    const result = calcAdcBudget(16, 1e8, 1e-12)
    expect(result.snrQuantizationDb).toBeCloseTo(6.02 * 16 + 1.76, 6)
    expect(result.snrJitterDb).toBeCloseTo(64.0364026, 6)
    expect(result.snrThermalDb).toBeUndefined()
    expect(result.snrTotalDb).toBeCloseTo(64.0346913, 6) // jitter dominates
    expect(result.enob).toBeCloseTo((result.snrTotalDb - 1.76) / 6.02, 9)
  })

  it('a thermal SNR of 80 dB pulls the total slightly below the jitter ceiling', () => {
    const result = calcAdcBudget(16, 1e8, 1e-12, 80)
    expect(result.snrThermalDb).toBe(80)
    expect(result.snrTotalDb).toBeCloseTo(63.9260957, 6)
    expect(result.enob).toBeCloseTo((result.snrTotalDb - 1.76) / 6.02, 9)
  })

  it('rejects invalid bits and non-finite thermal SNR', () => {
    expect(() => calcAdcBudget(0, 1e8, 1e-12)).toThrow(/bits/)
    expect(() => calcAdcBudget(2.5, 1e8, 1e-12)).toThrow(/bits/)
    expect(() => calcAdcBudget(16, 1e8, 1e-12, Number.NaN)).toThrow(/finite/)
  })
})
