/**
 * Complex arithmetic primitives: the bare operations behind the low-level
 * tools. Every tool executes only IO (unwrap, validate, serialize) and
 * delegates all computation here.
 */
import { Complex } from 'complex.js'

/** Add two complex numbers. */
export function addComplex(left: Complex, right: Complex): Complex {
  return left.add(right)
}

/** Negate a complex number (z → −z). */
export function negateComplex(value: Complex): Complex {
  return value.neg()
}

/** Multiply two complex numbers. */
export function multiplyComplex(left: Complex, right: Complex): Complex {
  return left.mul(right)
}

/** Reciprocal of a complex number (throws on zero). */
export function reciprocalComplex(value: Complex): Complex {
  if (value.abs() === 0) throw new Error('reciprocal of zero is undefined')
  return value.inverse()
}

/** Raise unless the value is finite (NaN/Infinity guard). */
export function assertFiniteComplex(value: Complex, label: string): void {
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) throw new Error(`${label} produced a non-finite value`)
}
