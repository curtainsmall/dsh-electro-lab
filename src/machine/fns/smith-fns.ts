/**
 * Context fn definitions migrated from src/tools/smith-tools.ts —
 * one FnDef per legacy defineJsonTool. run bodies mirror the old executes
 * (SI base units; toScalar/toComplex unwrapping preserved); real results
 * come back as plain numbers, complex ones as rect complex values.
 *
 * Migration notes (documented deviations from the legacy tool surface):
 * - reflection_to_vswr / return_loss: the legacy tools declared an `infinite`
 *   boolean for the |Γ| = 1 / |Γ| = 0 extremes, but their serializers threw
 *   on non-finite numbers before that flag could ever be returned (and the
 *   context value universe cannot carry Infinity either), so the migrated
 *   fns return only the finite vswr / returnLossDb and those extremes throw.
 * - matched_network: each legacy element carried reactance plus exactly one
 *   of inductance (H, positive reactance) or capacitance (F, negative
 *   reactance) — a context quantity has one fixed kind per field, so each
 *   element now carries role, reactance, a kind string (inductance or
 *   capacitance) and the component magnitude as a kind-None value.
 */
import { Complex } from 'complex.js'
import { ElementKind } from '../../math/circuits.ts'
import {
  MatchTopology,
  MatchVariant,
  calcCapacitanceFromReactance,
  calcInductanceFromReactance,
  calcQuarterWaveImpedance,
  calcReturnLossDb,
  convertImpedanceToReflection,
  convertReflectionToVswr,
  designMatch,
  type MatchElement,
} from '../../math/smith.ts'
import { toComplex, toScalar, serializeComplex, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Kernel complex value → context-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

export const smithFns: FnDef[] = [
  {
    id: 'impedance_to_reflection',
    summary: 'Reflection coefficient Γ = (Z − Z0) / (Z + Z0) for an impedance on a referenceImpedance line (default 50 Ω)',
    parameters: {
      impedance: { type: 'quantity', kind: QuantityKind.Resistance },
      referenceImpedance: { type: 'quantity', kind: QuantityKind.Resistance, optional: true },
    },
    returns: { type: 'quantity', kind: QuantityKind.None },
    run: (args) => {
      const impedance = toComplex(args.impedance as ValuePayload)
      const referenceImpedance = args.referenceImpedance === undefined ? 50 : toScalar(args.referenceImpedance as ValuePayload)
      return rectOf(convertImpedanceToReflection(impedance, referenceImpedance))
    },
  },
  {
    id: 'reflection_to_vswr',
    summary: 'Voltage standing wave ratio from a reflection coefficient: vswr = (1+|Γ|)/(1−|Γ|); |Γ| = 1 (open/short) is unbounded and throws because the value universe holds no infinity',
    parameters: {
      reflectionCoefficient: { type: 'quantity', kind: QuantityKind.None },
    },
    returns: {
      type: 'object',
      fields: {
        vswr: { type: 'quantity', kind: QuantityKind.None },
      },
    },
    run: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient as ValuePayload)
      return { vswr: convertReflectionToVswr(reflectionCoefficient) }
    },
  },
  {
    id: 'return_loss',
    summary: 'Return loss in dB: −20·log10(|Γ|); |Γ| = 0 (perfect match) is unbounded and throws because the value universe holds no infinity',
    parameters: {
      reflectionCoefficient: { type: 'quantity', kind: QuantityKind.None },
    },
    returns: {
      type: 'object',
      fields: {
        returnLossDb: { type: 'quantity', kind: QuantityKind.Log },
      },
    },
    run: (args) => {
      const reflectionCoefficient = toComplex(args.reflectionCoefficient as ValuePayload)
      return { returnLossDb: calcReturnLossDb(reflectionCoefficient) }
    },
  },
  {
    id: 'quarter_wave_transformer',
    summary: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load impedance to a line impedance',
    parameters: {
      lineImpedance: { type: 'quantity', kind: QuantityKind.Resistance },
      loadImpedance: { type: 'quantity', kind: QuantityKind.Resistance },
    },
    returns: { type: 'quantity', kind: QuantityKind.Resistance },
    run: (args) => {
      const lineImpedance = toScalar(args.lineImpedance as ValuePayload)
      const loadImpedance = toScalar(args.loadImpedance as ValuePayload)
      return rectOf(new Complex(calcQuarterWaveImpedance(lineImpedance, loadImpedance), 0))
    },
  },
  {
    id: 'matched_network',
    summary: 'Design a matching network between two real resistances at a frequency: topology l uses the implied quality factor √(Rl/Rs − 1), pi and t need a qualityFactor above that minimum; returns low-pass/high-pass conjugate solutions as ordered elements',
    parameters: {
      topology: { type: 'string', enum: [MatchTopology.L, MatchTopology.Pi, MatchTopology.T] },
      sourceImpedance: { type: 'quantity', kind: QuantityKind.Resistance },
      loadImpedance: { type: 'quantity', kind: QuantityKind.Resistance },
      frequency: { type: 'quantity', kind: QuantityKind.Frequency },
      qualityFactor: { type: 'quantity', kind: QuantityKind.None, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        topology: { type: 'string' },
        qualityFactor: { type: 'quantity', kind: QuantityKind.None },
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
                      reactance: { type: 'quantity', kind: QuantityKind.Resistance },
                      // component kind and magnitude: inductance (H) for a
                      // positive reactance, capacitance (F) for a negative
                      // one — see module header.
                      kind: { type: 'string' },
                      value: { type: 'quantity', kind: QuantityKind.None },
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
                      reactance: { type: 'quantity', kind: QuantityKind.Resistance },
                      kind: { type: 'string' },
                      value: { type: 'quantity', kind: QuantityKind.None },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    run: (args) => {
      const sourceImpedance = toScalar(args.sourceImpedance as ValuePayload)
      const loadImpedance = toScalar(args.loadImpedance as ValuePayload)
      const frequency = toScalar(args.frequency as ValuePayload)
      const qualityFactor = args.qualityFactor === undefined ? undefined : toScalar(args.qualityFactor as ValuePayload)
      const design = designMatch(args.topology as MatchTopology, sourceImpedance, loadImpedance, frequency, qualityFactor)
      const angularFrequency = 2 * Math.PI * frequency
      const serialize = (elements: MatchElement[]): Array<Record<string, unknown>> =>
        elements.map((element) => {
          const inductance = calcInductanceFromReactance(element.reactance, angularFrequency)
          if (inductance !== undefined) {
            return { role: element.role, reactance: element.reactance, kind: ElementKind.Inductance, value: inductance }
          }
          const capacitance = calcCapacitanceFromReactance(element.reactance, angularFrequency)
          if (capacitance !== undefined) {
            return { role: element.role, reactance: element.reactance, kind: ElementKind.Capacitance, value: capacitance }
          }
          throw new Error('match element has zero reactance — cannot size a component')
        })
      return {
        topology: design.topology,
        qualityFactor: design.qualityFactor,
        solutions: {
          [MatchVariant.LowPass]: { elements: serialize(design.solutions[MatchVariant.LowPass]) },
          [MatchVariant.HighPass]: { elements: serialize(design.solutions[MatchVariant.HighPass]) },
        },
      }
    },
  },
]
