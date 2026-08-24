/**
 * Polynomial-root tools: poles and zeros of a ratio-form transfer function.
 * Everything comes in as { numerator, denominator } coefficient arrays (the
 * output of rational_coefficients, the single storage form).
 */
import { polynomialRoots } from '../math/polynomial.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

const coefficientArrayParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: valueParam(Unit.None, 'coefficient (unit none)'),
})

export const polynomialTools = [
  defineJsonTool({
    name: 'poles_zeros',
    description: 'Poles (denominator roots) and zeros (numerator roots) of a transfer function in ratio form. Stability: continuous-time (s) poles must lie in the left half-plane; discrete-time (z) poles inside the unit circle. The variable is inferred from your context; roots are complex.',
    parameters: {
      numerator: { ...coefficientArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...coefficientArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value, Unit.None))
      const denominator = args.denominator.map((value) => toComplex(value, Unit.None))
      return {
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        zeros: polynomialRoots(numerator).map((root) => serializeComplex(root, Unit.None)),
        poles: polynomialRoots(denominator).map((root) => serializeComplex(root, Unit.None)),
      }
    },
  }),
]
