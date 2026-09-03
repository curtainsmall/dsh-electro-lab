/**
 * Expression tools: the string-expression engine. The LLM never does
 * arithmetic by hand — every intermediate calculation is a calculate call,
 * and rational reduction for transfer-function chains is rational_coefficients.
 * IO is JSON-and-complex-only; expression values are kind 'none' (unit
 * semantics belong to the domain tools).
 */
import { Complex } from 'complex.js'
import { calcExpression, reduceRational } from '../math/expression.ts'
import { toComplex, serializeComplex } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'

export const expressionTools = [
  defineJsonTool({
    name: 'calculate',
    description: 'Evaluate a string math expression and return the complex result. Expression language: + - * / ^ (^ is right-associative, -2^2 = -4), parentheses, unary minus, scientific notation (1e6, 2.5e-3), complex literals with j or i suffix (3+4j, 2i; j/i alone is the imaginary unit), constants pi and e, and functions sin cos tan asin acos atan atan2 exp ln log10 sqrt abs arg conjugate real imag. atan2(y, x) is the angle of x + j·y — for real inputs the standard two-argument arctangent. Variables are bound via the variables array; every bound value must have kind "none". Use this for ALL arithmetic — never compute by hand.',
    returns: { type: 'complex', kind: QuantityKind.None },
    parameters: {
      expression: { type: 'string', description: 'math expression to evaluate', required: true },
      variables: {
        type: 'array',
        description: 'optional variable bindings, e.g. x = 2, each value kind "none"',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'variable name', required: true },
            value: { ...createValueParam(QuantityKind.None, 'variable value (kind must be none)'), required: true },
          },
        },
      },
    },
    execute: (args) => {
      const variables: Record<string, Complex> = {}
      for (const binding of args.variables ?? []) {
        variables[binding.name] = toComplex(binding.value)
      }
      return serializeComplex(calcExpression(args.expression, variables), QuantityKind.None)
    },
  }),
  defineJsonTool({
    name: 'rational_coefficients',
    description: 'Reduce an expression built from + - * / and integer powers in one variable to a single rational function and return numerator/denominator coefficients in descending power order. Pure polynomials come back with denominator [1]; negative powers (s^-1), nested divisions and sums of rationals are normalized automatically. Common factors are canceled by default (reduce: false keeps the unreduced pair). Symbols other than the variable (e.g. RC in 1/(1+s*RC)) must be bound via the variables array with kind "none". Functions of the variable (sin(x)) and non-integer powers are rejected. This is the entry point for poles_zeros, transfer_function_response, step_response and partial_fraction.',
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        numeratorDegree: { type: 'number', kind: QuantityKind.None },
        denominatorDegree: { type: 'number', kind: QuantityKind.None },
        numerator: { type: 'array', item: { type: 'complex', kind: QuantityKind.None } },
        denominator: { type: 'array', item: { type: 'complex', kind: QuantityKind.None } },
      },
    },
    parameters: {
      expression: { type: 'string', description: 'rational expression in one variable', required: true },
      variable: { type: 'string', description: 'the single variable (default "x")' },
      reduce: { type: 'boolean', description: 'cancel common numerator/denominator factors (default true)' },
      variables: {
        type: 'array',
        description: 'optional symbol bindings, e.g. RC = 10000, each value kind "none"',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'symbol name', required: true },
            value: { ...createValueParam(QuantityKind.None, 'symbol value (kind must be none)'), required: true },
          },
        },
      },
    },
    execute: (args) => {
      const variable = args.variable ?? 'x'
      const parameters: Record<string, Complex> = {}
      for (const binding of args.variables ?? []) {
        parameters[binding.name] = toComplex(binding.value)
      }
      const { numerator, denominator } = reduceRational(args.expression, variable, args.reduce ?? true, parameters)
      return {
        variable,
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        numerator: numerator.map((coefficient) => serializeComplex(coefficient, QuantityKind.None)),
        denominator: denominator.map((coefficient) => serializeComplex(coefficient, QuantityKind.None)),
      }
    },
  }),
]
