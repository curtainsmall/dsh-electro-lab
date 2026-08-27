/**
 * Series mathematics: arithmetic series, geometric series (finite and
 * convergent infinite), and natural-number power sums. SI base units;
 * terms are plain real numbers.
 */

/** Power-sum exponent: Σk, Σk² or Σk³ over the first n natural numbers. */
export enum PowerSumKind {
  Linear = 'linear',
  Square = 'square',
  Cube = 'cube',
}

/**
 * Arithmetic series: a₁, a₁+d, …, a₁+(n−1)d.
 * Sum = n·(a₁ + aₙ)/2 with last term aₙ = a₁ + (n−1)d.
 */
export function calcArithmeticSeries(
  firstTerm: number,
  commonDifference: number,
  count: number,
): { sum: number; lastTerm: number } {
  if (count < 1 || !Number.isInteger(count)) throw new Error('count must be a positive integer')
  const lastTerm = firstTerm + (count - 1) * commonDifference
  return { sum: (count * (firstTerm + lastTerm)) / 2, lastTerm }
}

/**
 * Geometric series: a₁, a₁·r, …, a₁·rⁿ⁻¹.
 * Finite: sum = a₁(1−rⁿ)/(1−r) (r = 1 handled separately) with last term
 * a₁·rⁿ⁻¹. Infinite (infinite = true): converges iff |r| < 1 to a₁/(1−r);
 * a diverging infinite series raises an error.
 */
export function calcGeometricSeries(
  firstTerm: number,
  commonRatio: number,
  count: number,
  infinite = false,
): { sum: number; lastTerm?: number; converges?: boolean } {
  if (count < 1 || !Number.isInteger(count)) throw new Error('count must be a positive integer')
  if (infinite) {
    if (Math.abs(commonRatio) >= 1) throw new Error('infinite geometric series diverges unless |r| < 1')
    return { sum: firstTerm / (1 - commonRatio), converges: true }
  }
  if (commonRatio === 1) {
    return { sum: firstTerm * count, lastTerm: firstTerm }
  }
  const lastTerm = firstTerm * commonRatio ** (count - 1)
  return { sum: (firstTerm * (1 - commonRatio ** count)) / (1 - commonRatio), lastTerm }
}

/**
 * Natural-number power sum: Σk = n(n+1)/2, Σk² = n(n+1)(2n+1)/6,
 * Σk³ = [n(n+1)/2]².
 */
export function calcPowerSum(power: PowerSumKind, count: number): { sum: number } {
  if (count < 1 || !Number.isInteger(count)) throw new Error('count must be a positive integer')
  const n = count
  switch (power) {
    case PowerSumKind.Linear:
      return { sum: (n * (n + 1)) / 2 }
    case PowerSumKind.Square:
      return { sum: (n * (n + 1) * (2 * n + 1)) / 6 }
    case PowerSumKind.Cube:
      return { sum: ((n * (n + 1)) / 2) ** 2 }
  }
}
