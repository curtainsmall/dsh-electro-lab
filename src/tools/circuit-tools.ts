/**
 * Concept-level circuit tools: primitives (element/series/parallel/circuit
 * impedance) plus scalar concepts. IO is JSON-and-complex-only.
 */
import {
  CircuitMode,
  ElementKind,
  SwitchingMode,
  acPower,
  networkImpedance,
  parallelOf,
  rcTransient,
  rcTransientSeries,
  resonance,
  rlTransient,
  rlTransientSeries,
  seriesOf,
  type NetworkElement,
} from '../math/circuits.ts'
import { toComplex, toScalar, serializeComplex, realValue } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const circuitTools = [
  defineJsonTool({
    name: 'element_impedance',
    description: 'Impedance of one lumped element at a frequency: resistance → R, inductance → jωL, capacitance → 1/(jωC). value is in base SI units (Ω, H, F) per kind.',
    parameters: {
      kind: { type: 'string', enum: [ElementKind.Resistance, ElementKind.Inductance, ElementKind.Capacitance], description: 'element kind', required: true },
      value: { type: 'number', description: 'element value in base SI units (Ω for resistance, H for inductance, F for capacitance)', required: true },
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, Unit.Frequency)
      return serializeComplex(networkImpedance({ kind: args.kind, value: args.value }, frequency), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'series_impedance',
    description: 'Total impedance of impedances in series: Z = Σ Zi. Pass each impedance as a complex value object; earlier step outputs may be referenced with @stepN in solve_steps.',
    parameters: {
      impedances: {
        type: 'array',
        description: 'impedances to combine in series',
        required: true,
        items: valueParam(Unit.Resistance, 'impedance'),
      },
    },
    execute: (args) => {
      const parts = args.impedances.map((item) => toComplex(item, Unit.Resistance))
      return serializeComplex(seriesOf(parts), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'parallel_impedance',
    description: 'Total impedance of impedances in parallel: 1/Z = Σ 1/Zi. Pass each impedance as a complex value object.',
    parameters: {
      impedances: {
        type: 'array',
        description: 'impedances to combine in parallel',
        required: true,
        items: valueParam(Unit.Resistance, 'impedance'),
      },
    },
    execute: (args) => {
      const parts = args.impedances.map((item) => toComplex(item, Unit.Resistance))
      return serializeComplex(parallelOf(parts), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'circuit_impedance',
    description: 'Total impedance of a (possibly nested) network at a frequency. The network is a tree: a leaf is {"kind": "resistance"|"inductance"|"capacitance", "value": number}; a group is {"topology": "series"|"parallel", "elements": [node, ...]}. Nested groups are allowed. Returns the driving-point impedance.',
    parameters: {
      network: { type: 'json', description: 'network tree, e.g. {"topology":"series","elements":[{"kind":"resistance","value":10},{"kind":"inductance","value":0.001}]}', required: true },
      frequency: { ...valueParam(Unit.Frequency, 'frequency'), required: true },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, Unit.Frequency)
      const node = validateNetwork(args.network)
      return serializeComplex(networkImpedance(node, frequency), Unit.Resistance)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: resonantFrequency = 1/(2π√(LC)); with resistance also qualityFactor and bandwidth (bandwidth = resonantFrequency / qualityFactor). Series qualityFactor = (1/R)√(L/C); parallel qualityFactor = R√(C/L).',
    parameters: {
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
      resistance: { ...valueParam(Unit.Resistance, 'resistance, required for qualityFactor and bandwidth') },
      mode: { type: 'string', enum: [CircuitMode.Series, CircuitMode.Parallel], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      const resistance = args.resistance === undefined ? undefined : toScalar(args.resistance, Unit.Resistance)
      const mode = args.mode === CircuitMode.Parallel ? CircuitMode.Parallel : CircuitMode.Series
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
      mode: { type: 'string', enum: [SwitchingMode.Charge, SwitchingMode.Discharge], description: 'charge or discharge', required: true },
      sourceVoltage: { ...valueParam(Unit.Voltage, 'source voltage (charge mode)') },
      initialVoltage: { ...valueParam(Unit.Voltage, 'initial capacitor voltage (discharge mode)') },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance'), required: true },
      time: { ...valueParam(Unit.Time, 'elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === SwitchingMode.Discharge ? SwitchingMode.Discharge : SwitchingMode.Charge
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const capacitance = toScalar(args.capacitance, Unit.Capacitance)
      const time = toScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, Unit.Voltage)
      const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage, Unit.Voltage)
      if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
      if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined) throw new Error('discharge mode requires initialVoltage')
      const { voltage, current, timeConstant } = rcTransient(mode, sourceVoltage, initialVoltage, resistance, capacitance, time)
      return { voltage: realValue(voltage, Unit.Voltage), current: realValue(current, Unit.Current), timeConstant: realValue(timeConstant, Unit.Time), mode }
    },
  }),
  defineJsonTool({
    name: 'rl_transient',
    description: 'RL transient at a moment in time. charge: current rises from 0 toward sourceVoltage/resistance, current = (sourceVoltage/resistance)(1−e^(−time/timeConstant)); discharge: current at initialCurrent decays, current = initialCurrent·e^(−time/timeConstant). timeConstant = inductance/resistance. Inductor voltage: charge = sourceVoltage·e^(−time/timeConstant), discharge = initialCurrent·resistance·e^(−time/timeConstant).',
    parameters: {
      mode: { type: 'string', enum: [SwitchingMode.Charge, SwitchingMode.Discharge], description: 'charge or discharge', required: true },
      sourceVoltage: { ...valueParam(Unit.Voltage, 'source voltage (charge mode)') },
      initialCurrent: { ...valueParam(Unit.Current, 'initial inductor current (discharge mode)') },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      inductance: { ...valueParam(Unit.Inductance, 'inductance'), required: true },
      time: { ...valueParam(Unit.Time, 'elapsed time'), required: true },
    },
    execute: (args) => {
      const mode = args.mode === SwitchingMode.Discharge ? SwitchingMode.Discharge : SwitchingMode.Charge
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const inductance = toScalar(args.inductance, Unit.Inductance)
      const time = toScalar(args.time, Unit.Time)
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, Unit.Voltage)
      const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent, Unit.Current)
      if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
      if (mode === SwitchingMode.Discharge && args.initialCurrent === undefined) throw new Error('discharge mode requires initialCurrent')
      const { current, voltage, timeConstant } = rlTransient(mode, sourceVoltage, initialCurrent, resistance, inductance, time)
      return { current: realValue(current, Unit.Current), voltage: realValue(voltage, Unit.Voltage), timeConstant: realValue(timeConstant, Unit.Time), mode }
    },
  }),
  defineJsonTool({
    name: 'transient_response',
    description: 'RC or RL transient evaluated at a list of time points in one call — the full charge/discharge curve. kind selects rc (resistance + capacitance) or rl (resistance + inductance); charge requires sourceVoltage, discharge requires initialVoltage (rc) or initialCurrent (rl). Returns one point per time with voltage and current.',
    parameters: {
      kind: { type: 'string', enum: ['rc', 'rl'], description: 'circuit kind', required: true },
      mode: { type: 'string', enum: [SwitchingMode.Charge, SwitchingMode.Discharge], description: 'charge or discharge', required: true },
      sourceVoltage: { ...valueParam(Unit.Voltage, 'source voltage (charge mode)') },
      initialVoltage: { ...valueParam(Unit.Voltage, 'initial capacitor voltage (rc discharge mode)') },
      initialCurrent: { ...valueParam(Unit.Current, 'initial inductor current (rl discharge mode)') },
      resistance: { ...valueParam(Unit.Resistance, 'resistance'), required: true },
      capacitance: { ...valueParam(Unit.Capacitance, 'capacitance (rc)') },
      inductance: { ...valueParam(Unit.Inductance, 'inductance (rl)') },
      times: {
        type: 'array',
        description: 'time points to evaluate',
        required: true,
        items: valueParam(Unit.Time, 'time'),
      },
    },
    execute: (args) => {
      const mode = args.mode === SwitchingMode.Discharge ? SwitchingMode.Discharge : SwitchingMode.Charge
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const times = args.times.map((item) => toScalar(item, Unit.Time))
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, Unit.Voltage)
      let points: Array<{ time: number; voltage: number; current: number }>
      if (args.kind === 'rl') {
        if (args.inductance === undefined) throw new Error('rl kind requires inductance')
        const inductance = toScalar(args.inductance, Unit.Inductance)
        const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent, Unit.Current)
        if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
        if (mode === SwitchingMode.Discharge && args.initialCurrent === undefined) throw new Error('discharge mode requires initialCurrent')
        points = rlTransientSeries(mode, sourceVoltage, initialCurrent, resistance, inductance, times)
      } else {
        if (args.capacitance === undefined) throw new Error('rc kind requires capacitance')
        const capacitance = toScalar(args.capacitance, Unit.Capacitance)
        const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage, Unit.Voltage)
        if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
        if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined) throw new Error('discharge mode requires initialVoltage')
        points = rcTransientSeries(mode, sourceVoltage, initialVoltage, resistance, capacitance, times)
      }
      return {
        kind: args.kind,
        mode,
        points: points.map((point) => ({
          time: realValue(point.time, Unit.Time),
          voltage: realValue(point.voltage, Unit.Voltage),
          current: realValue(point.current, Unit.Current),
        })),
      }
    },
  }),
]

/** Validate a raw JSON network tree into a typed NetworkElement. */
export function validateNetwork(input: unknown): NetworkElement {
  if (typeof input !== 'object' || input === null) throw new Error('network must be an object')
  const node = input as Record<string, unknown>
  if (typeof node['kind'] === 'string') {
    const kind = node['kind'] as ElementKind
    if (![ElementKind.Resistance, ElementKind.Inductance, ElementKind.Capacitance].includes(kind)) {
      throw new Error(`unknown element kind "${kind}"`)
    }
    const value = node['value']
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`element "${kind}" needs a non-negative finite value`)
    }
    return { kind, value }
  }
  if (node['topology'] === CircuitMode.Series || node['topology'] === CircuitMode.Parallel) {
    const elements = node['elements']
    if (!Array.isArray(elements) || elements.length === 0) {
      throw new Error('a group needs a non-empty elements array')
    }
    return { topology: node['topology'] as CircuitMode, elements: elements.map((child) => validateNetwork(child)) }
  }
  throw new Error('network node must be {"kind": ...} or {"topology": ..., "elements": [...]}')
}
