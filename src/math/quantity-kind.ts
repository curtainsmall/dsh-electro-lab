/**
 * Quantity-kind system: the semantic-category enum (QuantityKind), plus
 * comparison helpers.
 *
 * IO is JSON-and-complex-only by contract: every value on the tool boundary
 * is a self-describing object { re, im, kind } where `kind` is the value of
 * a QuantityKind enum member — the quantity name (frequency, resistance).
 * Under the SI base system a quantity and its unit are one-to-one
 * (frequency ↔ hertz), and this codebase always speaks in quantity names:
 * the code uses `QuantityKind` (TS), the JSON contract uses `kind` as the
 * field with the quantity name as its value; the two always match.
 *
 * All base quantities are always in scope; derived quantities are added
 * when a tool uses them. No strings, no symbols, no prefixes.
 */

/** The semantic category a value belongs to (drives semantics and checks). */
export enum QuantityKind {
  // base quantities
  Time = 'time',
  Length = 'length',
  Mass = 'mass',
  Current = 'current',
  Temperature = 'temperature',
  AmountOfSubstance = 'amount-of-substance',
  LuminousIntensity = 'luminous-intensity',
  // derived quantities in use
  Frequency = 'frequency',
  Resistance = 'resistance',
  Capacitance = 'capacitance',
  Inductance = 'inductance',
  Voltage = 'voltage',
  Power = 'power',
  Angle = 'angle',
  // scale/category modifiers
  Log = 'log',
  None = 'none',
}

/** Pure relative tolerance comparison (no absolute floor). Zero matches zero exactly. */
export function isNearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  if (a === 0 && b === 0) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale === 0) return a === b
  return Math.abs(a - b) <= tol * scale
}

/** Quantity-kind-aware zero check: absolute threshold per kind (engineering floors). */
export function isNegligible(value: number, kind: QuantityKind): boolean {
  if (kind === QuantityKind.None) return Math.abs(value) <= 1e-12
  const thresholds: Record<QuantityKind, number> = {
    [QuantityKind.Time]: 1e-12,
    [QuantityKind.Length]: 1e-9,
    [QuantityKind.Mass]: 1e-12,
    [QuantityKind.Current]: 1e-12,
    [QuantityKind.Temperature]: 1e-9,
    [QuantityKind.AmountOfSubstance]: 1e-12,
    [QuantityKind.LuminousIntensity]: 1e-12,
    [QuantityKind.Frequency]: 1e-3,
    [QuantityKind.Resistance]: 1e-6,
    [QuantityKind.Capacitance]: 1e-14,
    [QuantityKind.Inductance]: 1e-12,
    [QuantityKind.Voltage]: 1e-9,
    [QuantityKind.Power]: 1e-12,
    [QuantityKind.Angle]: 1e-9,
    [QuantityKind.Log]: 0,
    [QuantityKind.None]: 1e-12,
  }
  return Math.abs(value) < thresholds[kind]
}
