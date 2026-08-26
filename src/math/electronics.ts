/**
 * Electronics mathematics: op-amp configurations, time constants, voltage
 * dividers and LED series resistors. SI base units; op-amp frequency-domain
 * gains are complex.
 */
import { Complex } from 'complex.js'

// ── Op-amp ───────────────────────────────────────────────────────────────

/** Inverting amplifier: gain = −Rf/Rin; output = gain·Vin. */
export function calcInvertingOpamp(
  inputVoltage: number,
  feedbackResistance: number,
  inputResistance: number,
): { gain: Complex; outputVoltage: Complex } {
  const gain = new Complex(-feedbackResistance / inputResistance, 0)
  return { gain, outputVoltage: gain.mul(inputVoltage) }
}

/** Non-inverting amplifier: gain = 1 + Rf/Rin; output = gain·Vin. */
export function calcNonInvertingOpamp(
  inputVoltage: number,
  feedbackResistance: number,
  inputResistance: number,
): { gain: Complex; outputVoltage: Complex } {
  const gain = new Complex(1 + feedbackResistance / inputResistance, 0)
  return { gain, outputVoltage: gain.mul(inputVoltage) }
}

/** Voltage follower: gain = 1; output = input. */
export function calcVoltageFollowerOpamp(inputVoltage: number): { gain: Complex; outputVoltage: Complex } {
  return { gain: new Complex(1, 0), outputVoltage: new Complex(inputVoltage, 0) }
}

/** Summing amplifier: Vout = −Rf(V₁/R₁ + V₂/R₂). */
export function calcSummingOpamp(
  inputVoltage1: number,
  inputVoltage2: number,
  feedbackResistance: number,
  inputResistance1: number,
  inputResistance2: number,
): { outputVoltage: Complex } {
  const outputVoltage = -feedbackResistance * (inputVoltage1 / inputResistance1 + inputVoltage2 / inputResistance2)
  return { outputVoltage: new Complex(outputVoltage, 0) }
}

/** Difference amplifier: Vout = (Rf/R1)(V₂−V₁). */
export function calcDifferenceOpamp(
  inputVoltage1: number,
  inputVoltage2: number,
  feedbackResistance: number,
  inputResistance: number,
): { gain: Complex; outputVoltage: Complex } {
  const gain = new Complex(feedbackResistance / inputResistance, 0)
  return { gain, outputVoltage: gain.mul(inputVoltage2 - inputVoltage1) }
}

/** Integrator: H(jω) = −1/(jωRC); output = gain·Vin. */
export function calcIntegratorOpamp(
  inputVoltage: number,
  inputResistance: number,
  capacitance: number,
  frequency: number,
): { gain: Complex; outputVoltage: Complex } {
  const omega = 2 * Math.PI * frequency
  const gain = new Complex(0, 1 / (omega * inputResistance * capacitance))
  return { gain, outputVoltage: gain.mul(inputVoltage) }
}

/** Differentiator: H(jω) = −jωRC; output = gain·Vin. */
export function calcDifferentiatorOpamp(
  inputVoltage: number,
  feedbackResistance: number,
  capacitance: number,
  frequency: number,
): { gain: Complex; outputVoltage: Complex } {
  const omega = 2 * Math.PI * frequency
  const gain = new Complex(0, -omega * feedbackResistance * capacitance)
  return { gain, outputVoltage: gain.mul(inputVoltage) }
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
