import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  Variable,
  solveDifferenceEquation,
  calcBodeResponse,
  calcFreqPoints,
  calcLogarithmicFrequencyGrid,
  expandPartialFraction,
  calcStepResponse,
  calcTransferResponse,
} from '../../src/math/transfer.ts'

describe('calcTransferResponse (textbook checks)', () => {
  it('RC low-pass: |H| = 1/√2 and −45° at the cutoff frequency', () => {
    // H(s) = 1/(1 + s·RC), RC = 1 → denominator [1, 1]
    const cutoff = 1 / (2 * Math.PI) // ω = 1 rad/s
    const response = calcTransferResponse([new Complex(1, 0)], [new Complex(1, 0), new Complex(1, 0)], [new Complex(0, 1)])[0]!
    expect(response.abs()).toBeCloseTo(1 / Math.SQRT2, 10)
    expect(response.arg()).toBeCloseTo(-Math.PI / 4, 10)
    expect(cutoff).toBeCloseTo(1 / (2 * Math.PI), 12)
  })

  it('evaluates at DC: H(0) = b₀/a₀', () => {
    // H(s) = 2/(s + 3) → H(0) = 2/3
    const response = calcTransferResponse([new Complex(2, 0)], [new Complex(1, 0), new Complex(3, 0)], [new Complex(0, 0)])[0]!
    expect(response.re).toBeCloseTo(2 / 3, 10)
  })
})

describe('expandPartialFraction (textbook checks)', () => {
  it('distinct real poles: 1/((s+1)(s+2)) = 1/(s+1) − 1/(s+2)', () => {
    const result = expandPartialFraction([new Complex(1, 0)], [new Complex(1, 0), new Complex(3, 0), new Complex(2, 0)])
    expect(result.polynomial).toEqual([])
    expect(result.terms).toHaveLength(2)
    const isNear = (value: number) => (term: { pole: Complex }) => Math.abs(term.pole.re - value) < 1e-6
    const atMinusOne = result.terms.find(isNear(-1))!
    const atMinusTwo = result.terms.find(isNear(-2))!
    expect(atMinusOne.residue.re).toBeCloseTo(1, 5)
    expect(atMinusOne.residue.im).toBeCloseTo(0, 5)
    expect(atMinusTwo.residue.re).toBeCloseTo(-1, 5)
  })

  it('repeated pole: 1/(s+1)² has a second-order term', () => {
    const result = expandPartialFraction([new Complex(1, 0)], [new Complex(1, 0), new Complex(2, 0), new Complex(1, 0)])
    const secondOrder = result.terms.find((term) => term.order === 2)!
    expect(secondOrder.pole.re).toBeCloseTo(-1, 5)
    expect(secondOrder.residue.re).toBeCloseTo(1, 5)
    expect(result.terms.find((term) => term.order === 1)!.residue.re).toBeCloseTo(0, 5)
  })

  it('complex conjugate poles: 1/(s²+1) → residues ∓j/2', () => {
    const result = expandPartialFraction([new Complex(1, 0)], [new Complex(1, 0), new Complex(0, 0), new Complex(1, 0)])
    const isNear = (imaginary: number) => (term: { pole: Complex }) => Math.abs(term.pole.im - imaginary) < 1e-6
    const atPlusJ = result.terms.find(isNear(1))!
    const atMinusJ = result.terms.find(isNear(-1))!
    expect(atPlusJ.residue.im).toBeCloseTo(-0.5, 4)
    expect(atMinusJ.residue.im).toBeCloseTo(0.5, 4)
  })

  it('separates the polynomial part when degrees match', () => {
    // (s²+1)/(s+1) = (s−1) + 2/(s+1)
    const result = expandPartialFraction([new Complex(1, 0), new Complex(0, 0), new Complex(1, 0)], [new Complex(1, 0), new Complex(1, 0)])
    expect(result.polynomial.map((coefficient) => coefficient.re)).toEqual([1, -1])
    expect(result.terms[0]!.residue.re).toBeCloseTo(2, 6)
  })
})

describe('calcStepResponse (textbook checks)', () => {
  it('first-order system: y(t) = 1 − e^(−t/τ) with τ = 1', () => {
    const values = calcStepResponse([new Complex(1, 0)], [new Complex(1, 0), new Complex(1, 0)], [0, 1, 2, 3])
    expect(values[0]!.re).toBeCloseTo(0, 6)
    expect(values[1]!.re).toBeCloseTo(1 - Math.exp(-1), 5)
    expect(values[2]!.re).toBeCloseTo(1 - Math.exp(-2), 5)
    expect(values[3]!.re).toBeCloseTo(1 - Math.exp(-3), 5)
  })

  it('underdamped second order starts at zero and settles at the DC gain', () => {
    // H(s) = 1/(s² + 2s + 2): H(0) = 1/2, poles −1 ± j,
    // y(t) = (1 − e^(−t)(cos t + sin t))/2
    const values = calcStepResponse([new Complex(1, 0)], [new Complex(1, 0), new Complex(2, 0), new Complex(2, 0)], [0, Math.PI / 2, Math.PI])
    expect(values[0]!.re).toBeCloseTo(0, 5)
    const atHalf = (1 - Math.exp(-Math.PI / 2) * (Math.cos(Math.PI / 2) + Math.sin(Math.PI / 2))) / 2
    expect(values[1]!.re).toBeCloseTo(atHalf, 5)
    const atPi = (1 - Math.exp(-Math.PI) * (Math.cos(Math.PI) + Math.sin(Math.PI))) / 2
    expect(values[2]!.re).toBeCloseTo(atPi, 5)
    expect(values[2]!.re).toBeGreaterThan(0.49) // settled near 1/2
  })

  it('rejects non-realizable numerator degree', () => {
    expect(() => calcStepResponse([new Complex(1, 0), new Complex(0, 0), new Complex(0, 0)], [new Complex(1, 0), new Complex(1, 0)], [0])).toThrow(/degree/)
  })
})

