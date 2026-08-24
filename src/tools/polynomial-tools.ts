/**
 * Polynomial-root tools: poles and zeros of a ratio-form transfer function.
 * Everything comes in as { numerator, denominator } coefficient arrays (the
 * output of rational_coefficients, the single storage form).
 */
import { findPolesZeros } from '../math/polynomial.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'

const createCoeffArrayParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: createValueParam(Unit.None, 'coefficient (unit none)'),
})

export const polynomialTools = [
  defineJsonTool({
    name: 'poles_zeros',
    description: 'Poles (denominator roots) and zeros (numerator roots) of a transfer function in ratio form. Stability: continuous-time (s) poles must lie in the left half-plane; discrete-time (z) poles inside the unit circle. The variable is inferred from your context; roots are complex.',
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value, Unit.None))
      const denominator = args.denominator.map((value) => toComplex(value, Unit.None))
      const { zeros, poles } = findPolesZeros(numerator, denominator)
      return {
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        zeros: zeros.map((root) => serializeComplex(root, Unit.None)),
        poles: poles.map((root) => serializeComplex(root, Unit.None)),
      }
    },
  }),
]
