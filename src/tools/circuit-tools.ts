/**
 * Concept-level circuit tools: one textbook concept per tool.
 * IO is JSON-and-complex-only: every value is { re, im, unit }.
 */
import { Complex } from 'complex.js'
import { toComplex, toScalar, serializeComplex, realValue } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import {
  acPower,
  parallelImpedance,
  parallelTwo,
  rcTransient,
  resonance,
  rlTransient,
  seriesImpedance,
} from '../math/circuits.ts'
import { defineJsonTool, valueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const circuitTools = [
  defineJsonTool({
    name: 'z_rlc_series',
    description: 'Total impedance of a series RLC network: Z = R + jωL + 1/(jωC). Set inductance/capacitance to 0 to omit that element.',
    parameters: {
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, Unit.Frequency)
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      return serializeComplex(seriesImpedance(frequency, resistance, inductance, capacitance), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'z_rlc_parallel',
    description: 'Total impedance of a parallel RLC network: 1/Z = 1/R + 1/(jωL) + jωC. Omit resistance for a pure LC tank; set inductance/capacitance to 0 to omit that element.',
    parameters: {
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
      resistance: { ...valueParam(Unit.Resistance, 'resistance, omit for pure LC') },
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, Unit.Frequency)
      const resistance = args.resistance === undefined ? undefined : toScalar(args.resistance, Unit.Resistance)
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      return serializeComplex(parallelImpedance(frequency, resistance, inductance, capacitance), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'z_parallel',
    description: 'Impedance of two impedances in parallel: Z = Z1·Z2 / (Z1 + Z2).',
    parameters: {
      firstImpedance: { ...valueParam(Unit.Resistance, 'first impedance'), required: true },
      secondImpedance: { ...valueParam(Unit.Resistance, 'second impedance'), required: true },
    },
    execute: (args) => {
      const firstImpedance = toComplex(args.firstImpedance, Unit.Resistance)
      const secondImpedance = toComplex(args.secondImpedance, Unit.Resistance)
      return serializeComplex(parallelTwo(firstImpedance, secondImpedance), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: resonantFrequency = 1/(2π√(LC)); with resistance also qualityFactor and bandwidth (bandwidth = resonantFrequency / qualityFactor). Series qualityFactor = (1/R)√(L/C); parallel qualityFactor = R√(C/L).',
    parameters: {
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
      resistance: { ...valueParam(Unit.Resistance, 'resistance, required for qualityFactor and bandwidth') },
      mode: { type: 'string', enum: ['series', 'parallel'], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      const resistance = args.resistance === undefined ? undefined : toScalar(args.resistance, Unit.Resistance)
      const mode = args.mode === 'parallel' ? 'parallel' : 'series'
      const { resonantFrequency, qualityFactor, bandwidth } = resonance(inductance, capacitance, resistance, mode)
      const out: Record<string, JsonValue> = { resonantFrequency: realValue(resonantFrequency, Unit.Frequency), mode }
      if (qualityFactor !== undefined) out.qualityFactor = realValue(qualityFactor, Unit.None)
      if (bandwidth !== undefined) out.bandwidth = realValue(bandwidth, Unit.Frequency)
      return out
    },
  }),
  defineJsonTool({
    name: 'ac_power',
    description: 'AC power from RMS values: apparent = V·I (power), real = apparent·cosφ (power), reactive = apparent·sinφ (power), powerFactor = cosφ. phaseAngleDegree is the phase angle between voltage and current (positive = inductive load).',
    parameters: {
      rmsVoltage: { ...valueParam(Unit.Voltage, 'RMS voltage'), required: true },
      rmsCurrent: { ...valueParam(Unit.Current, 'RMS current'), required: true },
      phaseAngleDegree: { ...valueParam(Unit.Angle, 'phase angle between V and I in degrees (default 0)') },
    },
    execute: (args) => {
      const rmsVoltage = toScalar(args.rmsVoltage, Unit.Voltage)
      const rmsCurrent = toScalar(args.rmsCurrent, Unit.Current)
      const phaseAngleDegree = args.phaseAngleDegree === undefined ? 0 : toScalar(args.phaseAngleDegree, Unit.Angle)
      const { apparent, real, reactive, powerFactor } = acPower(rmsVoltage, rmsCurrent, phaseAngleDegree)
      return {
        apparent: realValue(apparent, Unit.Power),
        real: realValue(real, Unit.Power),
        reactive: realValue(reactive, Unit.Power),
        powerFactor: realValue(powerFactor, Unit.None),
      }
    },
  }),
  defineJsonTool({
    name: 'rc_transient',
    description: 'RC transient at a moment in time. charge: capacitor charges from 0 toward sourceVoltage, voltage = sourceVoltage(1−e^(−time/timeConstant)); discharge: capacitor at initialVoltage discharges through resistance, voltage = initialVoltage·e^(−time/timeConstant). timeConstant = resistance·capacitance. Current: charge = (sourceVoltage − voltage)/resistance, discharge = voltage/resistance.',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      sourceVoltage: { ...valueParam(Unit.Voltage, 'source voltage (charge mode)') },
      initialVoltage: { ...valueParam(Unit.Voltage, 'initial capacitor voltage (discharge mode)') },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
      time: { ...valueParam(Unit.Time, 'elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      const time = toScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, Unit.Voltage)
      const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage, Unit.Voltage)
      if (mode === 'charge' && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
      if (mode === 'discharge' && args.initialVoltage === undefined) throw new Error('discharge mode requires initialVoltage')
      const { voltage, current, timeConstant } = rcTransient(mode, sourceVoltage, initialVoltage, resistance, capacitance, time)
      return { voltage: realValue(voltage, Unit.Voltage), current: realValue(current, Unit.Current), timeConstant: realValue(timeConstant, Unit.Time), mode }
    },
  }),
  defineJsonTool({
    name: 'rl_transient',
    description: 'RL transient at a moment in time. charge: current rises from 0 toward sourceVoltage/resistance, current = (sourceVoltage/resistance)(1−e^(−time/timeConstant)); discharge: current at initialCurrent decays, current = initialCurrent·e^(−time/timeConstant). timeConstant = inductance/resistance. Inductor voltage: charge = sourceVoltage·e^(−time/timeConstant), discharge = initialCurrent·resistance·e^(−time/timeConstant).',
    parameters: {
      mode: { type: 'string', enum: ['charge', 'discharge'], description: 'charge or discharge', required: true },
      sourceVoltage: { ...valueParam(Unit.Voltage, 'source voltage (charge mode)') },
      initialCurrent: { ...valueParam(Unit.Current, 'initial inductor current (discharge mode)') },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      time: { ...valueParam(Unit.Time, 'elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === 'discharge' ? 'discharge' : 'charge'
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const time = toScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, Unit.Voltage)
      const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent, Unit.Current)
      if (mode === 'charge' && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
      if (mode === 'discharge' && args.initialCurrent === undefined) throw new Error('discharge mode requires initialCurrent')
      const { current, voltage, timeConstant } = rlTransient(mode, sourceVoltage, initialCurrent, resistance, inductance, time)
      return { current: realValue(current, Unit.Current), voltage: realValue(voltage, Unit.Voltage), timeConstant: realValue(timeConstant, Unit.Time), mode }
    },
  }),
]
