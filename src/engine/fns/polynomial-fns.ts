/**
 * Polynomial fns (migrated from tools/polynomial-tools.ts): poles/zeros and
 * power-series expansion of a ratio-form transfer function. Coefficient
 * arrays are kind-none quantities in descending power order.
 */
import type { Complex } from 'complex.js'
import { expandPowerSeries, findPolesZeros } from '../../math/polynomial.ts'
import { serializeComplex, toComplex, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Kernel complex value → engine-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

const coefficientArray = { type: 'array' as const, items: { type: 'quantity' as const, kind: QuantityKind.None } }

export const polynomialFns: FnDef[] = [
  {
    id: 'poles_zeros',
    summary: 'Poles and zeros of a ratio-form transfer function',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
    },
    returns: {
      type: 'object',
      fields: {
        numeratorDegree: { type: 'quantity', kind: QuantityKind.None },
        denominatorDegree: { type: 'quantity', kind: QuantityKind.None },
        zeros: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
        poles: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const { zeros, poles } = findPolesZeros(numerator, denominator)
      return {
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        zeros: zeros.map((root) => rectOf(root)),
        poles: poles.map((root) => rectOf(root)),
      }
    },
  },
  {
    id: 'power_series_expansion',
    summary: 'Power-series expansion of a z-domain transfer function about z⁻¹ (impulse response)',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
      count: { type: 'quantity', kind: QuantityKind.None },
    },
    returns: {
      type: 'object',
      fields: {
        count: { type: 'quantity', kind: QuantityKind.None },
        coefficients: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const count = args.count as number
      return {
        count,
        coefficients: expandPowerSeries(numerator, denominator, count).map((coefficient) => rectOf(coefficient)),
      }
    },
  },
]
