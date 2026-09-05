/**
 * System-analysis fns (migrated from tools/transfer-tools.ts): partial
 * fractions, frequency and step response of a ratio-form transfer function,
 * difference-equation recursion, and the bode_response combo. Coefficient
 * arrays are kind-none quantities in descending power order.
 */
import type { Complex } from 'complex.js'
import {
  Variable,
  solveDifferenceEquation,
  calcBodeResponse,
  calcFreqPoints,
  expandPartialFraction,
  calcStepResponse,
  calcTransferResponse,
} from '../../math/transfer.ts'
import { serializeComplex, toComplex, toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Kernel complex value → context-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

const coefficientArray = { type: 'array' as const, items: { type: 'quantity' as const, kind: QuantityKind.None } }

export const transferFns: FnDef[] = [
  {
    id: 'partial_fraction',
    summary: 'Partial-fraction expansion of a ratio-form transfer function',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
    },
    returns: {
      type: 'object',
      fields: {
        terms: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              pole: { type: 'quantity', kind: QuantityKind.None },
              order: { type: 'quantity', kind: QuantityKind.None },
              residue: { type: 'quantity', kind: QuantityKind.None },
            },
          },
        },
        polynomial: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const result = expandPartialFraction(numerator, denominator)
      return {
        terms: result.terms.map((term) => ({
          pole: rectOf(term.pole),
          order: term.order,
          residue: rectOf(term.residue),
        })),
        polynomial: result.polynomial.map((coefficient) => rectOf(coefficient)),
      }
    },
  },
  {
    id: 'transfer_function_response',
    summary: 'Evaluate a transfer function at frequency points (H(jω) or H(e^(jωT)))',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
      variable: { type: 'string', enum: [Variable.S, Variable.Z] },
      frequencies: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Frequency } },
      sampleTime: { type: 'quantity', kind: QuantityKind.Time, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        frequencies: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
        responses: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const frequencies = (args.frequencies as ValuePayload[]).map((value) => toScalar(value))
      const sampleTime = args.sampleTime === undefined ? undefined : toScalar(args.sampleTime as ValuePayload)
      const variable = args.variable as Variable
      const points = calcFreqPoints(variable, frequencies, sampleTime)
      return {
        variable,
        frequencies,
        responses: calcTransferResponse(numerator, denominator, points).map((value) => rectOf(value)),
      }
    },
  },
  {
    id: 'step_response',
    summary: 'Step response of a continuous transfer function at time points',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
      times: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Time } },
    },
    returns: {
      type: 'object',
      fields: {
        values: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const times = (args.times as ValuePayload[]).map((value) => toScalar(value))
      return {
        values: calcStepResponse(numerator, denominator, times).map((value) => rectOf(value)),
      }
    },
  },
  {
    id: 'difference_equation_response',
    summary: 'Difference-equation recursion output y[n] (Laurent a/b convention)',
    parameters: {
      a: coefficientArray,
      b: coefficientArray,
      input: coefficientArray,
    },
    returns: {
      type: 'object',
      fields: {
        output: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const a = (args.a as ValuePayload[]).map((value) => toComplex(value))
      const b = (args.b as ValuePayload[]).map((value) => toComplex(value))
      const input = (args.input as ValuePayload[]).map((value) => toComplex(value))
      return {
        output: solveDifferenceEquation(a, b, input).map((value) => rectOf(value)),
      }
    },
  },
  {
    id: 'bode_response',
    summary: 'Bode plot of a ratio-form transfer function on a logarithmic frequency grid',
    parameters: {
      numerator: coefficientArray,
      denominator: coefficientArray,
      variable: { type: 'string', enum: [Variable.S, Variable.Z], optional: true },
      frequencyStart: { type: 'quantity', kind: QuantityKind.Frequency },
      frequencyEnd: { type: 'quantity', kind: QuantityKind.Frequency },
      pointsPerDecade: { type: 'quantity', kind: QuantityKind.None, optional: true },
      sampleTime: { type: 'quantity', kind: QuantityKind.Time, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        points: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              frequency: { type: 'quantity', kind: QuantityKind.Frequency },
              magnitudeDb: { type: 'quantity', kind: QuantityKind.Log },
              phase: { type: 'quantity', kind: QuantityKind.Angle },
            },
          },
        },
      },
    },
    run: (args) => {
      const numerator = (args.numerator as ValuePayload[]).map((value) => toComplex(value))
      const denominator = (args.denominator as ValuePayload[]).map((value) => toComplex(value))
      const variable = (args.variable as Variable | undefined) ?? Variable.S
      const frequencyStart = toScalar(args.frequencyStart as ValuePayload)
      const frequencyEnd = toScalar(args.frequencyEnd as ValuePayload)
      const pointsPerDecade = (args.pointsPerDecade as number | undefined) ?? 10
      const sampleTime = args.sampleTime === undefined ? undefined : toScalar(args.sampleTime as ValuePayload)
      const result = calcBodeResponse(numerator, denominator, variable, frequencyStart, frequencyEnd, pointsPerDecade, sampleTime)
      return {
        variable,
        points: result.frequencies.map((frequency, index) => ({
          frequency,
          magnitudeDb: result.magnitudesDb[index]!,
          phase: (result.phasesDeg[index]! * Math.PI) / 180,
        })),
      }
    },
  },
]
