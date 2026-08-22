/**
 * Concept-level circuit tools: one textbook concept per tool, SI units.
 */
import { parseComplex, parseScalar } from '../math/parse.ts'
import { BaseUnit, UnitFamily } from '../math/units.ts'
import { serializeComplex } from '../math/format.ts'
import { Complex } from 'complex.js'
import {
  acPower,
  parallelImpedance,
  parallelTwo,
  rcTransient,
  resonance,
  rlTransient,
  seriesImpedance,
} from '../math/circuits.ts'
import { defineJsonTool, quantityParam, complexParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

type Optional<T> = T | undefined

function fmtQ(value: number, unit: BaseUnit): Record<string, number | string> {
  return serializeComplex(new Complex(value, 0), unit)
}

export const circuitTools = [
  defineJsonTool({
    name: 'z_rlc_series',
    description: 'Total impedance of a series RLC network at frequency f: Z = R + jωL + 1/(jωC). Pass l=0 or c=0 to omit that element.',
    parameters: {
      f: { ...quantityParam('frequency'), required: true },
      r: { ...quantityParam('resistance'), required: true },
      l: { ...quantityParam('inductance'), required: true },
      c: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const f = parseScalar(args.f, UnitFamily.FREQUENCY)
      const r = parseScalar(args.r, UnitFamily.RESISTANCE)
      const l = parseScalar(args.l, UnitFamily.INDUCTANCE)
      const c = parseScalar(args.c, UnitFamily.CAPACITANCE)
      return serializeComplex(seriesImpedance(f, r, l, c), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'z_rlc_parallel',
    description: 'Total impedance of a parallel RLC network at frequency f: 1/Z = 1/R + 1/(jωL) + jωC. Omit r for a pure LC tank; pass l=0 or c=0 to omit that element.',
    parameters: {
      f: { ...quantityParam('frequency'), required: true },
      r: { ...quantityParam('resistance, omit for pure LC') },
      l: { ...quantityParam('inductance'), required: true },
      c: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const f = parseScalar(args.f, UnitFamily.FREQUENCY)
      const r = args.r === undefined ? undefined : parseScalar(args.r, UnitFamily.RESISTANCE)
      const l = parseScalar(args.l, UnitFamily.INDUCTANCE)
      const c = parseScalar(args.c, UnitFamily.CAPACITANCE)
      return serializeComplex(parallelImpedance(f, r, l, c), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'z_parallel',
    description: 'Impedance of two impedances in parallel: Z = Z1·Z2 / (Z1 + Z2).',
    parameters: {
      z1: { ...complexParam('first impedance'), required: true },
      z2: { ...complexParam('second impedance'), required: true },
    },
    execute: (args) => {
      const z1 = parseComplex(args.z1, UnitFamily.RESISTANCE)
      const z2 = parseComplex(args.z2, UnitFamily.RESISTANCE)
      return serializeComplex(parallelTwo(z1, z2), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: f0 = 1/(2π√(LC)); with R also Q factor and bandwidth (BW = f0/Q). Series Q = (1/R)√(L/C); parallel Q = R√(C/L).',
    parameters: {
      l: { ...quantityParam('inductance'), required: true },
      c: { ...quantityParam('capacitance'), required: true },
      r: { ...quantityParam('resistance, required for Q and bandwidth') },
      mode: { type: 'string', enum: ['series', 'parallel'], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const l = parseScalar(args.l, UnitFamily.INDUCTANCE)
      const c = parseScalar(args.c, UnitFamily.CAPACITANCE)
      const r = args.r === undefined ? undefined : parseScalar(args.r, UnitFamily.RESISTANCE)
      const mode = args.mode === 'parallel' ? 'parallel' : 'series'
      const { f0, q, bandwidth } = resonance(l, c, r, mode)
      const out: Record<string, JsonValue> = { f0: fmtQ(f0, BaseUnit.HERTZ), mode }
      if (q !== undefined) out.q = q
      if (bandwidth !== undefined) out.bandwidth = fmtQ(bandwidth, BaseUnit.HERTZ)
      return out
    },
  }),
  defineJsonTool({
    name: 'ac_power',
    description: 'AC power from RMS values: apparent S = V·I (VA), real P = S·cosφ (W), reactive Q = S·sinφ (VAR), power factor = cosφ. φ is the phase angle between voltage and current (positive = inductive load).',
    parameters: {
      vrms: { ...quantityParam('RMS voltage'), required: true },
      irms: { ...quantityParam('RMS current'), required: true },
      phi_deg: { type: 'number', description: 'phase angle between V and I in degrees (default 0)' },
    },
    execute: (args) => {
      const vrms = parseScalar(args.vrms, UnitFamily.VOLTAGE)
      const irms = parseScalar(args.irms, UnitFamily.CURRENT)
      const phiDeg = args.phi_deg ?? 0
      const { apparent, real, reactive, powerFactor } = acPower(vrms, irms, phiDeg)
      return {
        apparent: fmtQ(apparent, BaseUnit.VOLT_AMPERE),
        real: fmtQ(real, BaseUnit.WATT),
        reactive: fmtQ(reactive, BaseUnit.VOLT_AMPERE_REACTIVE),
        power_factor: powerFactor,
      }
    },
  }),
  defineJsonTool({
    name: 'rc_transient',
    description: 'RC transient at time t. charge: capacitor charges from 0 toward Vs, v(t) = Vs(1−e^(−t/τ)); discharge: capacitor at V0 discharges through R, v(t) = V0·e^(−t/τ). τ = RC. Current: charge i = (Vs−v)/R, discharge i = v/R.',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      vs: { ...quantityParam('source voltage (charge mode)') },
      v0: { ...quantityParam('initial capacitor voltage (discharge mode)') },
      r: { ...quantityParam('resistance'), required: true },
      c: { ...quantityParam('capacitance'), required: true },
      t: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const r = parseScalar(args.r, UnitFamily.RESISTANCE)
      const c = parseScalar(args.c, UnitFamily.CAPACITANCE)
      const t = parseScalar(args.t, UnitFamily.TIME)
      const vs = args.vs === undefined ? 0 : parseScalar(args.vs, UnitFamily.VOLTAGE)
      const v0 = args.v0 === undefined ? 0 : parseScalar(args.v0, UnitFamily.VOLTAGE)
      if (mode === 'charge' && args.vs === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.v0 === undefined) throw new Error('discharge mode requires v0')
      const { v, i, tau } = rcTransient(mode, vs, v0, r, c, t)
      return { v: fmtQ(v, BaseUnit.VOLT), i: fmtQ(i, BaseUnit.AMPERE), tau: fmtQ(tau, BaseUnit.SECOND), mode }
    },
  }),
  defineJsonTool({
    name: 'rl_transient',
    description: 'RL transient at time t. charge: current rises from 0 toward Vs/R, i(t) = (Vs/R)(1−e^(−t/τ)); discharge: current at I0 decays, i(t) = I0·e^(−t/τ). τ = L/R. Inductor voltage: charge vL = Vs·e^(−t/τ), discharge vL = I0·R·e^(−t/τ).',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      vs: { ...quantityParam('source voltage (charge mode)') },
      i0: { ...quantityParam('initial inductor current (discharge mode)') },
      r: { ...quantityParam('resistance'), required: true },
      l: { ...quantityParam('inductance'), required: true },
      t: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const r = parseScalar(args.r, UnitFamily.RESISTANCE)
      const l = parseScalar(args.l, UnitFamily.INDUCTANCE)
      const t = parseScalar(args.t, UnitFamily.TIME)
      const vs = args.vs === undefined ? 0 : parseScalar(args.vs, UnitFamily.VOLTAGE)
      const i0 = args.i0 === undefined ? 0 : parseScalar(args.i0, UnitFamily.CURRENT)
      if (mode === 'charge' && args.vs === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.i0 === undefined) throw new Error('discharge mode requires i0')
      const { i, v, tau } = rlTransient(mode, vs, i0, r, l, t)
      return { i: fmtQ(i, BaseUnit.AMPERE), v: fmtQ(v, BaseUnit.VOLT), tau: fmtQ(tau, BaseUnit.SECOND), mode }
    },
  }),
]
