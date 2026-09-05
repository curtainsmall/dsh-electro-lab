/**
 * Engine fn definitions migrated from src/tools/circuit-tools.ts —
 * one FnDef per legacy defineJsonTool. run bodies mirror the old executes
 * (SI base units; the toScalar/toComplex unwrapping is preserved) but return
 * plain numbers for real results and rect complex values for complex ones,
 * which the engine types against `returns`.
 *
 * Migration notes (documented deviations from the legacy tool surface):
 * - circuit_impedance.network: the legacy schema took a recursive JSON tree
 *   (element leaves of kind resistance|inductance|capacitance, plus nested
 *   series/parallel groups). The engine spec language is a closed spec that
 *   cannot express a recursive heterogeneous tree, so the parameter is
 *   declared as a string carrying the same JSON text (see validateNetwork
 *   below) and the run parses + validates it.
 * - resonance.resistance was optional (a call without it returned only the
 *   resonant frequency). The engine returns spec is one exact object shape
 *   per fn, so resistance is required here and the object always carries
 *   qualityFactor and bandwidth.
 * - transient_response: the legacy rlc branch additionally reported alpha/
 *   omega0/dampingRatio/damping. An engine returns object has a fixed shape
 *   across rc/rl/rlc, so those rlc characterization fields are not returned
 *   (the per-time voltage/current curve still is).
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
} from '../../math/circuits.ts'
import { toComplex, toScalar, serializeComplex, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Element kind → quantity kind: the leaf value object's kind must match. */
const ELEMENT_QUANTITY_KINDS: Record<ElementKind, QuantityKind> = {
  [ElementKind.Resistance]: QuantityKind.Resistance,
  [ElementKind.Inductance]: QuantityKind.Inductance,
  [ElementKind.Capacitance]: QuantityKind.Capacitance,
}

/** The three element kinds accepted as leaves (explicit set: enum reverse mappings are not emitted at runtime). */
const ELEMENT_KINDS = new Set<string>([ElementKind.Resistance, ElementKind.Inductance, ElementKind.Capacitance])

/** Kernel complex value → engine-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

/** Validate a raw JSON network tree into a typed NetworkElement; leaves are
 *  complex value objects of kind resistance|inductance|capacitance. */
function validateNetwork(input: unknown): NetworkElement {
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
      value = toScalar(node as ValuePayload)
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

/** Parse the JSON-text network parameter into a typed NetworkElement. */
function parseNetwork(text: string): NetworkElement {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`network must be valid JSON text (${error instanceof Error ? error.message : String(error)})`)
  }
  return validateNetwork(raw)
}

