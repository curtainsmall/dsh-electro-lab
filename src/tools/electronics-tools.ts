/**
 * Electronics tools: op-amp configurations, time constants, voltage
 * dividers and LED series resistors. IO is JSON-and-complex-only.
 */
import { OpampConfiguration, calcLedResistor, calcOpamp, calcTimeConstant, calcVoltageDivider } from '../math/electronics.ts'
import { toScalar, serializeReal, serializeComplex } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const electronicsTools = [
  defineJsonTool({
    name: 'opamp_configurations',
    description: 'Ideal op-amp gain/output for a configuration. Inverting: −Rf/Rin; non-inverting: 1+Rf/Rin; voltage-follower: 1; summing: −Rf(V₁/R₁+V₂/R₂); difference: (Rf/R1)(V₂−V₁); integrator: H(jω) = −1/(jωRC) at frequency; differentiator: H(jω) = −jωRC. Frequency-domain configurations return complex gain and output.',
    parameters: {
      configuration: {
        type: 'string',
        enum: [
          OpampConfiguration.Inverting,
          OpampConfiguration.NonInverting,
          OpampConfiguration.VoltageFollower,
          OpampConfiguration.Summing,
          OpampConfiguration.Difference,
          OpampConfiguration.Integrator,
          OpampConfiguration.Differentiator,
        ],
        description: 'circuit configuration',
        required: true,
      },
      feedbackResistance: { ...createValueParam(Unit.Resistance, 'feedback resistance Rf') },
      inputResistance: { ...createValueParam(Unit.Resistance, 'input resistance Rin (integrator: R)') },
      inputVoltage: { ...createValueParam(Unit.Voltage, 'input voltage V₁'), required: true },
      secondInputVoltage: { ...createValueParam(Unit.Voltage, 'second input voltage V₂ (summing/difference)') },
      secondInputResistance: { ...createValueParam(Unit.Resistance, 'second input resistance R₂ (summing)') },
      capacitance: { ...createValueParam(Unit.Capacitance, 'capacitance (integrator/differentiator)') },
      frequency: { ...createValueParam(Unit.Frequency, 'frequency (integrator/differentiator)') },
    },
    execute: (args) => {
      const inputVoltage = toScalar(args.inputVoltage, Unit.Voltage)
      const result = calcOpamp(args.configuration, {
        feedbackResistance: args.feedbackResistance === undefined ? undefined : toScalar(args.feedbackResistance, Unit.Resistance),
        inputResistance: args.inputResistance === undefined ? undefined : toScalar(args.inputResistance, Unit.Resistance),
        inputVoltage,
        secondInputVoltage: args.secondInputVoltage === undefined ? undefined : toScalar(args.secondInputVoltage, Unit.Voltage),
        secondInputResistance: args.secondInputResistance === undefined ? undefined : toScalar(args.secondInputResistance, Unit.Resistance),
        capacitance: args.capacitance === undefined ? undefined : toScalar(args.capacitance, Unit.Capacitance),
        frequency: args.frequency === undefined ? undefined : toScalar(args.frequency, Unit.Frequency),
      })
      const out: Record<string, JsonValue> = { configuration: args.configuration }
      if (result.gain !== undefined) out.gain = serializeComplex(result.gain, Unit.None)
      if (result.outputVoltage !== undefined) out.outputVoltage = serializeComplex(result.outputVoltage, Unit.Voltage)
      return out
    },
  }),
  defineJsonTool({
    name: 'time_constant',
    description: 'Time constant and cutoff frequency: τ = RC (give capacitance) or τ = L/R (give inductance); exactly one of capacitance or inductance. cutoffFrequency = 1/(2πτ).',
    parameters: {
      resistance: { ...createValueParam(Unit.Resistance, 'resistance'), required: true },
      capacitance: { ...createValueParam(Unit.Capacitance, 'capacitance (RC)') },
      inductance: { ...createValueParam(Unit.Inductance, 'inductance (RL)') },
    },
    execute: (args) => {
      const resistance = toScalar(args.resistance, Unit.Resistance)
      const capacitance = args.capacitance === undefined ? undefined : toScalar(args.capacitance, Unit.Capacitance)
      const inductance = args.inductance === undefined ? undefined : toScalar(args.inductance, Unit.Inductance)
      const { timeConstant, cutoffFrequency } = calcTimeConstant(resistance, capacitance, inductance)
      return {
        timeConstant: serializeReal(timeConstant, Unit.Time),
        cutoffFrequency: serializeReal(cutoffFrequency, Unit.Frequency),
      }
    },
  }),
  defineJsonTool({
    name: 'voltage_divider',
    description: 'Resistive divider: outputVoltage = Vs·R2/(R1+R2). With a load resistance the divider uses R2∥RL (loaded output, load current returned). outputResistance is the Thévenin source resistance R1∥R2.',
    parameters: {
      sourceVoltage: { ...createValueParam(Unit.Voltage, 'source voltage'), required: true },
      resistance1: { ...createValueParam(Unit.Resistance, 'top resistor R1'), required: true },
      resistance2: { ...createValueParam(Unit.Resistance, 'bottom resistor R2'), required: true },
      loadResistance: { ...createValueParam(Unit.Resistance, 'load resistance (optional)') },
    },
    execute: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage, Unit.Voltage)
      const resistance1 = toScalar(args.resistance1, Unit.Resistance)
      const resistance2 = toScalar(args.resistance2, Unit.Resistance)
      const loadResistance = args.loadResistance === undefined ? undefined : toScalar(args.loadResistance, Unit.Resistance)
      const result = calcVoltageDivider(sourceVoltage, resistance1, resistance2, loadResistance)
      const out: Record<string, JsonValue> = {
        outputVoltage: serializeReal(result.outputVoltage, Unit.Voltage),
        outputResistance: serializeReal(result.outputResistance, Unit.Resistance),
      }
      if (result.unloadedOutputVoltage !== undefined) {
        out.unloadedOutputVoltage = serializeReal(result.unloadedOutputVoltage, Unit.Voltage)
        out.loadCurrent = serializeReal(result.loadCurrent!, Unit.Current)
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'led_resistor',
    description: 'LED series resistor: R = (Vs − Vf)/I and its dissipated power P = I²·R. Requires sourceVoltage > forwardVoltage.',
    parameters: {
      sourceVoltage: { ...createValueParam(Unit.Voltage, 'supply voltage'), required: true },
      forwardVoltage: { ...createValueParam(Unit.Voltage, 'LED forward voltage'), required: true },
      current: { ...createValueParam(Unit.Current, 'desired LED current'), required: true },
    },
    execute: (args) => {
      const sourceVoltage = toScalar(args.sourceVoltage, Unit.Voltage)
      const forwardVoltage = toScalar(args.forwardVoltage, Unit.Voltage)
      const current = toScalar(args.current, Unit.Current)
      const { resistance, power } = calcLedResistor(sourceVoltage, forwardVoltage, current)
      return {
        resistance: serializeReal(resistance, Unit.Resistance),
        power: serializeReal(power, Unit.Power),
      }
    },
  }),
]
