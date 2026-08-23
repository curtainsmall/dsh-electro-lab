/**
 * JSON IO contract for tool values: every quantity crossing the tool
 * boundary is a self-describing value object with a `unit` (a Unit enum
 * value) and re/im in SI base units.
 *
 * INPUT — enum-union of three mutually exclusive forms (oneOf in the
 * schema, so exactly one branch matches):
 *   rect  { form: Form.Rect,  re, im, unit }
 *   polar { form: Form.Polar, mag, angDeg, unit }
 *   polar { form: Form.Polar, mag, angRad, unit }
 *
 * OUTPUT — a complete snapshot, both projections always present:
 *   { re, im, unit, mag, angDeg, angRad }
 * The output feeds straight back into any input branch (re/im → rect,
 * mag + either angle → polar).
 *
 * Validation is layered: the parameter schema bakes the expected unit into
 * an enum and the form into consts (framework-level), and these helpers
 * re-check on every unwrap (tool-level, also covering orchestrator calls
 * that bypass schema validation).
 */
import { Complex } from 'complex.js'
import { Unit, nearlyEqual } from './units.ts'

/** Complex form discriminator (wire value = lowercase string). */
export enum Form {
  Rect = 'rect',
  Polar = 'polar',
}

/** Rectangular input form. */
export type RectValue = {
  form: Form.Rect
  re: number
  im: number
  unit: Unit
}

/** Polar input form with the phase angle in degrees. */
export type PolarDegreesValue = {
  form: Form.Polar
  mag: number
  angDeg: number
  unit: Unit
}

/** Polar input form with the phase angle in radians. */
export type PolarRadiansValue = {
  form: Form.Polar
  mag: number
  angRad: number
  unit: Unit
}

/** Any accepted input value on the tool boundary. */
export type ComplexInput = RectValue | PolarDegreesValue | PolarRadiansValue

/** A value that can be unwrapped: LLM input forms, or a tool output
 *  snapshot (which carries re/im and no discriminator — it IS a rect value). */
export type ComplexValue = ComplexInput | ComplexOutput

/** Tool output: the complete snapshot. A plain object type alias so it
 *  stays assignable to JsonValue in tool outputs (interfaces and
 *  intersections lose the implicit index signature). */
export type ComplexOutput = {
  re: number
  im: number
  unit: Unit
  mag: number
  angDeg: number
  angRad: number
}

/** Raise unless the value carries the expected unit. */
export function expectUnit(value: ComplexValue, expected: Unit): void {
  if (value.unit !== expected) {
    throw new Error(`unit mismatch: expected "${expected}", got "${value.unit}"`)
  }
}

function polarAngle(value: PolarDegreesValue | PolarRadiansValue): number {
  return 'angDeg' in value ? (value.angDeg * Math.PI) / 180 : value.angRad
}

/** Unwrap to a complex.js value, validating the unit. Output snapshots
 *  (no `form` discriminator) are treated as rect values. */
export function toComplex(value: ComplexValue, expected: Unit): Complex {
  expectUnit(value, expected)
  if ('form' in value && value.form === Form.Polar) {
    const phi = polarAngle(value)
    return new Complex(value.mag * Math.cos(phi), value.mag * Math.sin(phi))
  }
  return new Complex(value.re, value.im)
}

/** Unwrap to a real number, validating the unit. A rect value must have a
 *  negligible imaginary part; a polar value must sit on the real axis
 *  (angle ≈ 0° or 180°). */
export function toScalar(value: ComplexValue, expected: Unit): number {
  expectUnit(value, expected)
  if ('form' in value && value.form === Form.Polar) {
    const phi = polarAngle(value)
    const halfTurns = phi / Math.PI
    if (!nearlyEqual(Math.abs(halfTurns % 1), 0) && !nearlyEqual(Math.abs(halfTurns % 1), 1)) {
      throw new Error(`expected a real value for unit "${expected}", got phase angle ${phi} rad`)
    }
    return value.mag * (Math.round(halfTurns) % 2 === 0 ? 1 : -1)
  }
  if (!nearlyEqual(value.im, 0)) {
    throw new Error(`expected a real value for unit "${expected}", got imaginary part ${value.im}`)
  }
  return value.re
}

/** Tool output for a complex result: the complete snapshot. */
export function serializeComplex(value: Complex, unit: Unit): ComplexOutput {
  return {
    re: value.re,
    im: value.im,
    unit,
    mag: value.abs(),
    angDeg: (value.arg() * 180) / Math.PI,
    angRad: value.arg(),
  }
}

/** Convenience: tool output for a real result. */
export function realValue(value: number, unit: Unit): ComplexOutput {
  return serializeComplex(new Complex(value, 0), unit)
}
