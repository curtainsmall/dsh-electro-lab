/**
 * Electronics mathematics: op-amp configurations, time constants, voltage
 * dividers and LED series resistors. SI base units; op-amp frequency-domain
 * gains are complex.
 */
import { Complex } from 'complex.js'

// ── Enums ────────────────────────────────────────────────────────────────

/** Op-amp configuration. */
export enum OpampConfiguration {
  Inverting = 'inverting',
  NonInverting = 'non-inverting',
  VoltageFollower = 'voltage-follower',
  Summing = 'summing',
  Difference = 'difference',
  Integrator = 'integrator',
  Differentiator = 'differentiator',
}

// ── Op-amp ───────────────────────────────────────────────────────────────

/** Op-amp result: complex gain (when well-defined) and/or output voltage. */
export function calcOpamp(
  configuration: OpampConfiguration,
  parameters: {
    feedbackResistance?: number
    inputResistance?: number
    inputVoltage?: number
    secondInputVoltage?: number
    secondInputResistance?: number
    capacitance?: number
    frequency?: number
  },
): { gain?: Complex; outputVoltage?: Complex } {
  const { feedbackResistance, inputResistance, inputVoltage, secondInputVoltage, secondInputResistance, capacitance, frequency } = parameters
  switch (configuration) {
    case OpampConfiguration.Inverting: {
      if (feedbackResistance === undefined || inputResistance === undefined || inputVoltage === undefined) {
        throw new Error('inverting configuration needs feedbackResistance, inputResistance and inputVoltage')
      }
      const gain = new Complex(-feedbackResistance / inputResistance, 0)
      return { gain, outputVoltage: gain.mul(inputVoltage) }
    }
    case OpampConfiguration.NonInverting: {
      if (feedbackResistance === undefined || inputResistance === undefined || inputVoltage === undefined) {
        throw new Error('non-inverting configuration needs feedbackResistance, inputResistance and inputVoltage')
      }
      const gain = new Complex(1 + feedbackResistance / inputResistance, 0)
      return { gain, outputVoltage: gain.mul(inputVoltage) }
    }
    case OpampConfiguration.VoltageFollower: {
      if (inputVoltage === undefined) throw new Error('voltage-follower needs inputVoltage')
      return { gain: new Complex(1, 0), outputVoltage: new Complex(inputVoltage, 0) }
    }
    case OpampConfiguration.Summing: {
      if (
        feedbackResistance === undefined ||
        inputResistance === undefined ||
        secondInputResistance === undefined ||
        inputVoltage === undefined ||
        secondInputVoltage === undefined
      ) {
        throw new Error('summing needs feedbackResistance, inputResistance, secondInputResistance, inputVoltage and secondInputVoltage')
      }
      const outputVoltage = -feedbackResistance * (inputVoltage / inputResistance + secondInputVoltage / secondInputResistance)
      return { outputVoltage: new Complex(outputVoltage, 0) }
    }
    case OpampConfiguration.Difference: {
      if (feedbackResistance === undefined || inputResistance === undefined || inputVoltage === undefined || secondInputVoltage === undefined) {
        throw new Error('difference needs feedbackResistance, inputResistance, inputVoltage and secondInputVoltage')
      }
      const gain = new Complex(feedbackResistance / inputResistance, 0)
      return { gain, outputVoltage: gain.mul(secondInputVoltage - inputVoltage) }
    }
    case OpampConfiguration.Integrator: {
      if (inputResistance === undefined || capacitance === undefined || frequency === undefined || inputVoltage === undefined) {
        throw new Error('integrator needs inputResistance, capacitance, frequency and inputVoltage')
      }
      const omega = 2 * Math.PI * frequency
      // H(jω) = −1/(jωRC)
      const gain = new Complex(0, 1 / (omega * inputResistance * capacitance))
      return { gain, outputVoltage: gain.mul(inputVoltage) }
    }
    case OpampConfiguration.Differentiator: {
      if (feedbackResistance === undefined || capacitance === undefined || frequency === undefined || inputVoltage === undefined) {
        throw new Error('differentiator needs feedbackResistance, capacitance, frequency and inputVoltage')
      }
      const omega = 2 * Math.PI * frequency
      // H(jω) = −jωRC
      const gain = new Complex(0, -omega * feedbackResistance * capacitance)
      return { gain, outputVoltage: gain.mul(inputVoltage) }
    }
  }
}

// ── Time constant ────────────────────────────────────────────────────────

/**
 * Time constant and cutoff frequency: τ = RC (capacitance given) or
 * τ = L/R (inductance given); exactly one of the two must be provided.
 */
export function calcTimeConstant(
  resistance: number,
  capacitance?: number,
  inductance?: number,
): { timeConstant: number; cutoffFrequency: number } {
  if (resistance <= 0) throw new Error('resistance must be positive (Ω)')
  let timeConstant: number
  switch (true) {
    case capacitance !== undefined && inductance === undefined:
      if (capacitance! <= 0) throw new Error('capacitance must be positive (F)')
      timeConstant = resistance * capacitance!
      break
    case inductance !== undefined && capacitance === undefined:
      if (inductance! <= 0) throw new Error('inductance must be positive (H)')
      timeConstant = inductance! / resistance
      break
    default:
      throw new Error('provide exactly one of capacitance or inductance')
  }
  return { timeConstant, cutoffFrequency: 1 / (2 * Math.PI * timeConstant) }
}

// ── Voltage divider ──────────────────────────────────────────────────────

/**
 * Resistive divider: outputVoltage = Vs·R2/(R1+R2); with a load resistance
 * the divider ratio uses R2∥RL. outputResistance is the Thévenin source
 * resistance R1∥R2.
 */
export function calcVoltageDivider(
  sourceVoltage: number,
  resistance1: number,
  resistance2: number,
  loadResistance?: number,
): { outputVoltage: number; unloadedOutputVoltage?: number; loadCurrent?: number; outputResistance: number } {
  if (resistance1 <= 0 || resistance2 <= 0) throw new Error('resistances must be positive (Ω)')
  if (loadResistance !== undefined && loadResistance <= 0) throw new Error('load resistance must be positive (Ω)')
  const unloaded = sourceVoltage * (resistance2 / (resistance1 + resistance2))
  const outputResistance = (resistance1 * resistance2) / (resistance1 + resistance2)
  if (loadResistance === undefined) {
    return { outputVoltage: unloaded, outputResistance }
  }
  const parallel = (resistance2 * loadResistance) / (resistance2 + loadResistance)
  const loaded = sourceVoltage * (parallel / (resistance1 + parallel))
  return { outputVoltage: loaded, unloadedOutputVoltage: unloaded, loadCurrent: loaded / loadResistance, outputResistance }
}

// ── LED ──────────────────────────────────────────────────────────────────

/** LED series resistor: R = (Vs − Vf)/I, with dissipated power P = I²·R. */
export function calcLedResistor(
  sourceVoltage: number,
  forwardVoltage: number,
  current: number,
): { resistance: number; power: number } {
  if (sourceVoltage <= forwardVoltage) throw new Error('source voltage must exceed the LED forward voltage (V)')
  if (current <= 0) throw new Error('current must be positive (A)')
  const resistance = (sourceVoltage - forwardVoltage) / current
  return { resistance, power: current * current * resistance }
}
