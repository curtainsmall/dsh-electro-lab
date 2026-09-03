/**
 * Concept-level Smith-chart tools: one standard concept per tool.
 * IO is JSON-and-complex-only: every value is { re, im, kind }.
 */
import { Complex } from 'complex.js'
import { toComplex, toScalar, serializeComplex, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import {
  MatchTopology,
  MatchVariant,
  calcCapacitanceFromReactance,
  designMatch,
  calcInductanceFromReactance,
  convertReflectionToVswr,
  calcQuarterWaveImpedance,
  calcReturnLossDb,
  convertImpedanceToReflection,
  type MatchElement,
} from '../math/smith.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const smithTools = [
  defineJsonTool({
    name: 'impedance_to_reflection',
    description: 'Reflection coefficient Γ = (Z − Z0) / (Z + Z0) for impedance on a referenceImpedance line (default 50).',
    returns: { type: 'complex', kind: QuantityKind.None },
    parameters: {
      impedance: { ...createValueParam(QuantityKind.Resistance, 'load impedance'), required: true },
      referenceImpedance: { ...createValueParam(QuantityKind.Resistance, 'reference impedance (default 50)') },
    },
    execute: (args) => {
      const impedance = toComplex(args.impedance)
      const referenceImpedance = args.referenceImpedance === undefined ? 50 : toScalar(args.referenceImpedance)
      return serializeComplex(convertImpedanceToReflection(impedance, referenceImpedance), QuantityKind.None)
    },
  }),
  defineJsonTool({
    name: 'reflection_to_vswr',
    description: 'Voltage standing wave ratio from reflection coefficient: vswr = (1+|Γ|)/(1−|Γ|). |Γ| = 1 (open/short) yields infinity.',
    returns: {
      type: 'object',
      fields: {
        vswr: { type: 'number', kind: QuantityKind.None },
        infinite: { type: 'boolean' },
      },
    },
    parameters: {
      reflectionCoefficient: { ...createValueParam(QuantityKind.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient)
      const vswr = convertReflectionToVswr(reflectionCoefficient)
      return { vswr: serializeReal(vswr, QuantityKind.None), infinite: vswr === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'return_loss',
    description: 'Return loss in dB: −20·log10(|Γ|). |Γ| = 0 (perfect match) yields infinity.',
    returns: {
      type: 'object',
      fields: {
        returnLossDb: { type: 'number', kind: QuantityKind.Log },
        infinite: { type: 'boolean' },
      },
    },
    parameters: {
      reflectionCoefficient: { ...createValueParam(QuantityKind.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient)
      const db = calcReturnLossDb(reflectionCoefficient)
      return { returnLossDb: serializeReal(db, QuantityKind.Log), infinite: db === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'quarter_wave_transformer',
    description: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load impedance to a line impedance.',
    returns: { type: 'complex', kind: QuantityKind.Resistance },
    parameters: {
      lineImpedance: { ...createValueParam(QuantityKind.Resistance, 'line impedance'), required: true },
      loadImpedance: { ...createValueParam(QuantityKind.Resistance, 'real load impedance'), required: true },
    },
    execute: (args) => {
      const lineImpedance = toScalar(args.lineImpedance)
      const loadImpedance = toScalar(args.loadImpedance)
      return serializeComplex(new Complex(calcQuarterWaveImpedance(lineImpedance, loadImpedance), 0), QuantityKind.Resistance)
    },
  }),
  defineJsonTool({
    name: 'matched_network',
    description: 'Design a matching network between two real resistances at a frequency. topology "l" uses the implied quality factor (√(Rl/Rs − 1)); "pi" and "t" need a specified qualityFactor greater than that minimum. Returns both conjugate solutions under "low-pass" / "high-pass" keys as ordered element lists with reactances and L/C values; the role of each element (e.g. "series-source") tells which side it sits on.',
    returns: {
      type: 'object',
      fields: {
        topology: { type: 'string' },
        qualityFactor: { type: 'number', kind: QuantityKind.None },
        solutions: {
          type: 'object',
          fields: {
            'low-pass': {
              type: 'object',
              fields: {
                elements: {
                  type: 'array',
                  items: {
                    type: 'object',
                    fields: {
                      role: { type: 'string' },
                      reactance: { type: 'number', kind: QuantityKind.Resistance },
                      inductance: { type: 'number', kind: QuantityKind.Inductance },
                      capacitance: { type: 'number', kind: QuantityKind.Capacitance },
                    },
                  },
                },
              },
            },
            'high-pass': {
              type: 'object',
              fields: {
                elements: {
                  type: 'array',
                  items: {
                    type: 'object',
                    fields: {
                      role: { type: 'string' },
                      reactance: { type: 'number', kind: QuantityKind.Resistance },
                      inductance: { type: 'number', kind: QuantityKind.Inductance },
                      capacitance: { type: 'number', kind: QuantityKind.Capacitance },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    parameters: {
      topology: { type: 'string', enum: [MatchTopology.L, MatchTopology.Pi, MatchTopology.T], description: 'network topology', required: true },
      sourceImpedance: { ...createValueParam(QuantityKind.Resistance, 'source impedance'), required: true },
      loadImpedance: { ...createValueParam(QuantityKind.Resistance, 'load impedance'), required: true },
      frequency: { ...createValueParam(QuantityKind.Frequency, 'frequency'), required: true },
      qualityFactor: { ...createValueParam(QuantityKind.None, 'quality factor (required for pi/t; optional for l)') },
    },
    execute: (args) => {
      const sourceImpedance = toScalar(args.sourceImpedance)
      const loadImpedance = toScalar(args.loadImpedance)
      const frequency = toScalar(args.frequency)
      const qualityFactor = args.qualityFactor === undefined ? undefined : toScalar(args.qualityFactor)
      const design = designMatch(args.topology, sourceImpedance, loadImpedance, frequency, qualityFactor)
      const angularFrequency = 2 * Math.PI * frequency
      const serialize = (elements: MatchElement[]): JsonValue[] =>
        elements.map((element) => {
          const entry: Record<string, JsonValue> = {
            role: element.role,
            reactance: serializeReal(element.reactance, QuantityKind.Resistance),
          }
          const inductance = calcInductanceFromReactance(element.reactance, angularFrequency)
          if (inductance !== undefined) entry.inductance = serializeReal(inductance, QuantityKind.Inductance)
          const capacitance = calcCapacitanceFromReactance(element.reactance, angularFrequency)
          if (capacitance !== undefined) entry.capacitance = serializeReal(capacitance, QuantityKind.Capacitance)
          return entry
        })
      return {
        topology: design.topology,
        qualityFactor: serializeReal(design.qualityFactor, QuantityKind.None),
        solutions: {
          [MatchVariant.LowPass]: { elements: serialize(design.solutions[MatchVariant.LowPass]) },
          [MatchVariant.HighPass]: { elements: serialize(design.solutions[MatchVariant.HighPass]) },
        },
      }
    },
  }),
]
