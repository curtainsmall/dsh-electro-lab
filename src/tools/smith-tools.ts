/**
 * Concept-level Smith-chart tools: one textbook concept per tool.
 * IO is JSON-and-complex-only: every value is { re, im, unit }.
 */
import { Complex } from 'complex.js'
import { toComplex, toScalar, serializeComplex, serializeReal } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
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
    parameters: {
      impedance: { ...createValueParam(Unit.Resistance, 'load impedance'), required: true },
      referenceImpedance: { ...createValueParam(Unit.Resistance, 'reference impedance (default 50)') },
    },
    execute: (args) => {
      const impedance = toComplex(args.impedance, Unit.Resistance)
      const referenceImpedance = args.referenceImpedance === undefined ? 50 : toScalar(args.referenceImpedance, Unit.Resistance)
      return serializeComplex(convertImpedanceToReflection(impedance, referenceImpedance), Unit.None)
    },
  }),
  defineJsonTool({
    name: 'reflection_to_vswr',
    description: 'Voltage standing wave ratio from reflection coefficient: vswr = (1+|Γ|)/(1−|Γ|). |Γ| = 1 (open/short) yields infinity.',
    parameters: {
      reflectionCoefficient: { ...createValueParam(Unit.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient, Unit.None)
      const vswr = convertReflectionToVswr(reflectionCoefficient)
      return { vswr: serializeReal(vswr, Unit.None), infinite: vswr === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'return_loss',
    description: 'Return loss in dB: −20·log10(|Γ|). |Γ| = 0 (perfect match) yields infinity.',
    parameters: {
      reflectionCoefficient: { ...createValueParam(Unit.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient, Unit.None)
      const db = calcReturnLossDb(reflectionCoefficient)
      return { calcReturnLossDb: serializeReal(db, Unit.Log), infinite: db === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'quarter_wave_transformer',
    description: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load impedance to a line impedance.',
    parameters: {
      lineImpedance: { ...createValueParam(Unit.Resistance, 'line impedance'), required: true },
      loadImpedance: { ...createValueParam(Unit.Resistance, 'real load impedance'), required: true },
    },
    execute: (args) => {
      const lineImpedance = toScalar(args.lineImpedance, Unit.Resistance)
      const loadImpedance = toScalar(args.loadImpedance, Unit.Resistance)
      return serializeComplex(new Complex(calcQuarterWaveImpedance(lineImpedance, loadImpedance), 0), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'matched_network',
    description: 'Design a matching network between two real resistances at a frequency. topology "l" uses the implied quality factor (√(Rl/Rs − 1)); "pi" and "t" need a specified qualityFactor greater than that minimum. Returns both conjugate solutions under "low-pass" / "high-pass" keys as ordered element lists with reactances and L/C values; the role of each element (e.g. "series-source") tells which side it sits on.',
    parameters: {
      topology: { type: 'string', enum: [MatchTopology.L, MatchTopology.Pi, MatchTopology.T], description: 'network topology', required: true },
      sourceImpedance: { ...createValueParam(Unit.Resistance, 'source impedance'), required: true },
      loadImpedance: { ...createValueParam(Unit.Resistance, 'load impedance'), required: true },
      frequency: { ...createValueParam(Unit.Frequency, 'frequency'), required: true },
      qualityFactor: { ...createValueParam(Unit.None, 'quality factor (required for pi/t; optional for l)') },
    },
    execute: (args) => {
      const sourceImpedance = toScalar(args.sourceImpedance, Unit.Resistance)
      const loadImpedance = toScalar(args.loadImpedance, Unit.Resistance)
      const frequency = toScalar(args.frequency, Unit.Frequency)
      const qualityFactor = args.qualityFactor === undefined ? undefined : toScalar(args.qualityFactor, Unit.None)
      const design = designMatch(args.topology, sourceImpedance, loadImpedance, frequency, qualityFactor)
      const angularFrequency = 2 * Math.PI * frequency
      const serialize = (elements: MatchElement[]): JsonValue[] =>
        elements.map((element) => {
          const entry: Record<string, JsonValue> = {
            role: element.role,
            reactance: serializeReal(element.reactance, Unit.Resistance),
          }
          const inductance = calcInductanceFromReactance(element.reactance, angularFrequency)
          if (inductance !== undefined) entry.inductance = serializeReal(inductance, Unit.Inductance)
          const capacitance = calcCapacitanceFromReactance(element.reactance, angularFrequency)
          if (capacitance !== undefined) entry.capacitance = serializeReal(capacitance, Unit.Capacitance)
          return entry
        })
      return {
        topology: design.topology,
        qualityFactor: serializeReal(design.qualityFactor, Unit.None),
        solutions: {
          [MatchVariant.LowPass]: { elements: serialize(design.solutions[MatchVariant.LowPass]) },
          [MatchVariant.HighPass]: { elements: serialize(design.solutions[MatchVariant.HighPass]) },
        },
      }
    },
  }),
]
