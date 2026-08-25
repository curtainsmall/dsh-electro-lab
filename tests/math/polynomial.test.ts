import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { dividePolynomials, expandPowerSeries, findPolesZeros, findPolyRoots } from '../../src/math/polynomial.ts'

/** Sort roots by (re, im) for order-independent comparison. */
function sortedRoots(coefficients: number[]): { re: number; im: number }[] {
  return findPolyRoots(coefficients.map((value) => new Complex(value, 0)))
    .map((root) => ({ re: root.re, im: root.im }))
    .sort((a, b) => a.re - b.re || a.im - b.im)
}

describe('dividePolynomials (descending order, the standard)', () => {
  it('divides exactly: (s²+3s+2)/(s+1) = s+2, remainder [0]', () => {
    const result = dividePolynomials(
      [new Complex(1, 0), new Complex(3, 0), new Complex(2, 0)], // s² + 3s + 2
      [new Complex(1, 0), new Complex(1, 0)], // s + 1
    )
    expect(result.quotient.map((c) => c.re)).toEqual([1, 2]) // s + 2
    expect(result.remainder.map((c) => c.re)).toEqual([0]) // zero polynomial, never []
  })

  it('lower-degree dividend: quotient is the zero polynomial [0]', () => {
    const result = dividePolynomials(
      [new Complex(1, 0)], // 1
      [new Complex(1, 0), new Complex(1, 0)], // s + 1
    )
    expect(result.quotient.map((c) => c.re)).toEqual([0])
    expect(result.remainder.map((c) => c.re)).toEqual([1])
  })

  it('zero dividend: quotient and remainder are both [0]', () => {
    const result = dividePolynomials(
      [new Complex(0, 0)],
      [new Complex(1, 0), new Complex(1, 0)],
    )
    expect(result.quotient.map((c) => c.re)).toEqual([0])
    expect(result.remainder.map((c) => c.re)).toEqual([0])
  })

  it('leaves a non-zero remainder for non-exact division', () => {
    const result = dividePolynomials(
      [new Complex(1, 0), new Complex(0, 0), new Complex(1, 0)], // s² + 1
      [new Complex(1, 0), new Complex(1, 0)], // s + 1
    )
    expect(result.quotient.map((c) => c.re)).toEqual([1, -1]) // s − 1
    expect(result.remainder.map((c) => c.re)).toEqual([2]) // 2
  })

  it('invariants: quotient and remainder are never empty; leading coefficient non-zero unless [0]', () => {
    const cases: [number[], number[]][] = [
      [[1, 3, 2], [1, 1]],
      [[1], [1, 1]],
      [[0], [1, 1]],
      [[1, 0, 1], [1, 1]],
      [[1, 0, 0, 0], [1, 2, 1]],
    ]
    for (const [a, b] of cases) {
      const result = dividePolynomials(
        a.map((value) => new Complex(value, 0)),
        b.map((value) => new Complex(value, 0)),
      )
      for (const polynomial of [result.quotient, result.remainder]) {
        expect(polynomial.length).toBeGreaterThanOrEqual(1)
        const isZeroPolynomial = polynomial.length === 1 && polynomial[0]!.abs() === 0
        if (!isZeroPolynomial) expect(polynomial[0]!.abs()).not.toBe(0)
      }
    }
  })
})

