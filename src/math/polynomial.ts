/**
 * Polynomial arithmetic center: shared coefficient operations used by the
 * expression engine, the transfer-function layer and the matching/root
 * tools. Coefficients are complex numbers in DESCENDING power order
 * [aₙ … a₁, a₀] everywhere on the API; long division reverses internally
 * to ascending order (index = power) for a clean elimination loop.
 */
import { Complex } from 'complex.js'

/** A polynomial: complex coefficients in DESCENDING power order [aₙ … a₁, a₀]. */
export type Polynomial = Complex[]

/** Trim leading zero coefficients, keeping at least one entry. */
export function trimPolynomial(coefficients: Polynomial): Polynomial {
  let start = 0
  while (start < coefficients.length - 1 && coefficients[start]!.abs() === 0) start++
  return coefficients.slice(start)
}

/** A polynomial is zero when every coefficient vanishes. */
export function isZeroPolynomial(coefficients: Polynomial): boolean {
  return coefficients.every((coefficient) => coefficient.abs() === 0)
}

/** Align lengths, then add element-wise. */
export function addPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const length = Math.max(left.length, right.length)
  const result: Complex[] = []
  for (let i = 0; i < length; i++) {
    const l = left[left.length - 1 - i] ?? new Complex(0, 0)
    const r = right[right.length - 1 - i] ?? new Complex(0, 0)
    result.unshift(l.add(r))
  }
  return result
}

/** Multiplication as coefficient convolution. */
export function convolvePolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const result: Complex[] = new Array(left.length + right.length - 1).fill(null).map(() => new Complex(0, 0))
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      result[i + j] = result[i + j]!.add(left[i]!.mul(right[j]!))
    }
  }
  return result
}

/**
 * Polynomial long division, descending coefficient order (the standard
 * across this module): dividend = quotient · divisor + remainder. The
 * division itself runs in ascending order (index = power) so the highest
 * term is eliminated cleanly each round; both results are polynomials —
 * never empty, the zero polynomial is [0].
 */
export function dividePolynomials(dividend: Polynomial, divisor: Polynomial): { quotient: Polynomial; remainder: Polynomial } {
  const remainder = dividend.slice().reverse()
  const divisorAscending = divisor.slice().reverse()
  const quotientAscending: Complex[] = new Array(Math.max(remainder.length - divisorAscending.length + 1, 1)).fill(null).map(() => new Complex(0, 0))
  const leading = divisorAscending[divisorAscending.length - 1]!
  while (remainder.length >= divisorAscending.length && remainder[remainder.length - 1]!.abs() !== 0) {
    const degree = remainder.length - divisorAscending.length
    const factor = remainder[remainder.length - 1]!.div(leading)
    quotientAscending[degree] = quotientAscending[degree]!.add(factor)
    for (let i = 0; i < divisorAscending.length; i++) {
      remainder[degree + i] = remainder[degree + i]!.sub(factor.mul(divisorAscending[i]!))
    }
    remainder.pop()
    while (remainder.length > 1 && remainder[remainder.length - 1]!.abs() === 0) remainder.pop()
  }
  // Both results are polynomials — never empty, no trailing zeros: the
  // quotient slots are written exactly once each, and the remainder loop
  // above already stripped its high-power zeros.
  return {
    quotient: quotientAscending.reverse(),
    remainder: remainder.reverse(),
  }
}

/** Polynomial GCD by the Euclidean algorithm, made monic. */
export function findPolyGcd(left: Polynomial, right: Polynomial): Polynomial {
  let a = trimPolynomial(left)
  let b = trimPolynomial(right)
  while (!isZeroPolynomial(b)) {
    const { remainder } = dividePolynomials(a, b)
    a = b
    b = remainder
  }
  const leading = a[0]!
  return a.map((coefficient) => coefficient.div(leading))
}

/** Horner evaluation of a descending coefficient array. */
export function evaluatePolynomial(coefficients: Polynomial, point: Complex): Complex {
  let result = new Complex(0, 0)
  for (const coefficient of coefficients) {
    result = result.mul(point).add(coefficient)
  }
  return result
}

/** Zeros (numerator roots) and poles (denominator roots) of a ratio. */
export function findPolesZeros(numerator: Polynomial, denominator: Polynomial): { zeros: Complex[]; poles: Complex[] } {
  return {
    zeros: findPolyRoots(numerator),
    poles: findPolyRoots(denominator),
  }
}

/**
 * Power-series expansion of N(z)/D(z) about z⁻¹: the first `count` terms of
 * H(z) = Σ h[n]·z⁻ⁿ. In the z domain these coefficients ARE the impulse
 * response h[n]. With w = 1/z, H(1/w) = w^(degD−degN)·N(w)/D(w) where the
 * descending coefficient arrays double as ascending w polynomials (the
 * reversal cancels); the ratio is expanded by the coefficient recurrence
 * f[k] = (n[k] − Σᵢ₌₁ d[i]·f[k−i])/d[0], then shifted by degD−degN.
 */
export function expandPowerSeries(numerator: Polynomial, denominator: Polynomial, count: number): Complex[] {
  if (!Number.isInteger(count) || count < 0) throw new Error('count must be a non-negative integer')
  const n = trimPolynomial(numerator)
  const d = trimPolynomial(denominator)
  const leading = d[0]!
  if (leading.abs() === 0) throw new Error('denominator must be a non-zero polynomial')
  const shift = d.length - n.length // degD − degN
  if (shift < 0) throw new Error('numerator degree must not exceed denominator degree (causal system required)')
  const ratio: Complex[] = []
  for (let k = 0; k < count; k++) {
    let sum = n[k] ?? new Complex(0, 0)
    for (let i = 1; i < d.length && k - i >= 0; i++) {
      sum = sum.sub(d[i]!.mul(ratio[k - i]!))
    }
    ratio.push(sum.div(leading))
  }
  const coefficients: Complex[] = []
  for (let k = 0; k < count; k++) {
    coefficients.push(k < shift ? new Complex(0, 0) : ratio[k - shift]!)
  }
  return coefficients
}

/**
 * Durand-Kerner (Weierstrass) iteration for all roots of a descending
 * coefficient array. Returns [] for constants; non-monic input is
 * normalized internally. Convergence is quadratic for simple roots; the
 * iteration stops after MAX_ITERATIONS and returns the best estimate.
 */
export function findPolyRoots(coefficients: Polynomial): Complex[] {
  const trimmed = trimPolynomial(coefficients)
  const degree = trimmed.length - 1
  if (degree <= 0) return []
  const monic = trimmed.map((coefficient) => coefficient.div(trimmed[0]!))
  const roots: Complex[] = []
  for (let k = 0; k < degree; k++) {
    roots.push(new Complex(0.4, 0.9).pow(k))
  }
  const MAX_ITERATIONS = 200
  const tolerance = 1e-14
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let maxDelta = 0
    for (let k = 0; k < degree; k++) {
      const current = roots[k]!
      const value = evaluatePolynomial(monic, current)
      let denominator = new Complex(1, 0)
      for (let j = 0; j < degree; j++) {
        if (j !== k) denominator = denominator.mul(current.sub(roots[j]!))
      }
      const delta = value.div(denominator)
      roots[k] = current.sub(delta)
      maxDelta = Math.max(maxDelta, delta.abs())
    }
    if (maxDelta < tolerance) break
  }
  return roots
}
