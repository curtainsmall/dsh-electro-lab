/**
 * Unit system: the physical-category enum (Unit), plus comparison helpers.
 *
 * IO is JSON-and-complex-only by contract: every value on the tool boundary
 * is a self-describing object { re, im, unit } where unit is a Unit enum
 * value. No strings, no symbols, no prefixes — so no prefix tables or base
 * unit symbols live here.
 */

/** The physical category a value belongs to (drives semantics and checks). */
export enum Unit {
  Frequency = 'frequency',
  Resistance = 'resistance',
  Capacitance = 'capacitance',
  Inductance = 'inductance',
  Voltage = 'voltage',
  Current = 'current',
  Power = 'power',
  Time = 'time',
  None = 'none',
  Angle = 'angle',
  Log = 'log',
}

/** Pure relative tolerance comparison (no absolute floor). Zero matches zero exactly. */
export function isNearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  if (a === 0 && b === 0) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale === 0) return a === b
  return Math.abs(a - b) <= tol * scale
}

/** Unit-aware zero check: absolute threshold per unit (engineering floors). */
export function isNegligible(value: number, unit: Unit): boolean {
  if (unit === Unit.None) return Math.abs(value) <= 1e-12
  const thresholds: Record<Unit, number> = {
    [Unit.Frequency]: 1e-3,
    [Unit.Resistance]: 1e-6,
    [Unit.Capacitance]: 1e-14,
    [Unit.Inductance]: 1e-12,
    [Unit.Voltage]: 1e-9,
    [Unit.Current]: 1e-12,
    [Unit.Power]: 1e-12,
    [Unit.Time]: 1e-12,
    [Unit.None]: 1e-12,
    [Unit.Angle]: 1e-9,
    [Unit.Log]: 0,
  }
  return Math.abs(value) < thresholds[unit]
}
