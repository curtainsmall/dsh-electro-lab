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
      frequency_hz: { ...quantityParam('frequency'), required: true },
      resistance_ohm: { ...quantityParam('resistance'), required: true },
      inductance_henry: { ...quantityParam('inductance'), required: true },
      capacitance_farad: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const frequencyHz = parseScalar(args.frequency_hz, UnitFamily.FREQUENCY)
      const resistanceOhm = parseScalar(args.resistance_ohm, UnitFamily.RESISTANCE)
      const inductanceHenry = parseScalar(args.inductance_henry, UnitFamily.INDUCTANCE)
      const capacitanceFarad = parseScalar(args.capacitance_farad, UnitFamily.CAPACITANCE)
      return serializeComplex(seriesImpedance(frequencyHz, resistanceOhm, inductanceHenry, capacitanceFarad), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'z_rlc_parallel',
    description: 'Total impedance of a parallel RLC network at frequency f: 1/Z = 1/R + 1/(jωL) + jωC. Omit r for a pure LC tank; pass l=0 or c=0 to omit that element.',
    parameters: {
      frequency_hz: { ...quantityParam('frequency'), required: true },
      resistance_ohm: { ...quantityParam('resistance, omit for pure LC') },
      inductance_henry: { ...quantityParam('inductance'), required: true },
      capacitance_farad: { ...quantityParam('capacitance'), required: true },
    },
    execute: (args) => {
      const frequencyHz = parseScalar(args.frequency_hz, UnitFamily.FREQUENCY)
      const resistanceOhm = args.resistance_ohm === undefined ? undefined : parseScalar(args.resistance_ohm, UnitFamily.RESISTANCE)
      const inductanceHenry = parseScalar(args.inductance_henry, UnitFamily.INDUCTANCE)
      const capacitanceFarad = parseScalar(args.capacitance_farad, UnitFamily.CAPACITANCE)
      return serializeComplex(parallelImpedance(frequencyHz, resistanceOhm, inductanceHenry, capacitanceFarad), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'z_parallel',
    description: 'Impedance of two impedances in parallel: Z = Z1·Z2 / (Z1 + Z2).',
    parameters: {
      first_impedance_ohm: { ...complexParam('first impedance'), required: true },
      second_impedance_ohm: { ...complexParam('second impedance'), required: true },
    },
    execute: (args) => {
      const z1 = parseComplex(args.first_impedance_ohm, UnitFamily.RESISTANCE)
      const z2 = parseComplex(args.second_impedance_ohm, UnitFamily.RESISTANCE)
      return serializeComplex(parallelTwo(z1, z2), BaseUnit.OHM)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: f0 = 1/(2π√(LC)); with R also Q factor and bandwidth (BW = f0/Q). Series Q = (1/R)√(L/C); parallel Q = R√(C/L).',
    parameters: {
      inductance_henry: { ...quantityParam('inductance'), required: true },
      capacitance_farad: { ...quantityParam('capacitance'), required: true },
      resistance_ohm: { ...quantityParam('resistance, required for Q and bandwidth') },
      mode: { type: 'string', enum: ['series', 'parallel'], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const inductanceHenry = parseScalar(args.inductance_henry, UnitFamily.INDUCTANCE)
      const capacitanceFarad = parseScalar(args.capacitance_farad, UnitFamily.CAPACITANCE)
      const resistanceOhm = args.resistance_ohm === undefined ? undefined : parseScalar(args.resistance_ohm, UnitFamily.RESISTANCE)
      const mode = args.mode === 'parallel' ? 'parallel' : 'series'
      const { f0, q, bandwidth } = resonance(inductanceHenry, capacitanceFarad, resistanceOhm, mode)
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
      rms_voltage_volt: { ...quantityParam('RMS voltage'), required: true },
      rms_current_ampere: { ...quantityParam('RMS current'), required: true },
      phase_angle_degree: { type: 'number', description: 'phase angle between V and I in degrees (default 0)' },
    },
    execute: (args) => {
      const rmsVoltageVolt = parseScalar(args.rms_voltage_volt, UnitFamily.VOLTAGE)
      const rmsCurrentAmpere = parseScalar(args.rms_current_ampere, UnitFamily.CURRENT)
      const phaseAngleDegree = args.phase_angle_degree ?? 0
      const { apparent, real, reactive, powerFactor } = acPower(rmsVoltageVolt, rmsCurrentAmpere, phaseAngleDegree)
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
      source_voltage_volt: { ...quantityParam('source voltage (charge mode)') },
      initial_voltage_volt: { ...quantityParam('initial capacitor voltage (discharge mode)') },
      resistance_ohm: { ...quantityParam('resistance'), required: true },
      capacitance_farad: { ...quantityParam('capacitance'), required: true },
      time_second: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistanceOhm = parseScalar(args.resistance_ohm, UnitFamily.RESISTANCE)
      const capacitanceFarad = parseScalar(args.capacitance_farad, UnitFamily.CAPACITANCE)
      const timeSecond = parseScalar(args.time_second, UnitFamily.TIME)
      const sourceVoltageVolt = args.source_voltage_volt === undefined ? 0 : parseScalar(args.source_voltage_volt, UnitFamily.VOLTAGE)
      const initialVoltageVolt = args.initial_voltage_volt === undefined ? 0 : parseScalar(args.initial_voltage_volt, UnitFamily.VOLTAGE)
      if (mode === 'charge' && args.source_voltage_volt === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.initial_voltage_volt === undefined) throw new Error('discharge mode requires v0')
      const { voltage, current, tau } = rcTransient(mode, sourceVoltageVolt, initialVoltageVolt, resistanceOhm, capacitanceFarad, timeSecond)
      return { v: fmtQ(voltage, BaseUnit.VOLT), i: fmtQ(current, BaseUnit.AMPERE), tau: fmtQ(tau, BaseUnit.SECOND), mode }
    },
  }),
  defineJsonTool({
    name: 'rl_transient',
    description: 'RL transient at time t. charge: current rises from 0 toward Vs/R, i(t) = (Vs/R)(1−e^(−t/τ)); discharge: current at I0 decays, i(t) = I0·e^(−t/τ). τ = L/R. Inductor voltage: charge vL = Vs·e^(−t/τ), discharge vL = I0·R·e^(−t/τ).',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      source_voltage_volt: { ...quantityParam('source voltage (charge mode)') },
      initial_current_ampere: { ...quantityParam('initial inductor current (discharge mode)') },
      resistance_ohm: { ...quantityParam('resistance'), required: true },
      inductance_henry: { ...quantityParam('inductance'), required: true },
      time_second: { ...quantityParam('elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistanceOhm = parseScalar(args.resistance_ohm, UnitFamily.RESISTANCE)
      const inductanceHenry = parseScalar(args.inductance_henry, UnitFamily.INDUCTANCE)
      const timeSecond = parseScalar(args.time_second, UnitFamily.TIME)
      const sourceVoltageVolt = args.source_voltage_volt === undefined ? 0 : parseScalar(args.source_voltage_volt, UnitFamily.VOLTAGE)
      const initialCurrentAmpere = args.initial_current_ampere === undefined ? 0 : parseScalar(args.initial_current_ampere, UnitFamily.CURRENT)
      if (mode === 'charge' && args.source_voltage_volt === undefined) throw new Error('charge mode requires vs')
      if (mode === 'discharge' && args.initial_current_ampere === undefined) throw new Error('discharge mode requires i0')
      const { current, voltage, tau } = rlTransient(mode, sourceVoltageVolt, initialCurrentAmpere, resistanceOhm, inductanceHenry, timeSecond)
      return { i: fmtQ(current, BaseUnit.AMPERE), v: fmtQ(voltage, BaseUnit.VOLT), tau: fmtQ(tau, BaseUnit.SECOND), mode }
    },
  }),
]
