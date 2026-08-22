/**
 * Circuit mathematics. All functions operate on SI base units (Hz, Ω, F, H,
 * V, A, s) and return plain numbers / complex.js values; engineering
 * presentation is the tools' job.
 */
import { Complex } from 'complex.js'

function oMega(Frequency: number): number {
  if (!Number.isFinite(Frequency) || Frequency <= 0) throw new Error('Frequency must be a finite positive number (Hz)')
  return 2 * Math.PI * Frequency
}

/** Series RLC impedance: Z = R + jωL + 1/(jωC). Omit L=0 / C=0 terms. */
export function seriesImpedance(Frequency: number, Resistance: number, Inductance: number, Capacitance: number): Complex {
  const w = oMega(Frequency)
  let z = new Complex(Resistance, 0)
  if (Inductance > 0) z = z.add(new Complex(0, w * Inductance))
  if (Capacitance > 0) z = z.add(new Complex(0, -1 / (w * Capacitance)))
  return z
}

/** Parallel RLC impedance: 1/Z = 1/R + 1/(jωL) + jωC. `r` may be omitted (open). */
export function parallelImpedance(Frequency: number, Resistance: number | undefined, Inductance: number, Capacitance: number): Complex {
  const w = oMega(Frequency)
  let y = new Complex(Resistance !== undefined && Number.isFinite(Resistance) ? 1 / Resistance : 0, 0)
  if (Inductance > 0) y = y.add(new Complex(0, -1 / (w * Inductance)))
  if (Capacitance > 0) y = y.add(new Complex(0, w * Capacitance))
  if (y.abs() === 0) throw new Error('parallel RLC has no element (all open)')
  return y.inverse()
}

/** Parallel combination of two impedances: Z = Z1·Z2 / (Z1+Z2). */
export function parallelTwo(firstImpedance: Complex, SecondImpedance: Complex): Complex {
  const sum = firstImpedance.add(SecondImpedance)
  if (sum.abs() === 0) throw new Error('parallel combination has zero total impedance (short circuit)')
  return firstImpedance.mul(SecondImpedance).div(sum)
}

/** Series resonance: f0 = 1/(2π√(LC)). Q and bandwidth need R (mode-aware). */
export function resonance(Inductance: number, Capacitance: number, Resistance?: number, mode: 'series' | 'parallel' = 'series'): {
  f0: number
  q?: number
  bandwidth?: number
} {
  if (!Number.isFinite(Inductance) || Inductance <= 0) throw new Error('Inductance must be a finite positive number (H)')
  if (!Number.isFinite(Capacitance) || Capacitance <= 0) throw new Error('Capacitance must be a finite positive number (F)')
  const f0 = 1 / (2 * Math.PI * Math.sqrt(Inductance * Capacitance))
  if (Resistance === undefined || !Number.isFinite(Resistance)) return { f0 }
  if (Resistance <= 0) throw new Error('Resistance must be positive (Ω)')
  const q = mode === 'series' ? Math.sqrt(Inductance / Capacitance) / Resistance : Resistance * Math.sqrt(Capacitance / Inductance)
  return { f0, q, bandwidth: f0 / q }
}

/** AC Power from RMS values: S = V·I, P = S·cosφ, Q = S·sinφ, pf = cosφ. */
export function acPower(rmsVoltage: number, rmsCurrent: number, phaseAngleDegree = 0): {
  apparent: number
  real: number
  reactive: number
  PowerFactor: number
} {
  if (rmsVoltage < 0 || rmsCurrent < 0) throw new Error('RMS values must be non-negative')
  const phi = (phaseAngleDegree * Math.PI) / 180
  const apparent = rmsVoltage * rmsCurrent
  return {
    apparent,
    real: apparent * Math.cos(phi),
    reactive: apparent * Math.sin(phi),
    PowerFactor: Math.cos(phi),
  }
}

/** RC transient. mode 'charge': v(t) = Vs(1−e^(−t/τ)); 'discharge': v(t) = V0·e^(−t/τ). */
export function rcTransient(
  mode: 'charge' | 'discharge',
  sourceVoltage: number,
  initialVoltage: number,
  Resistance: number,
  Capacitance: number,
  time: number,
): { Voltage: number; Current: number; tau: number } {
  if (Resistance <= 0) throw new Error('Resistance must be positive (Ω)')
  if (Capacitance <= 0) throw new Error('Capacitance must be positive (F)')
  if (time < 0) throw new Error('time must be non-negative (s)')
  const tau = Resistance * Capacitance
  const exp = Math.exp(-time / tau)
  const Voltage = mode === 'charge' ? sourceVoltage * (1 - exp) : initialVoltage * exp
  const Current = mode === 'charge' ? (sourceVoltage - Voltage) / Resistance : Voltage / Resistance
  return { Voltage, Current, tau }
}

/** RL transient. mode 'charge': i(t) = (Vs/R)(1−e^(−t/τ)); 'discharge': i(t) = I0·e^(−t/τ). */
export function rlTransient(
  mode: 'charge' | 'discharge',
  sourceVoltage: number,
  initialCurrent: number,
  Resistance: number,
  Inductance: number,
  time: number,
): { Current: number; Voltage: number; tau: number } {
  if (Resistance <= 0) throw new Error('Resistance must be positive (Ω)')
  if (Inductance <= 0) throw new Error('Inductance must be positive (H)')
  if (time < 0) throw new Error('time must be non-negative (s)')
  const tau = Inductance / Resistance
  const exp = Math.exp(-time / tau)
  const Current = mode === 'charge' ? (sourceVoltage / Resistance) * (1 - exp) : initialCurrent * exp
  const Voltage = mode === 'charge' ? sourceVoltage * exp : initialCurrent * Resistance * exp
  return { Current, Voltage, tau }
}
