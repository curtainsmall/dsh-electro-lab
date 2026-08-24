/**
 * Complex arithmetic tools — the low-level layer. These are registered but
 * described as last-resort primitives: the model should prefer the
 * expression engine (calculate) or concept-level tools and reach for these
 * only when composing intermediate values by hand.
 *
 * IO is JSON-and-complex-only: operands are dimensionless complex values.
 */
import {
  addComplex,
  assertFiniteComplex,
  multiplyComplex,
  negateComplex,
  reciprocalComplex,
} from '../math/complex.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

const LOW_LEVEL_HINT = 'Low-level primitive — prefer calculate or a concept-level tool (e.g. circuit_impedance, impedance_to_reflection, ac_power) whenever one fits; use this only to combine intermediate values.'

export const complexTools = [
  defineJsonTool({
    name: 'complex_add',
    description: `Add two complex numbers. ${LOW_LEVEL_HINT}`,
    parameters: {
      firstComplex: { ...valueParam(Unit.None, 'first operand'), required: true },
      secondComplex: { ...valueParam(Unit.None, 'second operand'), required: true },
    },
    execute: (args) => {
      const result = addComplex(toComplex(args.firstComplex, Unit.None), toComplex(args.secondComplex, Unit.None))
      assertFiniteComplex(result, 'complex_add')
      return serializeComplex(result, Unit.None)
    },
  }),
  defineJsonTool({
    name: 'complex_opposite',
    description: `Negate a complex number (z → −z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...valueParam(Unit.None, 'operand'), required: true },
    },
    execute: (args) => {
      const result = negateComplex(toComplex(args.operand, Unit.None))
      assertFiniteComplex(result, 'complex_opposite')
      return serializeComplex(result, Unit.None)
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
      const result = multiplyComplex(toComplex(args.firstComplex, Unit.None), toComplex(args.secondComplex, Unit.None))
      assertFiniteComplex(result, 'complex_multiply')
      return serializeComplex(result, Unit.None)
    },
  }),
  defineJsonTool({
    name: 'complex_reciprocal',
    description: `Take the reciprocal of a complex number (z → 1/z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...valueParam(Unit.None, 'operand, must be non-zero'), required: true },
    },
    execute: (args) => {
      const result = reciprocalComplex(toComplex(args.operand, Unit.None))
      assertFiniteComplex(result, 'complex_reciprocal')
      return serializeComplex(result, Unit.None)
    },
  }),
]
