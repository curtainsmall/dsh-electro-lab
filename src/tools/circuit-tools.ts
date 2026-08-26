/**
 * Concept-level circuit tools: primitives (element/series/parallel/circuit
 * impedance) plus scalar concepts. IO is JSON-and-complex-only.
 */
import {
  CircuitMode,
  ElementKind,
  SwitchingMode,
  calcAcPower,
  calcNetworkImpedance,
  calcRcTransientSeries,
  calcResonance,
  calcRlTransientSeries,
  calcRlcTransientSeries,
  combineParallelImpedances,
  combineSeriesImpedances,
  type NetworkElement,
} from '../math/circuits.ts'
import { toComplex, toScalar, serializeComplex, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const circuitTools = [
  defineJsonTool({
    name: 'series_impedance',
    description: 'Total impedance of impedances in series: Z = Σ Zi. Pass each impedance as a complex value object; earlier step outputs may be referenced with @stepN in solve_steps.',
    parameters: {
      impedances: {
        type: 'array',
        description: 'impedances to combine in series',
        required: true,
        items: createValueParam(QuantityKind.Resistance, 'impedance'),
      },
    },
    execute: (args) => {
      const parts = args.impedances.map((item) => toComplex(item, QuantityKind.Resistance))
      return serializeComplex(combineSeriesImpedances(parts), QuantityKind.Resistance)
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
        items: createValueParam(QuantityKind.Resistance, 'impedance'),
      },
    },
    execute: (args) => {
      const parts = args.impedances.map((item) => toComplex(item, QuantityKind.Resistance))
      return serializeComplex(combineParallelImpedances(parts), QuantityKind.Resistance)
    },
  }),
  defineJsonTool({
    name: 'circuit_impedance',
    description: 'Total impedance of a (possibly nested) network at a frequency. The network is a tree: a leaf is {"kind": "resistance"|"inductance"|"capacitance", "value": number}; a group is {"topology": "series"|"parallel", "elements": [node, ...]}. Nested groups are allowed. Returns the driving-point impedance.',
    parameters: {
      network: { type: 'json', description: 'network tree, e.g. {"topology":"series","elements":[{"kind":"resistance","value":10},{"kind":"inductance","value":0.001}]}', required: true },
      frequency: { ...createValueParam(QuantityKind.Frequency, 'frequency'), required: true },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, QuantityKind.Frequency)
      const node = validateNetwork(args.network)
      return serializeComplex(calcNetworkImpedance(node, frequency), QuantityKind.Resistance)
    },
  }),
  defineJsonTool({
    name: 'resonance',
    description: 'Series/parallel LC resonance: resonantFrequency = 1/(2π√(LC)); with resistance also qualityFactor and bandwidth (bandwidth = resonantFrequency / qualityFactor). Series qualityFactor = (1/R)√(L/C); parallel qualityFactor = R√(C/L).',
    parameters: {
      inductance: { ...createValueParam(QuantityKind.Inductance, 'inductance'), required: true },
      capacitance: { ...createValueParam(QuantityKind.Capacitance, 'capacitance'), required: true },
      resistance: { ...createValueParam(QuantityKind.Resistance, 'resistance, required for qualityFactor and bandwidth') },
      mode: { type: 'string', enum: [CircuitMode.Series, CircuitMode.Parallel], description: 'resonance mode (default series)' },
    },
    execute: (args) => {
      const inductance = toScalar(args.inductance, QuantityKind.Inductance)
      const capacitance = toScalar(args.capacitance, QuantityKind.Capacitance)
      const resistance = args.resistance === undefined ? undefined : toScalar(args.resistance, QuantityKind.Resistance)
      const mode = args.mode ?? CircuitMode.Series
      const { resonantFrequency, qualityFactor, bandwidth } = calcResonance(inductance, capacitance, resistance, mode)
      const out: Record<string, JsonValue> = { resonantFrequency: serializeReal(resonantFrequency, QuantityKind.Frequency), mode }
      if (qualityFactor !== undefined) out.qualityFactor = serializeReal(qualityFactor, QuantityKind.None)
      if (bandwidth !== undefined) out.bandwidth = serializeReal(bandwidth, QuantityKind.Frequency)
      return out
    },
  }),
  defineJsonTool({
    name: 'ac_power',
    description: 'AC power from RMS values: apparent = V·I (power), real = apparent·cosφ (power), reactive = apparent·sinφ (power), powerFactor = cosφ. phaseAngle is the phase angle between voltage and current in radians (positive = inductive load).',
    parameters: {
      rmsVoltage: { ...createValueParam(QuantityKind.Voltage, 'RMS voltage'), required: true },
      rmsCurrent: { ...createValueParam(QuantityKind.Current, 'RMS current'), required: true },
      phaseAngle: { ...createValueParam(QuantityKind.Angle, 'phase angle between V and I in radians (default 0)') },
    },
    execute: (args) => {
      const rmsVoltage = toScalar(args.rmsVoltage, QuantityKind.Voltage)
      const rmsCurrent = toScalar(args.rmsCurrent, QuantityKind.Current)
      const phaseAngle = args.phaseAngle === undefined ? 0 : toScalar(args.phaseAngle, QuantityKind.Angle)
      const { apparent, real, reactive, powerFactor } = calcAcPower(rmsVoltage, rmsCurrent, phaseAngle)
      return {
        apparent: serializeReal(apparent, QuantityKind.Power),
        real: serializeReal(real, QuantityKind.Power),
        reactive: serializeReal(reactive, QuantityKind.Power),
        powerFactor: serializeReal(powerFactor, QuantityKind.None),
      }
    },
  }),
  defineJsonTool({
    name: 'transient_response',
    description: 'First- or second-order transient evaluated at a list of time points in one call — the full charge/discharge curve. kind selects rc (resistance + capacitance), rl (resistance + inductance) or rlc (series resistance + inductance + capacitance); charge requires sourceVoltage, discharge requires initialVoltage (rc/rlc) or initialCurrent (rl/rlc). Returns one point per time with voltage and current; rlc also reports alpha, omega0, dampingRatio and the damping regime.',
    parameters: {
      kind: { type: 'string', enum: ['rc', 'rl', 'rlc'], description: 'circuit kind', required: true },
      mode: { type: 'string', enum: [SwitchingMode.Charge, SwitchingMode.Discharge], description: 'charge or discharge', required: true },
      sourceVoltage: { ...createValueParam(QuantityKind.Voltage, 'source voltage (charge mode)') },
      initialVoltage: { ...createValueParam(QuantityKind.Voltage, 'initial capacitor voltage (rc/rlc discharge mode)') },
      initialCurrent: { ...createValueParam(QuantityKind.Current, 'initial inductor current (rl/rlc discharge mode)') },
      resistance: { ...createValueParam(QuantityKind.Resistance, 'resistance'), required: true },
      capacitance: { ...createValueParam(QuantityKind.Capacitance, 'capacitance (rc, rlc)') },
      inductance: { ...createValueParam(QuantityKind.Inductance, 'inductance (rl, rlc)') },
      times: {
        type: 'array',
        description: 'time points to evaluate',
        required: true,
        items: createValueParam(QuantityKind.Time, 'time'),
      },
    },
    execute: (args): Record<string, JsonValue> => {
      const mode = args.mode
      const resistance = toScalar(args.resistance, QuantityKind.Resistance)
      const times = args.times.map((item) => toScalar(item, QuantityKind.Time))
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage, QuantityKind.Voltage)
      const serialize = (point: { time: number; voltage: number; current: number }) => ({
        time: serializeReal(point.time, QuantityKind.Time),
        voltage: serializeReal(point.voltage, QuantityKind.Voltage),
        current: serializeReal(point.current, QuantityKind.Current),
      })
      switch (args.kind) {
        case 'rl': {
          if (args.inductance === undefined) throw new Error('rl kind requires inductance')
          const inductance = toScalar(args.inductance, QuantityKind.Inductance)
          const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent, QuantityKind.Current)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialCurrent === undefined) throw new Error('discharge mode requires initialCurrent')
          const { points } = calcRlTransientSeries(mode, sourceVoltage, initialCurrent, resistance, inductance, times)
          return { kind: args.kind, mode, points: points.map(serialize) }
        }
        case 'rc': {
          if (args.capacitance === undefined) throw new Error('rc kind requires capacitance')
          const capacitance = toScalar(args.capacitance, QuantityKind.Capacitance)
          const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage, QuantityKind.Voltage)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined) throw new Error('discharge mode requires initialVoltage')
          const { points } = calcRcTransientSeries(mode, sourceVoltage, initialVoltage, resistance, capacitance, times)
          return { kind: args.kind, mode, points: points.map(serialize) }
        }
        case 'rlc': {
          if (args.capacitance === undefined) throw new Error('rlc kind requires capacitance')
          if (args.inductance === undefined) throw new Error('rlc kind requires inductance')
          const capacitance = toScalar(args.capacitance, QuantityKind.Capacitance)
          const inductance = toScalar(args.inductance, QuantityKind.Inductance)
          const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage, QuantityKind.Voltage)
          const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent, QuantityKind.Current)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined && args.initialCurrent === undefined) {
            throw new Error('discharge mode requires initialVoltage or initialCurrent')
          }
          const result = calcRlcTransientSeries(mode, sourceVoltage, initialVoltage, initialCurrent, resistance, capacitance, inductance, times)
          return {
            kind: args.kind,
            mode,
            points: result.points.map(serialize),
            alpha: serializeReal(result.alpha, QuantityKind.Frequency),
            omega0: serializeReal(result.omega0, QuantityKind.Frequency),
            dampingRatio: serializeReal(result.dampingRatio, QuantityKind.None),
            damping: result.damping,
          }
        }
        default:
          // unreachable: the framework schema restricts kind to rc/rl/rlc
          throw new Error(`unknown transient kind "${args.kind}"`)
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
