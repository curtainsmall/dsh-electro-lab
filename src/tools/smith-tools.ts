/**
 * Concept-level Smith-chart tools: one textbook concept per tool.
 */
import { parseComplex, parseScalar } from '../math/parse.ts'
import { BaseUnit, UnitFamily } from '../math/units.ts'
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
      z: { ...complexParam('load impedance'), required: true },
      z0: { ...quantityParam('reference impedance (default 50)') },
    },
    execute: (args) => {
      const z = parseComplex(args.z, UnitFamily.RESISTANCE)
      const z0 = args.z0 === undefined ? 50 : parseScalar(args.z0, UnitFamily.RESISTANCE)
      return serializeComplex(zToGamma(z, z0), BaseUnit.DIMENSIONLESS)
    },
  }),
  defineJsonTool({
    name: 'gamma_to_vswr',
    description: 'Voltage standing wave ratio from reflection coefficient: VSWR = (1+|Γ|)/(1−|Γ|). |Γ| = 1 (open/short) yields infinity.',
    parameters: {
      gamma: { ...complexParam('reflection coefficient'), required: true },
    },
    execute: (args) => {
      const g = parseComplex(args.gamma)
      return { vswr: gammaToVswr(g), display: gammaToVswr(g) === Number.POSITIVE_INFINITY ? '∞' : String(gammaToVswr(g)) }
    },
  }),
  defineJsonTool({
    name: 'return_loss',
    description: 'Return loss in dB: −20·log10(|Γ|). |Γ| = 0 (perfect match) yields +∞ dB.',
    parameters: {
      gamma: { ...complexParam('reflection coefficient'), required: true },
    },
    execute: (args) => {
      const g = parseComplex(args.gamma)
      const db = returnLossDb(g)
      return { return_loss_db: db, display: db === Number.POSITIVE_INFINITY ? '∞ dB' : `${db.toFixed(2)} dB` }
    },
  }),
  defineJsonTool({
    name: 'quarter_wave_transformer',
    description: 'Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL), matching a real load ZL to line Z0.',
    parameters: {
      z0: { ...quantityParam('line impedance'), required: true },
      zl: { ...quantityParam('real load impedance'), required: true },
    },
    execute: (args) => {
      const z0 = parseScalar(args.z0, UnitFamily.RESISTANCE)
      const zl = parseScalar(args.zl, UnitFamily.RESISTANCE)
      return serializeComplex(new Complex(quarterWaveImpedance(z0, zl), 0), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'l_network_match',
    description: 'L-network matching two real resistances at frequency f. Q = √(Rl/Rs − 1); series element (X = Q·Rs) sits next to the smaller resistance, shunt element (X = Rl/Q) next to the larger. Returns both conjugate solutions (low-pass / high-pass) with L/C values.',
    parameters: {
      zs: { ...quantityParam('source impedance'), required: true },
      zl: { ...quantityParam('load impedance'), required: true },
      f: { ...quantityParam('frequency'), required: true },
    },
    execute: (args) => {
      const zs = parseScalar(args.zs, UnitFamily.RESISTANCE)
      const zl = parseScalar(args.zl, UnitFamily.RESISTANCE)
      const f = parseScalar(args.f, UnitFamily.FREQUENCY)
      const result = lNetworkMatch(zs, zl, f)
      if (result.matched) return { matched: true, note: 'source and load are already equal — no network needed' }
      const out: Record<string, JsonValue> = {
        matched: false,
        q: result.q as number,
        series_side: result.seriesSide,
        shunt_side: result.shuntSide,
      }
      if (result.solutions !== undefined) {
        out.solutions = result.solutions.map((s) => {
          const sol: Record<string, JsonValue> = {
            x_series: fmtReactance(s.xSeries),
            x_shunt: fmtReactance(s.xShunt),
          }
          if (s.lSeries !== undefined) sol.l_series = fmtQ(s.lSeries, BaseUnit.HENRY)
          if (s.cSeries !== undefined) sol.c_series = fmtQ(s.cSeries, BaseUnit.FARAD)
          if (s.lShunt !== undefined) sol.l_shunt = fmtQ(s.lShunt, BaseUnit.HENRY)
          if (s.cShunt !== undefined) sol.c_shunt = fmtQ(s.cShunt, BaseUnit.FARAD)
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
  return serializeComplex(new Complex(x, 0), BaseUnit.OHM)
}
