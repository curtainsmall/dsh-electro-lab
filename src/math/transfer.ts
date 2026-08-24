/**
 * System analysis mathematics: transfer functions in ratio form
 * ({ numerator, denominator } descending coefficient arrays, the single
 * storage form), partial-fraction expansion, frequency response, step
 * response, and difference-equation recursion.
 */
import { Complex } from 'complex.js'
import {
  convolvePolynomials,
  dividePolynomials,
  evaluatePolynomial,
  polynomialRoots,
  trimPolynomial,
  type Polynomial,
} from './polynomial.ts'

// ── Enums ────────────────────────────────────────────────────────────────

/** Transform variable of a transfer function. */
export enum Variable {
  S = 's',
  Z = 'z',
}

// ── Types ────────────────────────────────────────────────────────────────

/** One term of a partial-fraction expansion. */
export interface PartialFractionTerm {
  pole: Complex
  order: number
  residue: Complex
}

/** A partial-fraction expansion: polynomial part plus ordered terms. */
export interface PartialFractionResult {
  polynomial: Polynomial
  terms: PartialFractionTerm[]
}

// ── Frequency response ───────────────────────────────────────────────────

/** H(σ) for each point: N(σ)/D(σ) by Horner evaluation. */
export function transferResponse(numerator: Polynomial, denominator: Polynomial, points: Complex[]): Complex[] {
  return points.map((point) => evaluatePolynomial(numerator, point).div(evaluatePolynomial(denominator, point)))
}

// ── Partial fractions ────────────────────────────────────────────────────

/**
 * Partial-fraction expansion of N(s)/D(s) over the complex plane.
 * Steps: long-divide off any polynomial part (deg N ≥ deg D), find and
 * group the denominator roots, then solve the linear system
 *   N(s) = Σ c·D(s)/(s−p)ᵒʳᵈᵉʳ
 * for the residues — no numerical differentiation, exact for polynomial
 * arithmetic.
 */
export function partialFraction(numerator: Polynomial, denominator: Polynomial): PartialFractionResult {
  const d = trimPolynomial(denominator)
  if (d.length <= 1) throw new Error('denominator must be at least degree 1')
  let n = trimPolynomial(numerator)

  // 1. polynomial part
  let polynomial: Polynomial = []
  if (n.length >= d.length) {
    const division = dividePolynomials(n, d)
    polynomial = division.quotient
    n = trimPolynomial(division.remainder)
  }

  // 2. poles with multiplicities
  const roots = polynomialRoots(d)
  const poles: Array<{ pole: Complex; multiplicity: number }> = []
  const sorted = roots.slice().sort((a, b) => a.re - b.re || a.im - b.im)
  for (const root of sorted) {
    const last = poles[poles.length - 1]
    if (last !== undefined && last.pole.sub(root).abs() < 1e-8) last.multiplicity++
    else poles.push({ pole: root, multiplicity: 1 })
  }

  // 3. linear system: unknown residues c for every (pole, order)
  const degree = d.length - 1
  const columns: Complex[][] = []
  for (const { pole, multiplicity } of poles) {
    const factor = [new Complex(1, 0), pole.neg()] // (s − p) descending
    let power = [new Complex(1, 0)]
    for (let order = 1; order <= multiplicity; order++) {
      power = convolvePolynomials(power, factor)
      // D/(s−p)^order is exact; convert the descending quotient to ascending
      // coefficient slots (column index = power) for the linear system.
      const quotientAscending = dividePolynomials(d, power).quotient.slice().reverse()
      const column = new Array(degree).fill(null).map(() => new Complex(0, 0))
      for (let i = 0; i < quotientAscending.length; i++) column[i] = quotientAscending[i]!
      columns.push(column)
    }
  }

  // b = remainder coefficients (ascending), zero-padded to degree
  const nAscending = n.slice().reverse()
  const b: Complex[] = new Array(degree).fill(null).map(() => new Complex(0, 0))
  for (let i = 0; i < nAscending.length; i++) b[i] = nAscending[i]!
  // columns are per-unknown coefficient lists; solveLinearSystem expects rows = equations
  const matrix: Complex[][] = new Array(degree).fill(null).map((_, row) => columns.map((column) => column[row]!))
  const residues = solveLinearSystem(matrix, b)

  // 4. emit terms in pole order, ascending order within a pole
  const terms: PartialFractionTerm[] = []
  let index = 0
  for (const { pole, multiplicity } of poles) {
    for (let order = 1; order <= multiplicity; order++) {
      terms.push({ pole, order, residue: residues[index++]! })
    }
  }
  return { polynomial, terms }
}

