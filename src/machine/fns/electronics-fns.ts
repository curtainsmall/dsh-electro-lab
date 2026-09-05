/**
 * Context fn definitions migrated from src/tools/electronics-tools.ts —
 * one FnDef per legacy defineJsonTool. run bodies mirror the old executes
 * (SI base units; toScalar unwrapping preserved); real results come back as
 * plain numbers, complex ones (op-amp gain/output) as rect complex values,
 * which the context types against `returns`.
 *
 * Migration notes (documented deviations from the legacy tool surface):
 * - opamp_configurations: the legacy 'summing' configuration returned only
 *   { configuration, outputVoltage } (a summing amplifier has no single gain),
 *   while every other configuration also returned gain. A context returns
 *   object has one exact shape per fn, so the migrated fn keeps the six
 *   single-input configurations (each returning gain + outputVoltage) and
 *   drops 'summing' from the enum.
 * - voltage_divider: loadResistance stays optional; the result always carries
 *   the full four-field object. Without a load the divider is unloaded, so
 *   unloadedOutputVoltage equals outputVoltage and loadCurrent is 0 (the
 *   exact limiting values, not invented numbers).
 */
import { Complex } from 'complex.js'
import {
  calcDifferenceOpamp,
  calcDifferentiatorOpamp,
  calcIntegratorOpamp,
  calcInvertingOpamp,
  calcLedResistor,
  calcNonInvertingOpamp,
  calcTimeConstant,
  calcVoltageDivider,
  calcVoltageFollowerOpamp,
} from '../../math/electronics.ts'
import { toScalar, serializeComplex, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

/** Kernel complex value → context-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

export const electronicsFns: FnDef[] = [
  {
    id: 'opamp_configurations',
    summary: 'Ideal op-amp gain and output for a configuration: inverting −Rf/Rin, non-inverting 1+Rf/Rin, voltage-follower 1, difference (Rf/R1)(V₂−V₁), integrator −1/(jωRC) and differentiator −jωRC at a frequency',
    parameters: {
      configuration: {
        type: 'string',
        enum: ['inverting', 'non-inverting', 'voltage-follower', 'difference', 'integrator', 'differentiator'],
      },
      feedbackResistance: { type: 'quantity', kind: QuantityKind.Resistance, optional: true },
      inputResistance: { type: 'quantity', kind: QuantityKind.Resistance, optional: true },
      inputVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      secondInputVoltage: { type: 'quantity', kind: QuantityKind.Voltage, optional: true },
      capacitance: { type: 'quantity', kind: QuantityKind.Capacitance, optional: true },
      frequency: { type: 'quantity', kind: QuantityKind.Frequency, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        configuration: { type: 'string' },
        gain: { type: 'quantity', kind: QuantityKind.None },
        outputVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      },
    },
    run: (args) => {
      const configuration = args.configuration as 'inverting' | 'non-inverting' | 'voltage-follower' | 'difference' | 'integrator' | 'differentiator'
      const serialize = (gain: Complex, outputVoltage: Complex) => ({
        configuration,
        gain: rectOf(gain),
        outputVoltage: rectOf(outputVoltage),
      })
      switch (configuration) {
        case 'inverting': {
          if (args.feedbackResistance === undefined || args.inputResistance === undefined) {
            throw new Error('inverting requires feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcInvertingOpamp(
            toScalar(args.inputVoltage as ValuePayload),
            toScalar(args.feedbackResistance as ValuePayload),
            toScalar(args.inputResistance as ValuePayload),
          )
          return serialize(gain, outputVoltage)
        }
        case 'non-inverting': {
          if (args.feedbackResistance === undefined || args.inputResistance === undefined) {
            throw new Error('non-inverting requires feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcNonInvertingOpamp(
            toScalar(args.inputVoltage as ValuePayload),
            toScalar(args.feedbackResistance as ValuePayload),
            toScalar(args.inputResistance as ValuePayload),
          )
          return serialize(gain, outputVoltage)
        }
        case 'voltage-follower': {
          const { gain, outputVoltage } = calcVoltageFollowerOpamp(toScalar(args.inputVoltage as ValuePayload))
          return serialize(gain, outputVoltage)
        }
        case 'difference': {
          if (args.feedbackResistance === undefined || args.inputResistance === undefined || args.secondInputVoltage === undefined) {
            throw new Error('difference requires secondInputVoltage, feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcDifferenceOpamp(
            toScalar(args.inputVoltage as ValuePayload),
            toScalar(args.secondInputVoltage as ValuePayload),
            toScalar(args.feedbackResistance as ValuePayload),
            toScalar(args.inputResistance as ValuePayload),
          )
          return serialize(gain, outputVoltage)
        }
        case 'integrator': {
          if (args.inputResistance === undefined || args.capacitance === undefined || args.frequency === undefined) {
            throw new Error('integrator requires inputResistance, capacitance and frequency')
          }
          const { gain, outputVoltage } = calcIntegratorOpamp(
            toScalar(args.inputVoltage as ValuePayload),
            toScalar(args.inputResistance as ValuePayload),
            toScalar(args.capacitance as ValuePayload),
            toScalar(args.frequency as ValuePayload),
          )
          return serialize(gain, outputVoltage)
        }
        case 'differentiator': {
          if (args.feedbackResistance === undefined || args.capacitance === undefined || args.frequency === undefined) {
            throw new Error('differentiator requires feedbackResistance, capacitance and frequency')
          }
          const { gain, outputVoltage } = calcDifferentiatorOpamp(
            toScalar(args.inputVoltage as ValuePayload),
            toScalar(args.feedbackResistance as ValuePayload),
            toScalar(args.capacitance as ValuePayload),
            toScalar(args.frequency as ValuePayload),
          )
          return serialize(gain, outputVoltage)
        }
        default:
          // unreachable: the parameters enum restricts configuration to the six values above
          throw new Error(`unknown op-amp configuration "${String(configuration)}"`)
      }
    },
  },
  {
    id: 'time_constant',
    summary: 'Time constant and cutoff frequency: τ = RC (give capacitance) or τ = L/R (give inductance); exactly one of capacitance or inductance, cutoffFrequency = 1/(2πτ)',
    parameters: {
      resistance: { type: 'quantity', kind: QuantityKind.Resistance },
      capacitance: { type: 'quantity', kind: QuantityKind.Capacitance, optional: true },
      inductance: { type: 'quantity', kind: QuantityKind.Inductance, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        timeConstant: { type: 'quantity', kind: QuantityKind.Time },
        cutoffFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
      },
    },
    run: (args) => {
      const resistance = toScalar(args.resistance as ValuePayload)
      const capacitance = args.capacitance === undefined ? undefined : toScalar(args.capacitance as ValuePayload)
      const inductance = args.inductance === undefined ? undefined : toScalar(args.inductance as ValuePayload)
      const { timeConstant, cutoffFrequency } = calcTimeConstant(resistance, capacitance, inductance)
      return { timeConstant, cutoffFrequency }
    },
  },
  {
    id: 'voltage_divider',
    summary: 'Resistive divider: outputVoltage = Vs·R2/(R1+R2), with R2∥RL when a loadResistance is given (plus unloadedOutputVoltage and loadCurrent); outputResistance is the Thévenin source resistance R1∥R2',
    parameters: {
      sourceVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      resistance1: { type: 'quantity', kind: QuantityKind.Resistance },
      resistance2: { type: 'quantity', kind: QuantityKind.Resistance },
      loadResistance: { type: 'quantity', kind: QuantityKind.Resistance, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        outputVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
        outputResistance: { type: 'quantity', kind: QuantityKind.Resistance },
        unloadedOutputVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
        loadCurrent: { type: 'quantity', kind: QuantityKind.Current },
      },
    },
    run: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage as ValuePayload)
      const resistance1 = toScalar(args.resistance1 as ValuePayload)
      const resistance2 = toScalar(args.resistance2 as ValuePayload)
      const loadResistance = args.loadResistance === undefined ? undefined : toScalar(args.loadResistance as ValuePayload)
      const result = calcVoltageDivider(sourceVoltage, resistance1, resistance2, loadResistance)
      if (result.unloadedOutputVoltage !== undefined) {
        return {
          outputVoltage: result.outputVoltage,
          outputResistance: result.outputResistance,
          unloadedOutputVoltage: result.unloadedOutputVoltage,
          loadCurrent: result.loadCurrent!,
        }
      }
      // No load: the divider is unloaded, so outputVoltage already is the
      // unloaded value and no current flows into a load.
      return {
        outputVoltage: result.outputVoltage,
        outputResistance: result.outputResistance,
        unloadedOutputVoltage: result.outputVoltage,
        loadCurrent: 0,
      }
    },
  },
  {
    id: 'led_resistor',
    summary: 'LED series resistor: R = (Vs − Vf)/I and its dissipated power P = I²·R (requires sourceVoltage > forwardVoltage)',
    parameters: {
      sourceVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      forwardVoltage: { type: 'quantity', kind: QuantityKind.Voltage },
      current: { type: 'quantity', kind: QuantityKind.Current },
    },
    returns: {
      type: 'object',
      fields: {
        resistance: { type: 'quantity', kind: QuantityKind.Resistance },
        power: { type: 'quantity', kind: QuantityKind.Power },
      },
    },
    run: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage as ValuePayload)
      const forwardVoltage = toScalar(args.forwardVoltage as ValuePayload)
      const current = toScalar(args.current as ValuePayload)
      const { resistance, power } = calcLedResistor(sourceVoltage, forwardVoltage, current)
      return { resistance, power }
    },
  },
]
