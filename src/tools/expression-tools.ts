/**
 * Expression tools: the string-expression engine. The LLM never does
 * arithmetic by hand — every intermediate calculation is a calculate call,
 * and rational reduction for transfer-function chains is rational_coefficients.
 * IO is JSON-and-complex-only; expression values are unit 'none' (unit
 * semantics belong to the domain tools).
 */
import { Complex } from 'complex.js'
import { calculateExpression, rationalCoefficients } from '../math/expression.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

export const expressionTools = [
  defineJsonTool({
    name: 'calculate',
    description: 'Evaluate a string math expression and return the complex result. Expression language: + - * / ^ (^ is right-associative, -2^2 = -4), parentheses, unary minus, scientific notation (1e6, 2.5e-3), complex literals with j or i suffix (3+4j, 2i; j/i alone is the imaginary unit), constants pi and e, and functions sin cos tan exp ln log10 sqrt abs arg conjugate real imag. Variables are bound via the variables array; every bound value must have unit "none". Use this for ALL arithmetic — never compute by hand.',
    parameters: {
      expression: { type: 'string', description: 'math expression to evaluate', required: true },
      variables: {
        type: 'array',
        description: 'optional variable bindings, e.g. x = 2, each value unit "none"',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'variable name', required: true },
            value: { ...valueParam(Unit.None, 'variable value (unit must be none)'), required: true },
          },
          required: ['name', 'value'],
        },
      },
    },
    execute: (args) => {
      const variables: Record<string, Complex> = {}
      for (const binding of args.variables ?? []) {
        variables[binding.name] = toComplex(binding.value, Unit.None)
      }
      return serializeComplex(calculateExpression(args.expression, variables), Unit.None)
    },
  }),
  defineJsonTool({
    name: 'rational_coefficients',
    description: 'Reduce an expression built from + - * / and integer powers in one variable to a single rational function and return numerator/denominator coefficients in descending power order. Pure polynomials come back with denominator [1]; negative powers (s^-1), nested divisions and sums of rationals are normalized automatically. Common factors are canceled by default (reduce: false keeps the unreduced pair). Symbols other than the variable (e.g. RC in 1/(1+s*RC)) must be bound via the variables array with unit "none". Functions of the variable (sin(x)) and non-integer powers are rejected. This is the entry point for poles_zeros, transfer_function_response, step_response and partial_fraction.',
    parameters: {
      expression: { type: 'string', description: 'rational expression in one variable', required: true },
      variable: { type: 'string', description: 'the single variable (default "x")' },
      reduce: { type: 'boolean', description: 'cancel common numerator/denominator factors (default true)' },
      variables: {
        type: 'array',
        description: 'optional symbol bindings, e.g. RC = 10000, each value unit "none"',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'symbol name', required: true },
            value: { ...valueParam(Unit.None, 'symbol value (unit must be none)'), required: true },
          },
          required: ['name', 'value'],
        },
      },
    },
    execute: (args) => {
      const variable = args.variable ?? 'x'
      const parameters: Record<string, Complex> = {}
      for (const binding of args.variables ?? []) {
        parameters[binding.name] = toComplex(binding.value, Unit.None)
      }
      const { numerator, denominator } = rationalCoefficients(args.expression, variable, args.reduce ?? true, parameters)
      return {
        variable,
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        numerator: numerator.map((coefficient) => serializeComplex(coefficient, Unit.None)),
        denominator: denominator.map((coefficient) => serializeComplex(coefficient, Unit.None)),
      }
    },
  }),
]
