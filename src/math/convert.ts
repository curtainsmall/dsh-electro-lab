/**
 * JSON IO contract for tool values: every quantity crossing the tool
 * boundary is a self-describing value object with a `kind` (a QuantityKind
 * enum value) and re/im in SI base units. A quantity and its SI unit are
 * one-to-one, so the kind IS the unit category — the single term "kind" is
 * used throughout the contract.
 *
 * INPUT — enum-union of three mutually exclusive forms (oneOf in the
 * schema, so exactly one branch matches):
 *   rect  { form: Form.Rect,  re, im, kind }
 *   polar { form: Form.Polar, mag, angDeg, kind }
 *   polar { form: Form.Polar, mag, angRad, kind }
 *
 * OUTPUT — a complete snapshot, both projections always present:
 *   { re, im, kind, mag, angDeg, angRad }
 * The output feeds straight back into any input branch (re/im → rect,
 * mag + either angle → polar).
 *
 * Validation is layered: the parameter schema bakes the expected kind
 * into an enum and the form into consts (framework-level), and these
 * helpers re-check on every unwrap (tool-level, also covering orchestrator
 * calls that bypass schema validation).
 */
import { Complex } from 'complex.js'
import { QuantityKind, isNearlyEqual } from './quantity-kind.ts'

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
  kind: QuantityKind
}

/** Polar input form with the phase angle in degrees. */
export type PolarDegreesValue = {
  form: Form.Polar
  mag: number
  angDeg: number
  kind: QuantityKind
}

/** Polar input form with the phase angle in radians. */
export type PolarRadiansValue = {
  form: Form.Polar
  mag: number
  angRad: number
  kind: QuantityKind
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
  kind: QuantityKind
  mag: number
  angDeg: number
  angRad: number
}

/** Raise unless the value carries the expected kind. */
export function expectQuantity(value: ComplexValue, expected: QuantityKind): void {
  if (value.kind !== expected) {
    throw new Error(`kind mismatch: expected "${expected}", got "${value.kind}"`)
  }
}

function polarAngle(value: PolarDegreesValue | PolarRadiansValue): number {
  return 'angDeg' in value ? (value.angDeg * Math.PI) / 180 : value.angRad
}

/** Unwrap to a complex.js value, validating the kind. Output snapshots
 *  (no `form` discriminator) are treated as rect values. */
export function toComplex(value: ComplexValue, expected: QuantityKind): Complex {
  expectQuantity(value, expected)
  if (!('form' in value)) return new Complex(value.re, value.im)
  switch (value.form) {
    case Form.Rect:
      return new Complex(value.re, value.im)
    case Form.Polar: {
      const phi = polarAngle(value)
      return new Complex(value.mag * Math.cos(phi), value.mag * Math.sin(phi))
    }
  }
}

/** Unwrap to a real number, validating the kind. A rect value must have
 *  a negligible imaginary part; a polar value must sit on the real axis
 *  (angle ≈ 0° or 180°). */
export function toScalar(value: ComplexValue, expected: QuantityKind): number {
  expectQuantity(value, expected)
  if (!('form' in value)) {
    if (!isNearlyEqual(value.im, 0)) {
      throw new Error(`expected a real value for kind "${expected}", got imaginary part ${value.im}`)
    }
    return value.re
  }
  switch (value.form) {
    case Form.Rect: {
      if (!isNearlyEqual(value.im, 0)) {
        throw new Error(`expected a real value for kind "${expected}", got imaginary part ${value.im}`)
      }
      return value.re
    }
    case Form.Polar: {
      const phi = polarAngle(value)
      const halfTurns = phi / Math.PI
      if (!isNearlyEqual(Math.abs(halfTurns % 1), 0) && !isNearlyEqual(Math.abs(halfTurns % 1), 1)) {
        throw new Error(`expected a real value for kind "${expected}", got phase angle ${phi} rad`)
      }
      return value.mag * (Math.round(halfTurns) % 2 === 0 ? 1 : -1)
    }
  }
}

/**
 * JSON cannot carry negative zero or non-finite numbers. complex.js
 * arithmetic produces -0 routinely (e.g. +0 divided by a negative number),
 * and the harness rejects it at the lossless-JSON boundary — fold -0 to +0
 * and raise a readable error for NaN/Infinity instead.
 */
function normalizeOutputNumber(value: number): number {
  if (value === 0) return 0
  if (!Number.isFinite(value)) {
    throw new Error('result is not a finite number (NaN or Infinity) — check for division by zero or an invalid operation')
  }
  return value
}

/** Tool output for a complex result: the complete snapshot. */
export function serializeComplex(value: Complex, kind: QuantityKind): ComplexOutput {
  const angRad = normalizeOutputNumber(value.arg())
  return {
    re: normalizeOutputNumber(value.re),
    im: normalizeOutputNumber(value.im),
    kind,
    mag: normalizeOutputNumber(value.abs()),
    angDeg: normalizeOutputNumber((angRad * 180) / Math.PI),
    angRad,
  }
}

/** Convenience: tool output for a real result. */
export function serializeReal(value: number, kind: QuantityKind): ComplexOutput {
  return serializeComplex(new Complex(value, 0), kind)
}
