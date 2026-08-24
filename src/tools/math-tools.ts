/**
 * General math tools: the string-expression engine. The LLM never does
 * arithmetic by hand — every intermediate calculation is a calculate call,
 * and polynomial expansion for transfer-function chains is polynomial_coefficients.
 * IO is JSON-and-complex-only; expression values are unit 'none' (unit
 * semantics belong to the domain tools).
 */
import { Complex } from 'complex.js'
import { calculateExpression, polynomialCoefficients } from '../math/expression.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

export const mathTools = [
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
    name: 'polynomial_coefficients',
    description: 'Expand a polynomial expression in one variable and return its coefficients in descending power order [aₙ … a₁, a₀]. Supports addition, subtraction, multiplication and non-negative integer powers, e.g. "(x+1)*(x-2)" → [1, -1, -2]; complex coefficients are fine, e.g. "(1+j)*x+2" → [1+j, 2]. Use this to turn transfer-function expressions into coefficient arrays for poles_zeros and transfer_function_response. Functions of the variable (sin(x)) are rejected.',
    parameters: {
      expression: { type: 'string', description: 'polynomial expression in one variable', required: true },
      variable: { type: 'string', description: 'the single variable (default "x")' },
    },
    execute: (args) => {
      const variable = args.variable ?? 'x'
      const { degree, coefficients } = polynomialCoefficients(args.expression, variable)
      return {
        variable,
        degree,
        coefficients: coefficients.map((coefficient) => serializeComplex(coefficient, Unit.None)),
      }
    },
  }),
]
