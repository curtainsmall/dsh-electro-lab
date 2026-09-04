/**
 * Electronics tools: op-amp configurations, time constants, voltage
 * dividers and LED series resistors. IO is JSON-and-complex-only.
 */
import { ToolError } from '../tool-defines.ts'
import {
  calcDifferentiatorOpamp,
  calcDifferenceOpamp,
  calcIntegratorOpamp,
  calcInvertingOpamp,
  calcLedResistor,
  calcNonInvertingOpamp,
  calcSummingOpamp,
  calcTimeConstant,
  calcVoltageDivider,
  calcVoltageFollowerOpamp,
} from '../math/electronics.ts'
import { toScalar, serializeReal, serializeComplex } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from '../tool-defines.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const electronicsTools = [
  defineJsonTool({
    name: 'opamp_configurations',
    description: 'Ideal op-amp gain/output for a configuration. Inverting: −Rf/Rin; non-inverting: 1+Rf/Rin; voltage-follower: 1; summing: −Rf(V₁/R₁+V₂/R₂); difference: (Rf/R1)(V₂−V₁); integrator: H(jω) = −1/(jωRC) at frequency; differentiator: H(jω) = −jωRC. Frequency-domain configurations return complex gain and output.',
    returns: {
      type: 'object',
      fields: {
        configuration: { type: 'string' },
        gain: { type: 'complex', kind: QuantityKind.None },
        outputVoltage: { type: 'complex', kind: QuantityKind.Voltage },
      },
    },
    parameters: {
      configuration: {
        type: 'string',
        enum: ['inverting', 'non-inverting', 'voltage-follower', 'summing', 'difference', 'integrator', 'differentiator'],
        description: 'circuit configuration',
        required: true,
      },
      feedbackResistance: { ...createValueParam(QuantityKind.Resistance, 'feedback resistance Rf') },
      inputResistance: { ...createValueParam(QuantityKind.Resistance, 'input resistance Rin (integrator: R)') },
      inputVoltage: { ...createValueParam(QuantityKind.Voltage, 'input voltage V₁'), required: true },
      secondInputVoltage: { ...createValueParam(QuantityKind.Voltage, 'second input voltage V₂ (summing/difference)') },
      secondInputResistance: { ...createValueParam(QuantityKind.Resistance, 'second input resistance R₂ (summing)') },
      capacitance: { ...createValueParam(QuantityKind.Capacitance, 'capacitance (integrator/differentiator)') },
      frequency: { ...createValueParam(QuantityKind.Frequency, 'frequency (integrator/differentiator)') },
    },
    execute: (args): Record<string, JsonValue> => {
      switch (args.configuration) {
        case 'inverting': {
          if (args.inputVoltage === undefined || args.feedbackResistance === undefined || args.inputResistance === undefined) {
            throw new ToolError('inverting requires inputVoltage, feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcInvertingOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.feedbackResistance),
            toScalar(args.inputResistance),
          )
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'non-inverting': {
          if (args.inputVoltage === undefined || args.feedbackResistance === undefined || args.inputResistance === undefined) {
            throw new ToolError('non-inverting requires inputVoltage, feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcNonInvertingOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.feedbackResistance),
            toScalar(args.inputResistance),
          )
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'voltage-follower': {
          if (args.inputVoltage === undefined) throw new ToolError('voltage-follower requires inputVoltage')
          const { gain, outputVoltage } = calcVoltageFollowerOpamp(toScalar(args.inputVoltage))
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'summing': {
          if (
            args.inputVoltage === undefined ||
            args.secondInputVoltage === undefined ||
            args.feedbackResistance === undefined ||
            args.inputResistance === undefined ||
            args.secondInputResistance === undefined
          ) {
            throw new ToolError('summing requires inputVoltage, secondInputVoltage, feedbackResistance, inputResistance and secondInputResistance')
          }
          const { outputVoltage } = calcSummingOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.secondInputVoltage),
            toScalar(args.feedbackResistance),
            toScalar(args.inputResistance),
            toScalar(args.secondInputResistance),
          )
          return { configuration: args.configuration, outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'difference': {
          if (args.inputVoltage === undefined || args.secondInputVoltage === undefined || args.feedbackResistance === undefined || args.inputResistance === undefined) {
            throw new ToolError('difference requires inputVoltage, secondInputVoltage, feedbackResistance and inputResistance')
          }
          const { gain, outputVoltage } = calcDifferenceOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.secondInputVoltage),
            toScalar(args.feedbackResistance),
            toScalar(args.inputResistance),
          )
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'integrator': {
          if (args.inputVoltage === undefined || args.inputResistance === undefined || args.capacitance === undefined || args.frequency === undefined) {
            throw new ToolError('integrator requires inputVoltage, inputResistance, capacitance and frequency')
          }
          const { gain, outputVoltage } = calcIntegratorOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.inputResistance),
            toScalar(args.capacitance),
            toScalar(args.frequency),
          )
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        case 'differentiator': {
          if (args.inputVoltage === undefined || args.feedbackResistance === undefined || args.capacitance === undefined || args.frequency === undefined) {
            throw new ToolError('differentiator requires inputVoltage, feedbackResistance, capacitance and frequency')
          }
          const { gain, outputVoltage } = calcDifferentiatorOpamp(
            toScalar(args.inputVoltage),
            toScalar(args.feedbackResistance),
            toScalar(args.capacitance),
            toScalar(args.frequency),
          )
          return { configuration: args.configuration, gain: serializeComplex(gain, QuantityKind.None), outputVoltage: serializeComplex(outputVoltage, QuantityKind.Voltage) }
        }
        default:
          // unreachable: the framework schema restricts configuration to the seven values above
          throw new ToolError(`unknown op-amp configuration "${args.configuration}"`)
      }
    },
  }),
  defineJsonTool({
    name: 'time_constant',
    description: 'Time constant and cutoff frequency: τ = RC (give capacitance) or τ = L/R (give inductance); exactly one of capacitance or inductance. cutoffFrequency = 1/(2πτ).',
    returns: {
      type: 'object',
      fields: {
        timeConstant: { type: 'number', kind: QuantityKind.Time },
        cutoffFrequency: { type: 'number', kind: QuantityKind.Frequency },
      },
    },
    parameters: {
      resistance: { ...createValueParam(QuantityKind.Resistance, 'resistance'), required: true },
      capacitance: { ...createValueParam(QuantityKind.Capacitance, 'capacitance (RC)') },
      inductance: { ...createValueParam(QuantityKind.Inductance, 'inductance (RL)') },
    },
    execute: (args) => {
      const resistance = toScalar(args.resistance)
      const capacitance = args.capacitance === undefined ? undefined : toScalar(args.capacitance)
      const inductance = args.inductance === undefined ? undefined : toScalar(args.inductance)
      const { timeConstant, cutoffFrequency } = calcTimeConstant(resistance, capacitance, inductance)
      return {
        timeConstant: serializeReal(timeConstant, QuantityKind.Time),
        cutoffFrequency: serializeReal(cutoffFrequency, QuantityKind.Frequency),
      }
    },
  }),
  defineJsonTool({
    name: 'voltage_divider',
    description: 'Resistive divider: outputVoltage = Vs·R2/(R1+R2). With a load resistance the divider uses R2∥RL (loaded output, load current returned). outputResistance is the Thévenin source resistance R1∥R2.',
    returns: {
      type: 'object',
      fields: {
        outputVoltage: { type: 'number', kind: QuantityKind.Voltage },
        outputResistance: { type: 'number', kind: QuantityKind.Resistance },
        unloadedOutputVoltage: { type: 'number', kind: QuantityKind.Voltage },
        loadCurrent: { type: 'number', kind: QuantityKind.Current },
      },
    },
    parameters: {
      sourceVoltage: { ...createValueParam(QuantityKind.Voltage, 'source voltage'), required: true },
      resistance1: { ...createValueParam(QuantityKind.Resistance, 'top resistor R1'), required: true },
      resistance2: { ...createValueParam(QuantityKind.Resistance, 'bottom resistor R2'), required: true },
      loadResistance: { ...createValueParam(QuantityKind.Resistance, 'load resistance (optional)') },
    },
    execute: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage)
      const resistance1 = toScalar(args.resistance1)
      const resistance2 = toScalar(args.resistance2)
      const loadResistance = args.loadResistance === undefined ? undefined : toScalar(args.loadResistance)
      const result = calcVoltageDivider(sourceVoltage, resistance1, resistance2, loadResistance)
      const out: Record<string, JsonValue> = {
        outputVoltage: serializeReal(result.outputVoltage, QuantityKind.Voltage),
        outputResistance: serializeReal(result.outputResistance, QuantityKind.Resistance),
      }
      if (result.unloadedOutputVoltage !== undefined) {
        out.unloadedOutputVoltage = serializeReal(result.unloadedOutputVoltage, QuantityKind.Voltage)
        out.loadCurrent = serializeReal(result.loadCurrent!, QuantityKind.Current)
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'led_resistor',
    description: 'LED series resistor: R = (Vs − Vf)/I and its dissipated power P = I²·R. Requires sourceVoltage > forwardVoltage.',
    returns: {
      type: 'object',
      fields: {
        resistance: { type: 'number', kind: QuantityKind.Resistance },
        power: { type: 'number', kind: QuantityKind.Power },
      },
    },
    parameters: {
      sourceVoltage: { ...createValueParam(QuantityKind.Voltage, 'supply voltage'), required: true },
      forwardVoltage: { ...createValueParam(QuantityKind.Voltage, 'LED forward voltage'), required: true },
      current: { ...createValueParam(QuantityKind.Current, 'desired LED current'), required: true },
    },
    execute: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage)
      const forwardVoltage = toScalar(args.forwardVoltage)
      const current = toScalar(args.current)
      const { resistance, power } = calcLedResistor(sourceVoltage, forwardVoltage, current)
      return {
        resistance: serializeReal(resistance, QuantityKind.Resistance),
        power: serializeReal(power, QuantityKind.Power),
      }
    },
  }),
]
