/**
 * System-analysis tools: partial fractions, frequency and step response of
 * a ratio-form transfer function, difference-equation recursion, and the
 * bode_response combo. Every transfer function comes in as
 * { numerator, denominator } coefficient arrays (the output of
 * rational_coefficients, the single storage form).
 */
import {
  Variable,
  solveDifferenceEquation,
  calcBodeResponse,
  calcFreqPoints,
  expandPartialFraction,
  calcStepResponse,
  calcTransferResponse,
} from '../math/transfer.ts'
import { toComplex, toScalar, serializeComplex, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from '../tool-defines.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

const createCoeffArrayParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: createValueParam(QuantityKind.None, 'coefficient (kind none)'),
})

export const transferTools = [
  defineJsonTool({
    name: 'partial_fraction',
    description: 'Partial-fraction expansion of a transfer function in ratio form: polynomial part (when numerator degree ≥ denominator degree) plus terms { pole, order, residue } so that H(s) = polynomial + Σ residue/(s−pole)^order. Use the residues to invert each term symbolically (e^{pt}, t·e^{pt}, …) for analytic answers.',
    returns: {
      type: 'object',
      fields: {
        terms: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              pole: { type: 'complex', kind: QuantityKind.None },
              order: { type: 'number', kind: QuantityKind.None },
              residue: { type: 'complex', kind: QuantityKind.None },
            },
          },
        },
        polynomial: { type: 'array', items: { type: 'complex', kind: QuantityKind.None } },
      },
    },
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value))
      const denominator = args.denominator.map((value) => toComplex(value))
      const result = expandPartialFraction(numerator, denominator)
      const terms: JsonValue[] = result.terms.map((term) => ({
        pole: serializeComplex(term.pole, QuantityKind.None),
        order: term.order,
        residue: serializeComplex(term.residue, QuantityKind.None),
      }))
      const out: Record<string, JsonValue> = { terms }
      if (result.polynomial.length > 0) {
        out.polynomial = result.polynomial.map((coefficient) => serializeComplex(coefficient, QuantityKind.None))
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'transfer_function_response',
    description: 'Evaluate a transfer function at frequency points: H(jω) for variable "s", H(e^(jωT)) for variable "z" (sampleTime required, seconds). Frequencies in Hz; returns complex responses (magnitude/phase per snapshot).',
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        frequencies: { type: 'array', items: { type: 'number', kind: QuantityKind.None } },
        responses: { type: 'array', items: { type: 'complex', kind: QuantityKind.None } },
      },
    },
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
      variable: {
        type: 'string',
        enum: [Variable.S, Variable.Z],
        description: 'transform variable of the transfer function',
        required: true,
      },
      frequencies: {
        type: 'array' as const,
        description: 'frequency points in Hz',
        items: createValueParam(QuantityKind.Frequency, 'frequency in Hz'),
        required: true,
      },
      sampleTime: { ...createValueParam(QuantityKind.Time, 'sample time in seconds (required for variable "z")') },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value))
      const denominator = args.denominator.map((value) => toComplex(value))
      const frequencies = args.frequencies.map((value) => toScalar(value))
      const sampleTime = args.sampleTime === undefined ? undefined : toScalar(args.sampleTime)
      const points = calcFreqPoints(args.variable, frequencies, sampleTime)
      return {
        variable: args.variable,
        frequencies,
        responses: calcTransferResponse(numerator, denominator, points).map((value) => serializeComplex(value, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'step_response',
    description: 'Step response y(t) of a continuous transfer function H(s) in ratio form (numerator degree ≤ denominator degree required): Y(s) = H(s)/s expanded by partial fractions and inverted analytically. Returns the response at each time point.',
    returns: {
      type: 'object',
      fields: {
        values: { type: 'array', items: { type: 'complex', kind: QuantityKind.None } },
      },
    },
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
      times: {
        type: 'array' as const,
        description: 'time points in seconds',
        items: createValueParam(QuantityKind.Time, 'time in seconds'),
        required: true,
      },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value))
      const denominator = args.denominator.map((value) => toComplex(value))
      const times = args.times.map((value) => toScalar(value))
      return {
        values: calcStepResponse(numerator, denominator, times).map((value) => serializeComplex(value, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'difference_equation_response',
    description: 'Output y[n] of a difference equation y[n] = (Σ bᵢ·x[n−i] − Σ aⱼ·y[n−j])/a₀. The a/b coefficients follow the Laurent convention directly from the equation (a = [1, −a₁, …], b = [b₀, b₁, …]), NOT the ratio form. Input sequence length equals output length; past samples are zero.',
    returns: {
      type: 'object',
      fields: {
        output: { type: 'array', items: { type: 'complex', kind: QuantityKind.None } },
      },
    },
    parameters: {
      a: { ...createCoeffArrayParam('recursive coefficients, Laurent order (a₀ = 1 for a normalized equation)'), required: true },
      b: { ...createCoeffArrayParam('feed-forward coefficients, Laurent order'), required: true },
      input: { ...createSequenceParam('input samples x[n], kind none'), required: true },
    },
    execute: (args) => {
      const a = args.a.map((value) => toComplex(value))
      const b = args.b.map((value) => toComplex(value))
      const input = args.input.map((value) => toComplex(value))
      return {
        output: solveDifferenceEquation(a, b, input).map((value) => serializeComplex(value, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'bode_response',
    description: 'Bode plot of a transfer function in ratio form: magnitude in dB and phase in radians on a logarithmic frequency grid (pointsPerDecade, default 10). Composes the grid, the frequency points and the response in one call. variable "z" requires sampleTime.',
    returns: {
      type: 'object',
      fields: {
        variable: { type: 'string' },
        points: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              frequency: { type: 'number', kind: QuantityKind.Frequency },
              magnitudeDb: { type: 'number', kind: QuantityKind.Log },
              phase: { type: 'number', kind: QuantityKind.Angle },
            },
          },
        },
      },
    },
    parameters: {
      numerator: { ...createCoeffArrayParam('numerator coefficients, descending power order (from rational_coefficients)'), required: true },
      denominator: { ...createCoeffArrayParam('denominator coefficients, descending power order (from rational_coefficients)'), required: true },
      variable: { type: 'string', enum: [Variable.S, Variable.Z], description: 'transform variable (default "s")' },
      frequencyStart: { ...createValueParam(QuantityKind.Frequency, 'grid start frequency (Hz)'), required: true },
      frequencyEnd: { ...createValueParam(QuantityKind.Frequency, 'grid end frequency (Hz)'), required: true },
      pointsPerDecade: { type: 'number', description: 'grid points per decade (default 10)' },
      sampleTime: { ...createValueParam(QuantityKind.Time, 'sample time in seconds (required for variable "z")') },
    },
    execute: (args) => {
      const numerator = args.numerator.map((value) => toComplex(value))
      const denominator = args.denominator.map((value) => toComplex(value))
      const variable = args.variable ?? Variable.S
      const frequencyStart = toScalar(args.frequencyStart)
      const frequencyEnd = toScalar(args.frequencyEnd)
      const pointsPerDecade = args.pointsPerDecade ?? 10
      const sampleTime = args.sampleTime === undefined ? undefined : toScalar(args.sampleTime)
      const result = calcBodeResponse(numerator, denominator, variable, frequencyStart, frequencyEnd, pointsPerDecade, sampleTime)
      return {
        variable,
        points: result.frequencies.map((frequency, index) => ({
          frequency: serializeReal(frequency, QuantityKind.Frequency),
          magnitudeDb: serializeReal(result.magnitudesDb[index]!, QuantityKind.Log),
          phase: serializeReal((result.phasesDeg[index]! * Math.PI) / 180, QuantityKind.Angle),
        })),
      }
    },
  }),
]

function createSequenceParam(description: string) {
  return {
    type: 'array' as const,
    description,
    items: createValueParam(QuantityKind.None, 'value (kind none)'),
  }
}