describe('solveDifferenceEquation (textbook checks)', () => {
  it('first-order low-pass: impulse response 0.5·0.5ⁿ', () => {
    // y[n] = 0.5·x[n] + 0.5·y[n−1] → a = [1, −0.5], b = [0.5]
    const a = [new Complex(1, 0), new Complex(-0.5, 0)]
    const b = [new Complex(0.5, 0)]
    const impulse = [new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(0, 0), new Complex(0, 0)]
    const output = solveDifferenceEquation(a, b, impulse)
    expect(output[0]!.re).toBeCloseTo(0.5, 10)
    expect(output[1]!.re).toBeCloseTo(0.25, 10)
    expect(output[2]!.re).toBeCloseTo(0.125, 10)
    expect(output[3]!.re).toBeCloseTo(0.0625, 10)
  })

  it('step input converges to the DC gain', () => {
    // H(1) = b₀/(1 − a₁) = 0.5/0.5 = 1; y[n] = 1 − 0.5ⁿ⁺¹
    const a = [new Complex(1, 0), new Complex(-0.5, 0)]
    const b = [new Complex(0.5, 0)]
    const step = new Array(16).fill(null).map(() => new Complex(1, 0))
    const output = solveDifferenceEquation(a, b, step)
    expect(output[0]!.re).toBeCloseTo(0.5, 10)
    expect(output[14]!.re).toBeCloseTo(1, 3) // 1 − 2⁻¹⁵
  })

  it('supports complex coefficients and inputs', () => {
    // y[n] = j·x[n] (pure feed-forward)
    const output = solveDifferenceEquation([new Complex(1, 0)], [new Complex(0, 1)], [new Complex(1, 0), new Complex(2, 0)])
    expect(output[0]!.im).toBeCloseTo(1, 10)
    expect(output[1]!.im).toBeCloseTo(2, 10)
  })

  it('rejects a zero a₀', () => {
    expect(() => solveDifferenceEquation([new Complex(0, 0)], [new Complex(1, 0)], [new Complex(1, 0)])).toThrow(/a\[0\]/)
  })
})

describe('calcFreqPoints', () => {
  it('s domain: σ = jω', () => {
    const points = calcFreqPoints(Variable.S, [0, 1 / (2 * Math.PI)])
    expect(points[0]!.re).toBeCloseTo(0, 12)
    expect(points[0]!.im).toBeCloseTo(0, 12)
    expect(points[1]!.im).toBeCloseTo(1, 10)
  })

  it('z domain: σ = e^(jωT)', () => {
    const points = calcFreqPoints(Variable.Z, [0, 1], 1) // 1 Hz · 1 s → ωT = 2π
    expect(points[0]!.re).toBeCloseTo(1, 10)
    expect(points[0]!.im).toBeCloseTo(0, 10)
    expect(points[1]!.re).toBeCloseTo(Math.cos(2 * Math.PI), 10)
    expect(points[1]!.im).toBeCloseTo(Math.sin(2 * Math.PI), 10)
  })

  it('z domain requires sampleTime', () => {
    expect(() => calcFreqPoints(Variable.Z, [1])).toThrow(/sampleTime/)
  })
})

describe('calcLogarithmicFrequencyGrid', () => {
  it('spans one decade with the requested point density', () => {
    const grid = calcLogarithmicFrequencyGrid(10, 1000, 2) // 2 decades × 2 = 4 points
    expect(grid).toHaveLength(5) // inclusive endpoints
    expect(grid[0]).toBeCloseTo(10, 10)
    expect(grid[4]).toBeCloseTo(1000, 6)
    expect(grid[1]).toBeCloseTo(10 * 10 ** 0.5, 8) // log-spaced
  })

  it('rejects invalid ranges', () => {
    expect(() => calcLogarithmicFrequencyGrid(0, 100, 10)).toThrow(/positive/)
    expect(() => calcLogarithmicFrequencyGrid(100, 10, 10)).toThrow(/exceed/)
    expect(() => calcLogarithmicFrequencyGrid(1, 100, 0)).toThrow(/PerDecade/)
  })
})

describe('calcBodeResponse (textbook checks)', () => {
  it('RC low-pass H(s) = 1/(1+s): −3.01 dB and −45° at the cutoff', () => {
    // grid starts exactly at the cutoff frequency f = 1/(2π)
    const cutoff = 1 / (2 * Math.PI)
    const result = calcBodeResponse([new Complex(1, 0)], [new Complex(1, 0), new Complex(1, 0)], Variable.S, cutoff, cutoff * 10, 1)
    expect(result.frequencies[0]).toBeCloseTo(cutoff, 12)
    expect(result.magnitudesDb[0]).toBeCloseTo(-3.0103, 3)
    expect(result.phasesDeg[0]).toBeCloseTo(-45, 3)
    // one decade above the cutoff: ≈ −20 dB/decade → ≈ −23 dB, ≈ −84°
    expect(result.magnitudesDb[1]).toBeCloseTo(-20.043, 2)
    expect(result.phasesDeg[1]).toBeCloseTo(-84.29, 2)
  })
})

describe('Variable enum', () => {
  it('exposes both variables', () => {
    expect(Variable.S).toBe('s')
    expect(Variable.Z).toBe('z')
  })
})