/** Gaussian elimination for a complex linear system (rows = equations). */
function solveLinearSystem(matrix: Complex[][], rhs: Complex[]): Complex[] {
  const size = rhs.length
  if (size === 0) return []
  const augmented = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let row = col + 1; row < size; row++) {
      if (augmented[row]![col]!.abs() > augmented[pivot]![col]!.abs()) pivot = row
    }
    if (augmented[pivot]![col]!.abs() === 0) {
      throw new Error('singular system while solving partial-fraction residues')
    }
    ;[augmented[col], augmented[pivot]] = [augmented[pivot]!, augmented[col]!]
    const pivotValue = augmented[col]![col]!
    for (let row = 0; row < size; row++) {
      if (row === col) continue
      const factor = augmented[row]![col]!.div(pivotValue)
      for (let k = col; k <= size; k++) {
        augmented[row]![k] = augmented[row]![k]!.sub(factor.mul(augmented[col]![k]!))
      }
    }
  }
  return augmented.map((row, i) => row[size]!.div(row[i]!))
}

// ── Step response ────────────────────────────────────────────────────────

/**
 * Step response values y(t) of H(s) = N(s)/D(s): Y(s) = H(s)/s, expanded
 * by partial fractions, each term c/(s−p)^k inverts to
 * c·t^(k−1)/(k−1)!·e^(pt). Requires deg N ≤ deg D (physically realizable).
 */
export function stepResponse(numerator: Polynomial, denominator: Polynomial, times: number[]): Complex[] {
  const n = trimPolynomial(numerator)
  const d = trimPolynomial(denominator)
  if (n.length > d.length) throw new Error('step response requires numerator degree ≤ denominator degree')
  if (d.length === 0) throw new Error('denominator must be at least degree 1')
  const timesDenominator = [...d, new Complex(0, 0)] // D(s)·s: append the zero (raise every power)
  const { terms } = partialFraction(n, timesDenominator)
  return times.map((t) => {
    let sum = new Complex(0, 0)
    for (const term of terms) {
      const exponential = term.pole.mul(t).exp()
      let tPower = new Complex(1, 0)
      let factorial = 1
      for (let k = 1; k < term.order; k++) {
        tPower = tPower.mul(t)
        factorial *= k
      }
      sum = sum.add(term.residue.mul(tPower).mul(exponential).div(factorial))
    }
    return sum
  })
}

// ── Difference equations ─────────────────────────────────────────────────

/**
 * Difference-equation recursion (Laurent a/b convention, the natural
 * textbook form of a digital filter):
 *   y[n] = (Σᵢ bᵢ·x[n−i] − Σⱼ aⱼ·y[n−j]) / a₀
 * Output length equals the input length; past samples are zero.
 */
export function differenceEquation(a: Polynomial, b: Polynomial, input: Complex[]): Complex[] {
  const a0 = a[0] ?? new Complex(1, 0)
  if (a0.abs() === 0) throw new Error('a[0] must be non-zero')
  const output: Complex[] = []
  for (let n = 0; n < input.length; n++) {
    let sum = new Complex(0, 0)
    for (let i = 0; i < b.length; i++) {
      const sample = input[n - i]
      if (sample !== undefined) sum = sum.add(b[i]!.mul(sample))
    }
    for (let j = 1; j < a.length; j++) {
      const sample = output[n - j]
      if (sample !== undefined) sum = sum.sub(a[j]!.mul(sample))
    }
    output.push(sum.div(a0))
  }
  return output
}
