/**
 * Polynomial tools: poles/zeros and power-series expansion of a ratio-form
 * transfer function. Everything comes in as { numerator, denominator }
 * coefficient arrays (the output of rational_coefficients, the single
 * storage form).
 */
import { expandPowerSeries, findPolesZeros } from '../math/polynomial.ts'
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
  defineJsonTool({
    name: 'power_series_expansion',
    description: 'Power-series expansion of a z-domain transfer function about z⁻¹: the first `count` coefficients of H(z) = Σ h[n]·z⁻ⁿ ARE the impulse response h[n] (z⁻¹ is the unit delay). Example: H(z) = 0.5/(1 − 0.5·z⁻¹) → numerator [0.5, 0], denominator [1, −0.5] → [0.5, 0.25, 0.125, …].',
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients); constant term must be non-zero'), required: true },
      count: { type: 'integer', description: 'number of leading coefficients h[0]..h[count−1]', required: true },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value, Unit.None))
      const denominator = args.denominator.map((value) => toComplex(value, Unit.None))
      return {
        count: args.count,
        coefficients: expandPowerSeries(numerator, denominator, args.count).map((coefficient) => serializeComplex(coefficient, Unit.None)),
      }
    },
  }),
]
