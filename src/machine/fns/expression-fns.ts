/**
 * Expression fns (migrated from tools/expression-tools.ts): string-expression
 * evaluation and rational reduction. Expression values are kind-none
 * quantities; variable/symbol bindings are kind-none quantities too.
 */
import type { Complex } from 'complex.js'
import { calcExpression, reduceRational } from '../../math/expression.ts'
import { serializeComplex, toComplex, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Kernel complex value → context-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

/** Variable/symbol binding: name + quantity payload. */
interface Binding {
  name: string
  value: ValuePayload
}

export const expressionFns: FnDef[] = [
  {
    id: 'calculate',
    summary: 'Evaluate a string math expression and return the complex result',
    parameters: {
      expression: { type: 'string' },
      variables: {
        type: 'array',
        optional: true,
        items: {
          type: 'object',
          fields: {
            name: { type: 'string' },
            value: { type: 'quantity', kind: QuantityKind.None },
          },
        },
      },
    },
    returns: { type: 'quantity', kind: QuantityKind.None },
    run: (args) => {
      const variables = args.variables as Binding[] | undefined
      const bindings: Record<string, Complex> = {}
      for (const binding of variables ?? []) bindings[binding.name] = toComplex(binding.value)
      return rectOf(calcExpression(args.expression as string, bindings))
    },
  },
  {
    id: 'rational_coefficients',
    summary: 'Reduce an expression in one variable to a rational function and return numerator/denominator coefficients',
    parameters: {
      expression: { type: 'string' },
      variable: { type: 'string', optional: true },
      reduce: { type: 'boolean', optional: true },
      variables: {
        type: 'array',
        optional: true,
        items: {
          type: 'object',
          fields: {
            name: { type: 'string' },
            value: { type: 'quantity', kind: QuantityKind.None },
          },
        },
      },
    },
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        numeratorDegree: { type: 'quantity', kind: QuantityKind.None },
        denominatorDegree: { type: 'quantity', kind: QuantityKind.None },
        numerator: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
        denominator: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const variable = (args.variable as string | undefined) ?? 'x'
      const bindings = args.variables as Binding[] | undefined
      const parameters: Record<string, Complex> = {}
      for (const binding of bindings ?? []) parameters[binding.name] = toComplex(binding.value)
      const { numerator, denominator } = reduceRational(
        args.expression as string,
        variable,
        (args.reduce as boolean | undefined) ?? true,
        parameters,
      )
      return {
        variable,
        numeratorDegree: numerator.length - 1,
        denominatorDegree: denominator.length - 1,
        numerator: numerator.map((coefficient) => rectOf(coefficient)),
        denominator: denominator.map((coefficient) => rectOf(coefficient)),
      }
    },
  },
]