export const circuitFns: FnDef[] = [
  {
    id: 'equivalent_impedance',
    summary: 'Total impedance of a set of impedances combined in series (Z = Σ Zi) or in parallel (1/Z = Σ 1/Zi)',
    parameters: {
      topology: { type: 'string', enum: [CircuitMode.Series, CircuitMode.Parallel] },
      impedances: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Resistance } },
    },
    returns: { type: 'quantity', kind: QuantityKind.Resistance },
    run: (args) => {
      const parts = (args.impedances as ValuePayload[]).map((item) => toComplex(item))
      const topology = args.topology as CircuitMode
      let total: Complex
      switch (topology) {
        case CircuitMode.Series:
          total = combineSeriesImpedances(parts)
          break
        case CircuitMode.Parallel:
          total = combineParallelImpedances(parts)
          break
        default:
          // unreachable: the parameters enum restricts topology to series/parallel
          throw new Error(`unknown topology "${String(args.topology)}"`)
      }
      return rectOf(total)
    },
  },
  {
    id: 'circuit_impedance',
    summary: 'Total driving-point impedance of a (possibly nested) series/parallel network at a frequency; network is JSON text of a tree of element leaves (kind resistance|inductance|capacitance) and series/parallel groups',
    parameters: {
      network: { type: 'string' },
      frequency: { type: 'quantity', kind: QuantityKind.Frequency },
    },
    returns: { type: 'quantity', kind: QuantityKind.Resistance },
    run: (args) => {
      const frequency = toScalar(args.frequency as ValuePayload)
      const node = parseNetwork(String(args.network))
      return rectOf(calcNetworkImpedance(node, frequency))
    },
  },
  {
    id: 'resonance',
    summary: 'Series/parallel LC resonance: resonantFrequency, qualityFactor and bandwidth (qualityFactor = (1/R)√(L/C) series, R√(C/L) parallel)',
    parameters: {
      inductance: { type: 'quantity', kind: QuantityKind.Inductance },
      capacitance: { type: 'quantity', kind: QuantityKind.Capacitance },
      resistance: { type: 'quantity', kind: QuantityKind.Resistance },
      mode: { type: 'string', enum: [CircuitMode.Series, CircuitMode.Parallel], optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        resonantFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
        mode: { type: 'string' },
        qualityFactor: { type: 'quantity', kind: QuantityKind.None },
        bandwidth: { type: 'quantity', kind: QuantityKind.Frequency },
      },
    },
    run: (args) => {
      const inductance = toScalar(args.inductance as ValuePayload)
      const capacitance = toScalar(args.capacitance as ValuePayload)
      const resistance = toScalar(args.resistance as ValuePayload)
      const mode = (args.mode ?? CircuitMode.Series) as CircuitMode
      const result = calcResonance(inductance, capacitance, resistance, mode)
      if (result.qualityFactor === undefined || result.bandwidth === undefined) {
        throw new Error('resonance requires a finite resistance to compute qualityFactor and bandwidth')
      }
      return {
        resonantFrequency: result.resonantFrequency,
        mode,
        qualityFactor: result.qualityFactor,
        bandwidth: result.bandwidth,
      }
    },
  },
  {
    id: 'ac_power',
    summary: 'AC power from RMS values: apparent = V·I, real = apparent·cosφ, reactive = apparent·sinφ, powerFactor = cosφ; phaseAngle (radians) is the V–I phase angle',
    parameters: {
      rmsVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      rmsCurrent: { type: 'quantity', kind: QuantityKind.Current },
      phaseAngle: { type: 'quantity', kind: QuantityKind.Angle, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        apparent: { type: 'quantity', kind: QuantityKind.Power },
        real: { type: 'quantity', kind: QuantityKind.Power },
        reactive: { type: 'quantity', kind: QuantityKind.Power },
        powerFactor: { type: 'quantity', kind: QuantityKind.None },
      },
    },
    run: (args) => {
      const rmsVoltage = toScalar(args.rmsVoltage as ValuePayload)
      const rmsCurrent = toScalar(args.rmsCurrent as ValuePayload)
      const phaseAngle = args.phaseAngle === undefined ? 0 : toScalar(args.phaseAngle as ValuePayload)
      const { apparent, real, reactive, powerFactor } = calcAcPower(rmsVoltage, rmsCurrent, phaseAngle)
      return { apparent, real, reactive, powerFactor }
    },
  },
  {
    id: 'transient_response',
    summary: 'First- or second-order charge/discharge transient at a list of time points; returns one point per time with voltage and current',
    parameters: {
      kind: { type: 'string', enum: ['rc', 'rl', 'rlc'] },
      mode: { type: 'string', enum: [SwitchingMode.Charge, SwitchingMode.Discharge] },
      sourceVoltage: { type: 'quantity', kind: QuantityKind.Voltage, optional: true },
      initialVoltage: { type: 'quantity', kind: QuantityKind.Voltage, optional: true },
      initialCurrent: { type: 'quantity', kind: QuantityKind.Current, optional: true },
      resistance: { type: 'quantity', kind: QuantityKind.Resistance },
      capacitance: { type: 'quantity', kind: QuantityKind.Capacitance, optional: true },
      inductance: { type: 'quantity', kind: QuantityKind.Inductance, optional: true },
      times: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Time } },
    },
    returns: {
      type: 'object',
      fields: {
        kind: { type: 'string' },
        mode: { type: 'string' },
        points: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              time: { type: 'quantity', kind: QuantityKind.Time },
              voltage: { type: 'quantity', kind: QuantityKind.Voltage },
              current: { type: 'quantity', kind: QuantityKind.Current },
            },
          },
        },
      },
    },
    run: (args) => {
      const kind = args.kind as 'rc' | 'rl' | 'rlc'
      const mode = args.mode as SwitchingMode
      const resistance = toScalar(args.resistance as ValuePayload)
      const times = (args.times as ValuePayload[]).map((item) => toScalar(item))
      const sourceVoltage = args.sourceVoltage === undefined ? 0 : toScalar(args.sourceVoltage as ValuePayload)
      const serialize = (point: { time: number; voltage: number; current: number }) => ({
        time: point.time,
        voltage: point.voltage,
        current: point.current,
      })
      switch (kind) {
        case 'rl': {
          if (args.inductance === undefined) throw new Error('rl kind requires inductance')
          const inductance = toScalar(args.inductance as ValuePayload)
          const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent as ValuePayload)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialCurrent === undefined) throw new Error('discharge mode requires initialCurrent')
          const { points } = calcRlTransientSeries(mode, sourceVoltage, initialCurrent, resistance, inductance, times)
          return { kind, mode, points: points.map(serialize) }
        }
        case 'rc': {
          if (args.capacitance === undefined) throw new Error('rc kind requires capacitance')
          const capacitance = toScalar(args.capacitance as ValuePayload)
          const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage as ValuePayload)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined) throw new Error('discharge mode requires initialVoltage')
          const { points } = calcRcTransientSeries(mode, sourceVoltage, initialVoltage, resistance, capacitance, times)
          return { kind, mode, points: points.map(serialize) }
        }
        case 'rlc': {
          if (args.capacitance === undefined) throw new Error('rlc kind requires capacitance')
          if (args.inductance === undefined) throw new Error('rlc kind requires inductance')
          const capacitance = toScalar(args.capacitance as ValuePayload)
          const inductance = toScalar(args.inductance as ValuePayload)
          const initialVoltage = args.initialVoltage === undefined ? 0 : toScalar(args.initialVoltage as ValuePayload)
          const initialCurrent = args.initialCurrent === undefined ? 0 : toScalar(args.initialCurrent as ValuePayload)
          if (mode === SwitchingMode.Charge && args.sourceVoltage === undefined) throw new Error('charge mode requires sourceVoltage')
          if (mode === SwitchingMode.Discharge && args.initialVoltage === undefined && args.initialCurrent === undefined) {
            throw new Error('discharge mode requires initialVoltage or initialCurrent')
          }
          // Second-order characterization (alpha/omega0/dampingRatio/damping) is
          // intentionally not returned: this fn keeps one fixed object shape
          // across rc/rl/rlc (see module header).
          const result = calcRlcTransientSeries(mode, sourceVoltage, initialVoltage, initialCurrent, resistance, capacitance, inductance, times)
          return { kind, mode, points: result.points.map(serialize) }
        }
        default:
          // unreachable: the parameters enum restricts kind to rc/rl/rlc
          throw new Error(`unknown transient kind "${String(kind)}"`)
      }
    },
  },
]
