/**
 * Circuit mathematics. All functions operate on SI base units (Hz, Ω, F, H,
 * V, A, s) and return plain numbers / complex.js values; engineering
 * presentation is the tools' job.
 */
import { Complex } from 'complex.js'

function omega(f: number): number {
  if (!Number.isFinite(f) || f <= 0) throw new Error('frequency must be a finite positive number (Hz)')
  return 2 * Math.PI * f
}

/** Series RLC impedance: Z = R + jωL + 1/(jωC). Omit L=0 / C=0 terms. */
export function seriesImpedance(f: number, r: number, l: number, c: number): Complex {
  const w = omega(f)
  let z = new Complex(r, 0)
  if (l > 0) z = z.add(new Complex(0, w * l))
  if (c > 0) z = z.add(new Complex(0, -1 / (w * c)))
  return z
}

/** Parallel RLC impedance: 1/Z = 1/R + 1/(jωL) + jωC. `r` may be omitted (open). */
export function parallelImpedance(f: number, r: number | undefined, l: number, c: number): Complex {
  const w = omega(f)
  let y = new Complex(r !== undefined && Number.isFinite(r) ? 1 / r : 0, 0)
  if (l > 0) y = y.add(new Complex(0, -1 / (w * l)))
  if (c > 0) y = y.add(new Complex(0, w * c))
  if (y.abs() === 0) throw new Error('parallel RLC has no element (all open)')
  return y.inverse()
}

/** Parallel combination of two impedances: Z = Z1·Z2 / (Z1+Z2). */
export function parallelTwo(z1: Complex, z2: Complex): Complex {
  const sum = z1.add(z2)
  if (sum.abs() === 0) throw new Error('parallel combination has zero total impedance (short circuit)')
  return z1.mul(z2).div(sum)
}

/** Series resonance: f0 = 1/(2π√(LC)). Q and bandwidth need R (mode-aware). */
export function resonance(l: number, c: number, r?: number, mode: 'series' | 'parallel' = 'series'): {
  f0: number
  q?: number
  bandwidth?: number
} {
  if (!Number.isFinite(l) || l <= 0) throw new Error('inductance must be a finite positive number (H)')
  if (!Number.isFinite(c) || c <= 0) throw new Error('capacitance must be a finite positive number (F)')
  const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c))
  if (r === undefined || !Number.isFinite(r)) return { f0 }
  if (r <= 0) throw new Error('resistance must be positive (Ω)')
  const q = mode === 'series' ? Math.sqrt(l / c) / r : r * Math.sqrt(c / l)
  return { f0, q, bandwidth: f0 / q }
}

/** AC power from RMS values: S = V·I, P = S·cosφ, Q = S·sinφ, pf = cosφ. */
export function acPower(vrms: number, irms: number, phiDeg = 0): {
  apparent: number
  real: number
  reactive: number
  powerFactor: number
} {
  if (vrms < 0 || irms < 0) throw new Error('RMS values must be non-negative')
  const phi = (phiDeg * Math.PI) / 180
  const apparent = vrms * irms
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
  vs: number,
  v0: number,
  r: number,
  c: number,
  t: number,
): { v: number; i: number; tau: number } {
  if (r <= 0) throw new Error('resistance must be positive (Ω)')
  if (c <= 0) throw new Error('capacitance must be positive (F)')
  if (t < 0) throw new Error('time must be non-negative (s)')
  const tau = r * c
  const exp = Math.exp(-t / tau)
  const v = mode === 'charge' ? vs * (1 - exp) : v0 * exp
  const i = mode === 'charge' ? (vs - v) / r : v / r
  return { v, i, tau }
}

/** RL transient. mode 'charge': i(t) = (Vs/R)(1−e^(−t/τ)); 'discharge': i(t) = I0·e^(−t/τ). */
export function rlTransient(
  mode: 'charge' | 'discharge',
  vs: number,
  i0: number,
  r: number,
  l: number,
  t: number,
): { i: number; v: number; tau: number } {
  if (r <= 0) throw new Error('resistance must be positive (Ω)')
  if (l <= 0) throw new Error('inductance must be positive (H)')
  if (t < 0) throw new Error('time must be non-negative (s)')
  const tau = l / r
  const exp = Math.exp(-t / tau)
  const i = mode === 'charge' ? (vs / r) * (1 - exp) : i0 * exp
  const v = mode === 'charge' ? vs * exp : i0 * r * exp
  return { i, v, tau }
}
