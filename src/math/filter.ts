/**
 * Filter mathematics: Butterworth low-pass ladder design.
 *
 * Prototype (equal terminations R, cutoff ωc = 1):
 *   g_k = 2·sin((2k−1)·π/(2n))   for k = 1..n, with g₀ = g_{n+1} = 1
 * Denormalization (impedance R, frequency ωc = 2π·fc):
 *   series inductors:  L_k = R·g_k / ωc
 *   shunt capacitors:  C_k = g_k / (R·ωc)
 * Ladder starts with a series element; roles alternate.
 */
import { Connection, ElementKind } from './circuits.ts'

/** One ladder element of a designed filter. */
export interface FilterElement {
  role: Connection
  kind: ElementKind.Inductance | ElementKind.Capacitance
  value: number
}

/** Butterworth low-pass ladder design (equal source/load terminations). */
export function designButterworthLowpass(
  order: number,
  cutoffFrequency: number,
  resistance: number,
): FilterElement[] {
  if (!Number.isInteger(order) || order < 1) {
    throw new Error('order must be a positive integer')
  }
  if (cutoffFrequency <= 0) throw new Error('cutoff frequency must be positive (Hz)')
  if (resistance <= 0) throw new Error('resistance must be positive (Ω)')
  const angularCutoff = 2 * Math.PI * cutoffFrequency
  const elements: FilterElement[] = []
  for (let k = 1; k <= order; k++) {
    const g = 2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * order))
    const series = k % 2 === 1
    elements.push(
      series
        ? { role: Connection.Series, kind: ElementKind.Inductance, value: (resistance * g) / angularCutoff }
        : { role: Connection.Shunt, kind: ElementKind.Capacitance, value: g / (resistance * angularCutoff) },
    )
  }
  return elements
}

/** Butterworth attenuation at a frequency: 10·log10(1 + (f/fc)^(2n)) dB. */
export function calcButterworthAttenuation(
  order: number,
  cutoffFrequency: number,
  frequency: number,
): number {
  if (frequency <= 0) throw new Error('query frequency must be positive (Hz)')
  const ratio = frequency / cutoffFrequency
  return 10 * Math.log10(1 + Math.pow(ratio, 2 * order))
}
