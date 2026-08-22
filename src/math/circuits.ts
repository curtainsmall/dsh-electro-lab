/**
 * Circuit mathematics. All functions operate on SI base units (Hz, Ω, F, H,
 * V, A, s) and return plain numbers / complex.js values; engineering
 * presentation is the tools' job.
 */
import { Complex } from 'complex.js'

function omega(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new Error('frequency must be a finite positive number (Hz)')
  return 2 * Math.PI * frequencyHz
}

/** Series RLC impedance: Z = R + jωL + 1/(jωC). Omit L=0 / C=0 terms. */
export function seriesImpedance(frequencyHz: number, resistanceOhm: number, inductanceHenry: number, capacitanceFarad: number): Complex {
  const w = omega(frequencyHz)
  let z = new Complex(resistanceOhm, 0)
  if (inductanceHenry > 0) z = z.add(new Complex(0, w * inductanceHenry))
  if (capacitanceFarad > 0) z = z.add(new Complex(0, -1 / (w * capacitanceFarad)))
  return z
}

/** Parallel RLC impedance: 1/Z = 1/R + 1/(jωL) + jωC. `r` may be omitted (open). */
export function parallelImpedance(frequencyHz: number, resistanceOhm: number | undefined, inductanceHenry: number, capacitanceFarad: number): Complex {
  const w = omega(frequencyHz)
  let y = new Complex(resistanceOhm !== undefined && Number.isFinite(resistanceOhm) ? 1 / resistanceOhm : 0, 0)
  if (inductanceHenry > 0) y = y.add(new Complex(0, -1 / (w * inductanceHenry)))
  if (capacitanceFarad > 0) y = y.add(new Complex(0, w * capacitanceFarad))
  if (y.abs() === 0) throw new Error('parallel RLC has no element (all open)')
  return y.inverse()
}

/** Parallel combination of two impedances: Z = Z1·Z2 / (Z1+Z2). */
export function parallelTwo(firstImpedance: Complex, secondImpedance: Complex): Complex {
  const sum = firstImpedance.add(secondImpedance)
  if (sum.abs() === 0) throw new Error('parallel combination has zero total impedance (short circuit)')
  return firstImpedance.mul(secondImpedance).div(sum)
}

/** Series resonance: f0 = 1/(2π√(LC)). Q and bandwidth need R (mode-aware). */
export function resonance(inductanceHenry: number, capacitanceFarad: number, resistanceOhm?: number, mode: 'series' | 'parallel' = 'series'): {
  f0: number
  q?: number
  bandwidth?: number
} {
  if (!Number.isFinite(inductanceHenry) || inductanceHenry <= 0) throw new Error('inductance must be a finite positive number (H)')
  if (!Number.isFinite(capacitanceFarad) || capacitanceFarad <= 0) throw new Error('capacitance must be a finite positive number (F)')
  const f0 = 1 / (2 * Math.PI * Math.sqrt(inductanceHenry * capacitanceFarad))
  if (resistanceOhm === undefined || !Number.isFinite(resistanceOhm)) return { f0 }
  if (resistanceOhm <= 0) throw new Error('resistance must be positive (Ω)')
  const q = mode === 'series' ? Math.sqrt(inductanceHenry / capacitanceFarad) / resistanceOhm : resistanceOhm * Math.sqrt(capacitanceFarad / inductanceHenry)
  return { f0, q, bandwidth: f0 / q }
}

/** AC power from RMS values: S = V·I, P = S·cosφ, Q = S·sinφ, pf = cosφ. */
export function acPower(rmsVoltageVolt: number, rmsCurrentAmpere: number, phaseAngleDegree = 0): {
  apparent: number
  real: number
  reactive: number
  powerFactor: number
} {
  if (rmsVoltageVolt < 0 || rmsCurrentAmpere < 0) throw new Error('RMS values must be non-negative')
  const phi = (phaseAngleDegree * Math.PI) / 180
  const apparent = rmsVoltageVolt * rmsCurrentAmpere
  return {
    apparent,
    real: apparent * Math.cos(phi),
    reactive: apparent * Math.sin(phi),
    powerFactor: Math.cos(phi),
  }
}

/** RC transient. mode 'charge': v(t) = Vs(1−e^(−t/τ)); 'discharge': v(t) = V0·e^(−t/τ). */
export function rcTransient(
  mode: 'charge' | 'discharge',
  sourceVoltageVolt: number,
  initialVoltageVolt: number,
  resistanceOhm: number,
  capacitanceFarad: number,
  timeSecond: number,
): { voltage: number; current: number; tau: number } {
  if (resistanceOhm <= 0) throw new Error('resistance must be positive (Ω)')
  if (capacitanceFarad <= 0) throw new Error('capacitance must be positive (F)')
  if (timeSecond < 0) throw new Error('time must be non-negative (s)')
  const tau = resistanceOhm * capacitanceFarad
  const exp = Math.exp(-timeSecond / tau)
  const voltage = mode === 'charge' ? sourceVoltageVolt * (1 - exp) : initialVoltageVolt * exp
  const current = mode === 'charge' ? (sourceVoltageVolt - voltage) / resistanceOhm : voltage / resistanceOhm
  return { voltage, current, tau }
}

/** RL transient. mode 'charge': i(t) = (Vs/R)(1−e^(−t/τ)); 'discharge': i(t) = I0·e^(−t/τ). */
export function rlTransient(
  mode: 'charge' | 'discharge',
  sourceVoltageVolt: number,
  initialCurrentAmpere: number,
  resistanceOhm: number,
  inductanceHenry: number,
  timeSecond: number,
): { current: number; voltage: number; tau: number } {
  if (resistanceOhm <= 0) throw new Error('resistance must be positive (Ω)')
  if (inductanceHenry <= 0) throw new Error('inductance must be positive (H)')
  if (timeSecond < 0) throw new Error('time must be non-negative (s)')
  const tau = inductanceHenry / resistanceOhm
  const exp = Math.exp(-timeSecond / tau)
  const current = mode === 'charge' ? (sourceVoltageVolt / resistanceOhm) * (1 - exp) : initialCurrentAmpere * exp
  const voltage = mode === 'charge' ? sourceVoltageVolt * exp : initialCurrentAmpere * resistanceOhm * exp
  return { current, voltage, tau }
}
