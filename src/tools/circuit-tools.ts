/**
 * Concept-level circuit tools: one textbook concept per tool, SI units.
 */
import { parseComplex, parseScalar } from '../math/parse.ts'
import { BaseUnit, Unit } from '../math/units.ts'
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
      frequency: { ...quantityParam('frequency'), required: true },
      resistance: { ...quantityParam('resistance'), required: true },
      inductance: { ...quantityParam('inductance'), required: true },
      capacitance: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const frequency = parseScalar(args.frequency, Unit.Frequency)
      const resistance = parseScalar(args.resistance, Unit.Resistance)
      const inductance = parseScalar(args.inductance, Unit.Inductance)
      const capacitance = parseScalar(args.capacitance, Unit.Capacitance)
      return serializeComplex(seriesImpedance(frequency, resistance, inductance, capacitance), BaseUnit.Ohm)
    },
  }),
  defineJsonTool({
    name: 'z_rlc_parallel',
    description: 'Total impedance of a parallel RLC network at frequency f: 1/Z = 1/R + 1/(jωL) + jωC. Omit r for a pure LC tank; pass l=0 or c=0 to omit that element.',
    parameters: {
      frequency: { ...quantityParam('frequency'), required: true },
      resistance: { ...quantityParam('resistance, omit for pure LC') },
      inductance: { ...quantityParam('inductance'), required: true },
      capacitance: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const frequency = parseScalar(args.frequency, Unit.Frequency)
      const resistance = args.resistance === undefined ? undefined : parseScalar(args.resistance, Unit.Resistance)
      const inductance = parseScalar(args.inductance, Unit.Inductance)
      const capacitance = parseScalar(args.capacitance, Unit.Capacitance)
      return serializeComplex(parallelImpedance(frequency, resistance, inductance, capacitance), BaseUnit.Ohm)
    },
  }),
  defineJsonTool({
    name: 'z_parallel',
    description: 'Impedance of two impedances in parallel: Z = Z1·Z2 / (Z1 + Z2).',
    parameters: {
      firstImpedance: { ...complexParam('first impedance'), required: true },
      secondImpedance: { ...complexParam('second impedance'), required: true },
    },
    execute: (args) => {
      const z1 = parseComplex(args.firstImpedance, Unit.Resistance)
      const z2 = parseComplex(args.secondImpedance, Unit.Resistance)
      return serializeComplex(parallelTwo(z1, z2), BaseUnit.Ohm)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: f0 = 1/(2π√(LC)); with R also Q factor and bandwidth (BW = f0/Q). Series Q = (1/R)√(L/C); parallel Q = R√(C/L).',
    parameters: {
      inductance: { ...quantityParam('inductance'), required: true },
      capacitance: { ...quantityParam('capacitance'), required: true },
      resistance: { ...quantityParam('resistance, required for Q and bandwidth') },
      mode: { type: 'string', enum: ['series', 'parallel'], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const inductance = parseScalar(args.inductance, Unit.Inductance)
      const capacitance = parseScalar(args.capacitance, Unit.Capacitance)
      const resistance = args.resistance === undefined ? undefined : parseScalar(args.resistance, Unit.Resistance)
      const mode = args.mode === 'parallel' ? 'parallel' : 'series'
      const { f0, q, bandwidth } = resonance(inductance, capacitance, resistance, mode)
      const out: Record<string, JsonValue> = { f0: fmtQ(f0, BaseUnit.Hertz), mode }
      if (q !== undefined) out.q = q
      if (bandwidth !== undefined) out.bandwidth = fmtQ(bandwidth, BaseUnit.Hertz)
      return out
    },
  }),
  defineJsonTool({
    name: 'ac_Power',
    description: 'AC power from RMS values: apparent S = V·I (VA), real P = S·cosφ (W), reactive Q = S·sinφ (VAR), power factor = cosφ. φ is the phase angle between voltage and current (positive = inductive load).',
    parameters: {
      rmsVoltage: { ...quantityParam('RMS Voltage'), required: true },
      rmsCurrent: { ...quantityParam('RMS Current'), required: true },
      phaseAngleDegree: { type: 'number', description: 'phase Angle between V and I in Degrees (default 0)' },
    },
    execute: (args) => {
      const rmsVoltage = parseScalar(args.rmsVoltage, Unit.Voltage)
      const rmsCurrent = parseScalar(args.rmsCurrent, Unit.Current)
      const phaseAngleDegree = args.phaseAngleDegree ?? 0
      const { apparent, real, reactive, powerFactor } = acPower(rmsVoltage, rmsCurrent, phaseAngleDegree)
      return {
        apparent: fmtQ(apparent, BaseUnit.VoltAmpere),
        real: fmtQ(real, BaseUnit.Watt),
        reactive: fmtQ(reactive, BaseUnit.VoltAmpereReactive),
        powerFactor: powerFactor,
      }
    },
  }),
  defineJsonTool({
    name: 'rc_transient',
    description: 'RC transient at time t. charge: capacitor charges from 0 toward Vs, v(t) = Vs(1−e^(−t/τ)); discharge: capacitor at V0 discharges through R, v(t) = V0·e^(−t/τ). τ = RC. current: charge i = (Vs−v)/R, discharge i = v/R.',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      sourceVoltage: { ...quantityParam('source voltage (charge mode)') },
      initialVoltage: { ...quantityParam('initial capacitor voltage (discharge mode)') },
      resistance: { ...quantityParam('resistance'), required: true },
      capacitance: { ...quantityParam('capacitance'), required: true },
      time: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistance = parseScalar(args.resistance, Unit.Resistance)
      const capacitance = parseScalar(args.capacitance, Unit.Capacitance)
      const time = parseScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : parseScalar(args.sourceVoltage, Unit.Voltage)
      const initialVoltage = args.initialVoltage === undefined ? 0 : parseScalar(args.initialVoltage, Unit.Voltage)
      if (mode === 'charge' && args.sourceVoltage === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.initialVoltage === undefined) throw new Error('discharge mode requires v0')
      const { voltage, current, tau } = rcTransient(mode, sourceVoltage, initialVoltage, resistance, capacitance, time)
      return { voltage: fmtQ(voltage, BaseUnit.Volt), current: fmtQ(current, BaseUnit.Ampere), timeConstant: fmtQ(tau, BaseUnit.Second), mode }
    },
  }),
  defineJsonTool({
    name: 'rl_transient',
    description: 'RL transient at time t. charge: current rises from 0 toward Vs/R, i(t) = (Vs/R)(1−e^(−t/τ)); discharge: current at I0 decays, i(t) = I0·e^(−t/τ). τ = L/R. Inductor voltage: charge vL = Vs·e^(−t/τ), discharge vL = I0·R·e^(−t/τ).',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      sourceVoltage: { ...quantityParam('source voltage (charge mode)') },
      initialCurrent: { ...quantityParam('initial inductor current (discharge mode)') },
      resistance: { ...quantityParam('resistance'), required: true },
      inductance: { ...quantityParam('inductance'), required: true },
      time: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistance = parseScalar(args.resistance, Unit.Resistance)
      const inductance = parseScalar(args.inductance, Unit.Inductance)
      const time = parseScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : parseScalar(args.sourceVoltage, Unit.Voltage)
      const initialCurrent = args.initialCurrent === undefined ? 0 : parseScalar(args.initialCurrent, Unit.Current)
      if (mode === 'charge' && args.sourceVoltage === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.initialCurrent === undefined) throw new Error('discharge mode requires i0')
      const { current, voltage, tau } = rlTransient(mode, sourceVoltage, initialCurrent, resistance, inductance, time)
      return { current: fmtQ(current, BaseUnit.Ampere), voltage: fmtQ(voltage, BaseUnit.Volt), timeConstant: fmtQ(tau, BaseUnit.Second), mode }
    },
  }),
]
