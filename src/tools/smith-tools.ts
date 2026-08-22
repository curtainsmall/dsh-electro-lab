/**
 * Concept-level Smith-chart tools: one textbook concept per tool.
 */
import { parseComplex, parseScalar } from '../math/parse.ts'
import { BaseUnit, Unit } from '../math/units.ts'
import { serializeComplex } from '../math/format.ts'
import { Complex } from 'complex.js'
import { gammaToVswr, lNetworkMatch, quarterWaveImpedance, returnLossDb, zToGamma } from '../math/smith.ts'
import { defineJsonTool, quantityParam, complexParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const smithTools = [
  defineJsonTool({
    name: 'z_to_gamma',
    description: 'Reflection coefficient Γ = (Z − Z0) / (Z + Z0) for impedance Z on a Z0 line (default 50 Ω).',
    parameters: {
      impedance: { ...complexParam('load impedance'), required: true },
      referenceImpedance: { ...quantityParam('reference impedance (default 50)') },
    },
    execute: (args) => {
      const impedance = parseComplex(args.impedance, Unit.Resistance)
      const referenceImpedance = args.referenceImpedance === undefined ? 50 : parseScalar(args.referenceImpedance, Unit.Resistance)
      return serializeComplex(zToGamma(impedance, referenceImpedance), BaseUnit.Dimensionless)
    },
  }),
  defineJsonTool({
    name: 'gamma_to_vswr',
    description: 'Voltage standing wave ratio from reflection coefficient: VSWR = (1+|Γ|)/(1−|Γ|). |Γ| = 1 (open/short) yields infinity.',
    parameters: {
      reflectionCoefficient: { ...complexParam('reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = parseComplex(args.reflectionCoefficient)
      return { vswr: gammaToVswr(reflectionCoefficient), display: gammaToVswr(reflectionCoefficient) === Number.POSITIVE_INFINITY ? '∞' : String(gammaToVswr(reflectionCoefficient)) }
    },
  }),
  defineJsonTool({
    name: 'return_loss',
    description: 'Return loss in dB: −20·log10(|Γ|). |Γ| = 0 (perfect match) yields +∞ dB.',
    parameters: {
      reflectionCoefficient: { ...complexParam('reflection coefficient'), required: true },
    },
    execute: (args) => {
      const reflectionCoefficient = parseComplex(args.reflectionCoefficient)
      const db = returnLossDb(reflectionCoefficient)
      return { returnLossDb: db, display: db === Number.POSITIVE_INFINITY ? '∞ dB' : `${db.toFixed(2)} dB` }
    },
  }),
  defineJsonTool({
    name: 'quarter_wave_transformer',
    description: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load ZL to line Z0.',
    parameters: {
      lineImpedance: { ...quantityParam('line impedance'), required: true },
      loadImpedance: { ...quantityParam('real load impedance'), required: true },
    },
    execute: (args) => {
      const lineImpedance = parseScalar(args.lineImpedance, Unit.Resistance)
      const loadImpedance = parseScalar(args.loadImpedance, Unit.Resistance)
      return serializeComplex(new Complex(quarterWaveImpedance(lineImpedance, loadImpedance), 0), BaseUnit.Ohm)
    },
  }),
  defineJsonTool({
    name: 'l_network_match',
    description: 'L-network matching two real Resistances at Frequency f. Q = √(Rl/Rs − 1); series element (X = Q·Rs) sits next to the smaller Resistance, shunt element (X = Rl/Q) next to the larger. Returns both conjugate solutions (low-pass / high-pass) with L/C values.',
    parameters: {
      sourceImpedance: { ...quantityParam('source impedance'), required: true },
      loadImpedance: { ...quantityParam('load impedance'), required: true },
      Frequency: { ...quantityParam('Frequency'), required: true },
    },
    execute: (args) => {
      const sourceImpedance = parseScalar(args.sourceImpedance, Unit.Resistance)
      const loadImpedance = parseScalar(args.loadImpedance, Unit.Resistance)
      const Frequency = parseScalar(args.Frequency, Unit.Frequency)
      const result = lNetworkMatch(sourceImpedance, loadImpedance, Frequency)
      if (result.matched) return { matched: true, note: 'source and load are already equal — no network needed' }
      const out: Record<string, JsonValue> = {
        matched: false,
        q: result.q as number,
        seriesSide: result.seriesSide,
        shuntSide: result.shuntSide,
      }
      if (result.solutions !== undefined) {
        out.solutions = result.solutions.map((s) => {
          const sol: Record<string, JsonValue> = {
            xSeries: fmtReactance(s.xSeries),
            xShunt: fmtReactance(s.xShunt),
          }
          if (s.lSeries !== undefined) sol.lSeries = fmtQ(s.lSeries, BaseUnit.Henry)
          if (s.cSeries !== undefined) sol.cSeries = fmtQ(s.cSeries, BaseUnit.Farad)
          if (s.lShunt !== undefined) sol.lShunt = fmtQ(s.lShunt, BaseUnit.Henry)
          if (s.cShunt !== undefined) sol.cShunt = fmtQ(s.cShunt, BaseUnit.Farad)
          return sol
        })
      }
      return out
    },
  }),
]

function fmtQ(value: number, unit: BaseUnit): Record<string, number | string> {
  return serializeComplex(new Complex(value, 0), unit)
}

function fmtReactance(x: number): Record<string, number | string> {
  return serializeComplex(new Complex(x, 0), BaseUnit.Ohm)
}
