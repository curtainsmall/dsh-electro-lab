/**
 * Concept-level circuit tools: primitives (element/series/parallel/circuit
 * impedance) plus scalar concepts. IO is JSON-and-complex-only.
 */
import { Complex } from 'complex.js'
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
import { toComplex, toScalar, serializeComplex, serializeReal, type ComplexValue } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

/** Element kind → quantity kind: the leaf value object's kind must match. */
const ELEMENT_QUANTITY_KINDS: Record<ElementKind, QuantityKind> = {
  [ElementKind.Resistance]: QuantityKind.Resistance,
  [ElementKind.Inductance]: QuantityKind.Inductance,
  [ElementKind.Capacitance]: QuantityKind.Capacitance,
}

/** The three element kinds accepted as leaves (explicit set: enum reverse mappings are not emitted at runtime). */
const ELEMENT_KINDS = new Set<string>([ElementKind.Resistance, ElementKind.Inductance, ElementKind.Capacitance])

export const circuitTools = [
  defineJsonTool({
    name: 'equivalent_impedance',
    description: 'Total impedance of a set of impedances combined in series (Z = Σ Zi) or in parallel (1/Z = Σ 1/Zi). Pass each impedance as a complex value object; earlier step outputs may be referenced with @stepN in solve_steps.',
    returns: { type: 'quantity', kind: QuantityKind.Resistance },
    parameters: {
      topology: { type: 'string', enum: [CircuitMode.Series, CircuitMode.Parallel], description: 'how to combine the impedances', required: true },
      impedances: {
        type: 'array',
        description: 'impedances to combine',
        required: true,
        items: createValueParam(QuantityKind.Resistance, 'impedance'),
      },
    },
    execute: (args) => {
      const parts = args.impedances.map((item) => toComplex(item, QuantityKind.Resistance))
      let total: Complex
      switch (args.topology) {
        case CircuitMode.Series:
          total = combineSeriesImpedances(parts)
          break
        case CircuitMode.Parallel:
          total = combineParallelImpedances(parts)
          break
        default:
          // unreachable: the framework schema restricts topology to series/parallel
          throw new Error(`unknown topology "${args.topology}"`)
      }
      return serializeComplex(total, QuantityKind.Resistance)
    },
  }),
  defineJsonTool({
    name: 'circuit_impedance',
    description: 'Total impedance of a (possibly nested) network at a frequency. The network is a tree: a leaf is a complex value object of kind resistance|inductance|capacitance; a group is {"topology": "series"|"parallel", "elements": [node, ...]}. Nested groups are allowed. Returns the driving-point impedance.',
    returns: { type: 'quantity', kind: QuantityKind.Resistance },
    parameters: {
      network: { type: 'json', description: 'network tree, e.g. {"topology":"series","elements":[{"form":"rect","re":10,"im":0,"kind":"resistance"},{"form":"rect","re":0.001,"im":0,"kind":"inductance"}]}', required: true },
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
    returns: {
      type: 'object',
      fields: {
        resonantFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
        mode: { type: 'scalar' },
        qualityFactor: { type: 'quantity', kind: QuantityKind.None },
        bandwidth: { type: 'quantity', kind: QuantityKind.Frequency },
      },
    },
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
    returns: {
      type: 'object',
      fields: {
        apparent: { type: 'quantity', kind: QuantityKind.Power },
        real: { type: 'quantity', kind: QuantityKind.Power },
        reactive: { type: 'quantity', kind: QuantityKind.Power },
        powerFactor: { type: 'quantity', kind: QuantityKind.None },
      },
    },
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
    returns: {
      type: 'object',
      fields: {
        kind: { type: 'scalar' },
        mode: { type: 'scalar' },
        points: {
          type: 'array',
          item: {
            type: 'object',
            fields: {
              time: { type: 'quantity', kind: QuantityKind.Time },
              voltage: { type: 'quantity', kind: QuantityKind.Voltage },
              current: { type: 'quantity', kind: QuantityKind.Current },
            },
          },
        },
        alpha: { type: 'quantity', kind: QuantityKind.Frequency },
        omega0: { type: 'quantity', kind: QuantityKind.Frequency },
        dampingRatio: { type: 'quantity', kind: QuantityKind.None },
        damping: { type: 'scalar' },
      },
    },
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

/** Validate a raw JSON network tree into a typed NetworkElement; leaves are complex value objects. */
export function validateNetwork(input: unknown): NetworkElement {
  if (typeof input !== 'object' || input === null) throw new Error('network must be an object')
  const node = input as Record<string, unknown>
  if (typeof node['topology'] !== 'string') {
    // leaf: a complex value object whose kind selects the element
    const kind = node['kind']
    if (typeof kind !== 'string' || !ELEMENT_KINDS.has(kind)) {
      throw new Error(`unknown element kind "${String(kind)}"`)
    }
    const expected = ELEMENT_QUANTITY_KINDS[kind as ElementKind]
    if (expected === undefined) throw new Error(`unknown element kind "${kind}"`)
    let value: number
    try {
      value = toScalar(node as ComplexValue, expected)
    } catch (error) {
      throw new Error(`element "${kind}" needs a non-negative real ${kind} value (${error instanceof Error ? error.message : String(error)})`)
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`element "${kind}" needs a non-negative real value`)
    }
    return { kind: kind as ElementKind, value }
  }
  const elements = node['elements']
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error('a group needs a non-empty elements array')
  }
  return { topology: node['topology'] as CircuitMode, elements: elements.map((child) => validateNetwork(child)) }
}
