/**
 * Atomic tools — the low-level layer. These are registered but described as
 * last-resort primitives: the model should prefer concept-level tools
 * (rlc_series_impedance, impedance_to_reflection, ac_power) and reach for these only when
 * composing intermediate values by hand.
 *
 * IO is JSON-and-complex-only: operands are dimensionless complex values.
 */
import { Complex } from 'complex.js'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

function guardFinite(z: Complex, label: string): void {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) throw new Error(`${label} produced a non-finite value`)
}

const LOW_LEVEL_HINT = 'Low-level primitive — prefer a concept-level tool (e.g. rlc_series_impedance, impedance_to_reflection, ac_power) whenever one fits; use this only to combine intermediate values.'

export const atomicTools = [
  defineJsonTool({
    name: 'complex_add',
    description: `Add two complex numbers. ${LOW_LEVEL_HINT}`,
    parameters: {
      firstComplex: { ...valueParam(Unit.None, 'first operand'), required: true },
      secondComplex: { ...valueParam(Unit.None, 'second operand'), required: true },
    },
    execute: (args) => {
      const z = toComplex(args.firstComplex, Unit.None).add(toComplex(args.secondComplex, Unit.None))
      guardFinite(z, 'complex_add')
      return serializeComplex(z, Unit.None)
    },
  }),
  defineJsonTool({
    name: 'complex_opposite',
    description: `Negate a complex number (z → −z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...valueParam(Unit.None, 'operand'), required: true },
    },
    execute: (args) => {
      const z = toComplex(args.operand, Unit.None).neg()
      guardFinite(z, 'complex_opposite')
      return serializeComplex(z, Unit.None)
    },
  }),
  defineJsonTool({
    name: 'complex_multiply',
    description: `Multiply two complex numbers. ${LOW_LEVEL_HINT}`,
    parameters: {
      firstComplex: { ...valueParam(Unit.None, 'first factor'), required: true },
      secondComplex: { ...valueParam(Unit.None, 'second factor'), required: true },
    },
    execute: (args) => {
      const z = toComplex(args.firstComplex, Unit.None).mul(toComplex(args.secondComplex, Unit.None))
      guardFinite(z, 'complex_multiply')
      return serializeComplex(z, Unit.None)
    },
  }),
  defineJsonTool({
    name: 'complex_reciprocal',
    description: `Take the reciprocal of a complex number (z → 1/z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...valueParam(Unit.None, 'operand, must be non-zero'), required: true },
    },
    execute: (args) => {
      const a = toComplex(args.operand, Unit.None)
      if (a.abs() === 0) throw new Error('reciprocal of zero is undefined')
      const z = a.inverse()
      guardFinite(z, 'complex_reciprocal')
      return serializeComplex(z, Unit.None)
    },
  }),
]
