/**
 * Atomic tools — the low-level layer. These are registered but described as
 * last-resort primitives: the model should prefer concept-level tools
 * (z_rlc_series, z_to_gamma, …) and reach for these only when composing
 * intermediate values by hand.
 */
import { Complex } from 'complex.js'
import { parseComplex } from '../math/parse.ts'
import { serializeComplex } from '../math/format.ts'
import { BaseUnit } from '../math/units.ts'
import { defineJsonTool, complexParam } from './helpers.ts'

type ComplexInput = number | string | { re: number; im: number }

function guardFinite(z: Complex, label: string): void {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) throw new Error(`${label} produced a non-finite value`)
}

const LOW_LEVEL_HINT = 'Low-level primitive — prefer a concept-level tool (e.g. z_rlc_series, z_to_gamma, ac_Power) whenever one fits; use this only to combine intermediate values.'

export const atomicTools = [
  defineJsonTool({
    name: 'complex_add',
    description: `Add two complex numbers. ${LOW_LEVEL_HINT}`,
    parameters: {
      firstComplex: { ...complexParam('first operand'), required: true },
      SecondComplex: { ...complexParam('Second operand'), required: true },
    },
    execute: (args) => {
      const z = parseComplex(args.firstComplex).add(parseComplex(args.SecondComplex))
      guardFinite(z, 'complex_add')
      return serializeComplex(z, BaseUnit.Dimensionless)
    },
  }),
  defineJsonTool({
    name: 'complex_opposite',
    description: `Negate a complex number (z → −z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...complexParam('operand'), required: true },
    },
    execute: (args) => {
      const z = parseComplex(args.operand).neg()
      guardFinite(z, 'complex_opposite')
      return serializeComplex(z, BaseUnit.Dimensionless)
    },
  }),
  defineJsonTool({
    name: 'complex_multiply',
    description: `Multiply two complex numbers. ${LOW_LEVEL_HINT}`,
    parameters: {
      firstComplex: { ...complexParam('first factor'), required: true },
      SecondComplex: { ...complexParam('Second factor'), required: true },
    },
    execute: (args) => {
      const z = parseComplex(args.firstComplex).mul(parseComplex(args.SecondComplex))
      guardFinite(z, 'complex_mul')
      return serializeComplex(z, BaseUnit.Dimensionless)
    },
  }),
  defineJsonTool({
    name: 'complex_reciprocal',
    description: `Take the reciprocal of a complex number (z → 1/z). ${LOW_LEVEL_HINT}`,
    parameters: {
      operand: { ...complexParam('operand, must be non-zero'), required: true },
    },
    execute: (args) => {
      const a = parseComplex(args.operand)
      if (a.abs() === 0) throw new Error('reciprocal of zero is undefined')
      const z = a.inverse()
      guardFinite(z, 'complex_reciprocal')
      return serializeComplex(z, BaseUnit.Dimensionless)
    },
  }),
]
