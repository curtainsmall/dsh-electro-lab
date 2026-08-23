/**
 * Concept-level Smith-chart tools: one textbook concept per tool.
 * IO is JSON-and-complex-only: every value is { re, im, unit }.
 */
import { Complex } from 'complex.js'
import { toComplex, toScalar, serializeComplex, realValue } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import {
  ElementRole,
  MatchSide,
  MatchTopology,
  MatchVariant,
  designMatch,
  reflectionToVswr,
  quarterWaveImpedance,
  returnLossDb,
  impedanceToReflection,
  type MatchElement,
} from '../math/smith.ts'
import { defineJsonTool, valueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const smithTools = [
  defineJsonTool({
    name: 'impedance_to_reflection',
    description: 'Reflection coefficient Γ = (Z − Z0) / (Z + Z0) for impedance on a referenceImpedance line (default 50).',
    parameters: {
      impedance: { ...valueParam(Unit.Resistance, 'load impedance'), required: true },
      referenceImpedance: { ...valueParam(Unit.Resistance, 'reference impedance (default 50)') },
    },
    execute: (args) => {
      const impedance = toComplex(args.impedance, Unit.Resistance)
      const referenceImpedance = args.referenceImpedance === undefined ? 50 : toScalar(args.referenceImpedance, Unit.Resistance)
      return serializeComplex(impedanceToReflection(impedance, referenceImpedance), Unit.None)
    },
  }),
  defineJsonTool({
    name: 'reflection_to_vswr',
    description: 'Voltage standing wave ratio from reflection coefficient: vswr = (1+|Γ|)/(1−|Γ|). |Γ| = 1 (open/short) yields infinity.',
    parameters: {
      reflectionCoefficient: { ...valueParam(Unit.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient, Unit.None)
      const vswr = reflectionToVswr(reflectionCoefficient)
      return { vswr: realValue(vswr, Unit.None), infinite: vswr === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'return_loss',
    description: 'Return loss in dB: −20·log10(|Γ|). |Γ| = 0 (perfect match) yields infinity.',
    parameters: {
      reflectionCoefficient: { ...valueParam(Unit.None, 'reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient, Unit.None)
      const db = returnLossDb(reflectionCoefficient)
      return { returnLossDb: realValue(db, Unit.Log), infinite: db === Number.POSITIVE_INFINITY }
    },
  }),
  defineJsonTool({
    name: 'quarter_wave_transformer',
    description: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load impedance to a line impedance.',
    parameters: {
      lineImpedance: { ...valueParam(Unit.Resistance, 'line impedance'), required: true },
      loadImpedance: { ...valueParam(Unit.Resistance, 'real load impedance'), required: true },
    },
    execute: (args) => {
      const lineImpedance = toScalar(args.lineImpedance, Unit.Resistance)
      const loadImpedance = toScalar(args.loadImpedance, Unit.Resistance)
      return serializeComplex(new Complex(quarterWaveImpedance(lineImpedance, loadImpedance), 0), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'l_network_match',
    description: 'L-network matching two real resistances at a frequency. qualityFactor = √(Rl/Rs − 1); series element (reactance = qualityFactor·Rs) sits next to the smaller resistance, shunt element (reactance = Rl/qualityFactor) next to the larger. Returns both conjugate solutions under "low-pass" / "high-pass" keys with inductance/capacitance values.',
    parameters: {
      sourceImpedance: { ...valueParam(Unit.Resistance, 'source impedance'), required: true },
      loadImpedance: { ...valueParam(Unit.Resistance, 'load impedance'), required: true },
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
    },
    execute: (args) => {
      const sourceImpedance = toScalar(args.sourceImpedance, Unit.Resistance)
      const loadImpedance = toScalar(args.loadImpedance, Unit.Resistance)
      const frequency = toScalar(args.frequency, Unit.Frequency)
      if (sourceImpedance === loadImpedance) return { matched: true, note: 'source and load are already equal — no network needed' }
      const design = designMatch(MatchTopology.L, sourceImpedance, loadImpedance, frequency)
      const angularFrequency = 2 * Math.PI * frequency
      const seriesSide = design.solutions[MatchVariant.LowPass]![0]!.role === ElementRole.SeriesSource
        ? MatchSide.Source
        : MatchSide.Load
      const serialize = (elements: MatchElement[]): Record<string, JsonValue> => {
        const [series, shunt] = elements
        const entry: Record<string, JsonValue> = {
          seriesReactance: realValue(series!.reactance, Unit.Resistance),
          shuntReactance: realValue(shunt!.reactance, Unit.Resistance),
        }
        if (series!.reactance > 0) entry.seriesInductance = realValue(series!.reactance / angularFrequency, Unit.Inductance)
        if (series!.reactance < 0) entry.seriesCapacitance = realValue(-1 / (angularFrequency * series!.reactance), Unit.Capacitance)
        if (shunt!.reactance > 0) entry.shuntInductance = realValue(shunt!.reactance / angularFrequency, Unit.Inductance)
        if (shunt!.reactance < 0) entry.shuntCapacitance = realValue(-1 / (angularFrequency * shunt!.reactance), Unit.Capacitance)
        return entry
      }
      const out: Record<string, JsonValue> = {
        matched: false,
        qualityFactor: realValue(design.qualityFactor, Unit.None),
        seriesSide,
        shuntSide: seriesSide === MatchSide.Source ? MatchSide.Load : MatchSide.Source,
        solutions: {
          [MatchVariant.LowPass]: serialize(design.solutions[MatchVariant.LowPass]),
          [MatchVariant.HighPass]: serialize(design.solutions[MatchVariant.HighPass]),
        },
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'matched_network',
    description: 'Design a matching network between two real resistances at a frequency. topology "l" uses the implied quality factor (√(Rl/Rs − 1)); "pi" and "t" need a specified qualityFactor greater than that minimum. Returns both conjugate solutions under "low-pass" / "high-pass" keys as ordered element lists with reactances and L/C values.',
    parameters: {
      topology: { type: 'string', enum: [MatchTopology.L, MatchTopology.Pi, MatchTopology.T], description: 'network topology', required: true },
      sourceImpedance: { ...valueParam(Unit.Resistance, 'source impedance'), required: true },
      loadImpedance: { ...valueParam(Unit.Resistance, 'load impedance'), required: true },
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
      qualityFactor: { ...valueParam(Unit.None, 'quality factor (required for pi/t; optional for l)') },
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
            reactance: realValue(element.reactance, Unit.Resistance),
          }
          if (element.reactance > 0) entry.inductance = realValue(element.reactance / angularFrequency, Unit.Inductance)
          if (element.reactance < 0) entry.capacitance = realValue(-1 / (angularFrequency * element.reactance), Unit.Capacitance)
          return entry
        })
      return {
        topology: design.topology,
        qualityFactor: realValue(design.qualityFactor, Unit.None),
        solutions: {
          [MatchVariant.LowPass]: { elements: serialize(design.solutions[MatchVariant.LowPass]) },
          [MatchVariant.HighPass]: { elements: serialize(design.solutions[MatchVariant.HighPass]) },
        },
      }
    },
  }),
]