describe('findPolyRoots (textbook checks)', () => {
  it('solves a quadratic with two real roots', () => {
    const roots = sortedRoots([1, -3, 2]) // x² − 3x + 2 = (x−1)(x−2)
    expect(roots[0]!.re).toBeCloseTo(1, 6)
    expect(roots[1]!.re).toBeCloseTo(2, 6)
  })

  it('solves a quadratic with a double root', () => {
    const roots = sortedRoots([1, -2, 1]) // (x−1)²
    expect(roots[0]!.re).toBeCloseTo(1, 4)
    expect(roots[1]!.re).toBeCloseTo(1, 4)
  })

  it('solves x² + 1 = 0 → ±j', () => {
    const roots = sortedRoots([1, 0, 1])
    expect(roots[0]!.im).toBeCloseTo(-1, 6)
    expect(roots[1]!.im).toBeCloseTo(1, 6)
  })

  it('solves x² + 2x + 5 = 0 → −1 ± 2j', () => {
    const roots = sortedRoots([1, 2, 5])
    expect(roots[0]!.re).toBeCloseTo(-1, 6)
    expect(roots[0]!.im).toBeCloseTo(-2, 6)
    expect(roots[1]!.re).toBeCloseTo(-1, 6)
    expect(roots[1]!.im).toBeCloseTo(2, 6)
  })

  it('solves a cubic x³ − 1 = 0', () => {
    const roots = sortedRoots([1, 0, 0, -1])
    // 1, e^{±j2π/3} = −1/2 ± j√3/2
    expect(roots[0]!.re).toBeCloseTo(-0.5, 5)
    expect(roots[0]!.im).toBeCloseTo(-Math.sqrt(3) / 2, 5)
    expect(roots[1]!.re).toBeCloseTo(-0.5, 5)
    expect(roots[1]!.im).toBeCloseTo(Math.sqrt(3) / 2, 5)
    expect(roots[2]!.re).toBeCloseTo(1, 5)
  })

  it('returns [] for constants and handles leading zeros', () => {
    expect(findPolyRoots([new Complex(5, 0)])).toEqual([])
    expect(findPolyRoots([new Complex(0, 0), new Complex(1, 0), new Complex(-3, 0), new Complex(2, 0)]).length).toBe(2) // 0x³ + x² − 3x + 2
  })
})

describe('findPolesZeros (textbook checks)', () => {
  it('1/((s+1)(s+2)): no zeros, poles −1 and −2', () => {
    const result = findPolesZeros([new Complex(1, 0)], [new Complex(1, 0), new Complex(3, 0), new Complex(2, 0)])
    expect(result.zeros).toEqual([])
    const poles = result.poles.map((pole) => pole.re).sort((a, b) => a - b)
    expect(poles[0]).toBeCloseTo(-2, 5)
    expect(poles[1]).toBeCloseTo(-1, 5)
  })

  it('(s+1)/(s²+3s+2): zero −1, poles −1 and −2 (cancellable pair kept)', () => {
    const result = findPolesZeros([new Complex(1, 0), new Complex(1, 0)], [new Complex(1, 0), new Complex(3, 0), new Complex(2, 0)])
    expect(result.zeros[0]!.re).toBeCloseTo(-1, 5)
    expect(result.poles).toHaveLength(2)
  })
})

describe('expandPowerSeries (textbook checks)', () => {
  it('0.5z/(z−0.5): impulse response 0.5·0.5ⁿ', () => {
    // H(z) = 0.5/(1 − 0.5·z⁻¹) → numerator [0.5, 0], denominator [1, −0.5]
    const coefficients = expandPowerSeries([new Complex(0.5, 0), new Complex(0, 0)], [new Complex(1, 0), new Complex(-0.5, 0)], 5)
    expect(coefficients.map((c) => c.re)).toEqual([0.5, 0.25, 0.125, 0.0625, 0.03125])
  })

  it('pure delay: 1/z → h = [0, 1]', () => {
    const coefficients = expandPowerSeries([new Complex(1, 0)], [new Complex(1, 0), new Complex(0, 0)], 3)
    expect(coefficients.map((c) => c.re)).toEqual([0, 1, 0])
  })

  it('finite FIR: H = 1 + 0.5·z⁻¹ terminates', () => {
    // (z + 0.5)/z → numerator [1, 0.5], denominator [1, 0]
    const coefficients = expandPowerSeries([new Complex(1, 0), new Complex(0.5, 0)], [new Complex(1, 0), new Complex(0, 0)], 4)
    expect(coefficients.map((c) => c.re)).toEqual([1, 0.5, 0, 0])
  })

  it('constant transfer function: h = [2, 0, 0]', () => {
    const coefficients = expandPowerSeries([new Complex(2, 0)], [new Complex(1, 0)], 3)
    expect(coefficients.map((c) => c.re)).toEqual([2, 0, 0])
  })

  it('rejects non-causal numerator degree and bad counts', () => {
    expect(() => expandPowerSeries([new Complex(1, 0), new Complex(0, 0)], [new Complex(1, 0)], 2)).toThrow(/causal/)
    expect(() => expandPowerSeries([new Complex(1, 0)], [new Complex(1, 0)], -1)).toThrow(/non-negative/)
    expect(() => expandPowerSeries([new Complex(1, 0)], [new Complex(1, 0)], 1.5)).toThrow(/non-negative/)
  })
})
