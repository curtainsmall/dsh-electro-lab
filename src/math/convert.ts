/**
 * JSON IO contract for tool values: every quantity crossing the tool
 * boundary is a self-describing value object with a `kind` (a QuantityKind
 * enum value) and re/im in SI base units. A quantity and its SI unit are
 * one-to-one, so the kind IS the unit category — the single term "kind" is
 * used throughout the contract.
 *
 * INPUT — enum-union of two mutually exclusive forms (oneOf in the
 * schema, so exactly one branch matches):
 *   rect  { form: Form.Rect,  re, im, kind }
 *   polar { form: Form.Polar, mag, angRad, kind }   (angles are radians — SI)
 *
 * OUTPUT — a complete snapshot, both projections always present:
 *   { re, im, kind, mag, angRad }
 * The output feeds straight back into any input branch (re/im → rect,
 * mag + angRad → polar).
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

/** Polar input form with the phase angle in radians (SI). */
export type PolarRadiansValue = {
  form: Form.Polar
  mag: number
  angRad: number
  kind: QuantityKind
}

/** Any accepted input value on the tool boundary. */
export type ComplexInput = RectValue | PolarRadiansValue

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
  angRad: number
}

/** Raise unless the value carries the expected kind. */
export function expectQuantity(value: ComplexValue, expected: QuantityKind): void {
  if (value.kind !== expected) {
    throw new Error(`kind mismatch: expected "${expected}", got "${value.kind}"`)
  }
}

function polarAngle(value: PolarRadiansValue): number {
  return value.angRad
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
  return {
    re: normalizeOutputNumber(value.re),
    im: normalizeOutputNumber(value.im),
    kind,
    mag: normalizeOutputNumber(value.abs()),
    angRad: normalizeOutputNumber(value.arg()),
  }
}

/** Convenience: tool output for a real result. */
export function serializeReal(value: number, kind: QuantityKind): ComplexOutput {
  return serializeComplex(new Complex(value, 0), kind)
}

// ── Common non-SI → SI conversion ────────────────────────────────────────
// The tool surface speaks SI base quantities only (quantity and unit are
// one-to-one), so a user who has a measurement in a legacy unit needs one
// of these conversions first. Every conversion is affine or a fixed
// multiplier — nothing here is a decimal prefix scaling, which plain SI
// already covers.

/** A common non-SI unit that converts cleanly into one SI base quantity. */
export enum CommonUnit {
  // temperature → kelvin (affine)
  Celsius = 'celsius',
  Fahrenheit = 'fahrenheit',
  // pressure → pascal
  Bar = 'bar',
  Psi = 'psi',
  Atm = 'atm',
  // energy → joule
  Calorie = 'calorie',
  Kilocalorie = 'kilocalorie',
  WattHour = 'watthour',
  KilowattHour = 'kilowatthour',
  // power → watt
  Horsepower = 'horsepower',
  // length → metre
  Inch = 'inch',
  Foot = 'foot',
  Yard = 'yard',
  Mile = 'mile',
  // mass → kilogram
  Pound = 'pound',
  Ounce = 'ounce',
}

const TO_KELVIN: Partial<Record<CommonUnit, (value: number) => number>> = {
  [CommonUnit.Celsius]: (value) => value + 273.15,
  [CommonUnit.Fahrenheit]: (value) => ((value + 459.67) * 5) / 9,
}

const TO_PASCAL: Partial<Record<CommonUnit, number>> = {
  [CommonUnit.Bar]: 1e5,
  [CommonUnit.Psi]: 6894.757293168,
  [CommonUnit.Atm]: 101325,
}

const TO_JOULE: Partial<Record<CommonUnit, number>> = {
  [CommonUnit.Calorie]: 4.184, // thermochemical calorie
  [CommonUnit.Kilocalorie]: 4184,
  [CommonUnit.WattHour]: 3600,
  [CommonUnit.KilowattHour]: 3.6e6,
}

const TO_WATT: Partial<Record<CommonUnit, number>> = {
  [CommonUnit.Horsepower]: 745.6998715822702, // mechanical horsepower
}

const TO_METRE: Partial<Record<CommonUnit, number>> = {
  [CommonUnit.Inch]: 0.0254,
  [CommonUnit.Foot]: 0.3048,
  [CommonUnit.Yard]: 0.9144,
  [CommonUnit.Mile]: 1609.344,
}

const TO_KILOGRAM: Partial<Record<CommonUnit, number>> = {
  [CommonUnit.Pound]: 0.45359237, // avoirdupois pound
  [CommonUnit.Ounce]: 0.028349523125,
}

/** Convert a magnitude from a common non-SI unit to its SI base quantity.
 *  Returns the magnitude in the SI base unit of the family (K, Pa, J, W, m,
 *  kg) together with its SI quantity kind. */
export function convertCommonUnit(value: number, unit: CommonUnit): { value: number; kind: QuantityKind } {
  switch (unit) {
    case CommonUnit.Celsius:
    case CommonUnit.Fahrenheit:
      return { value: TO_KELVIN[unit]!(value), kind: QuantityKind.Temperature }
    case CommonUnit.Bar:
    case CommonUnit.Psi:
    case CommonUnit.Atm:
      return { value: value * TO_PASCAL[unit]!, kind: QuantityKind.Pressure }
    case CommonUnit.Calorie:
    case CommonUnit.Kilocalorie:
    case CommonUnit.WattHour:
    case CommonUnit.KilowattHour:
      return { value: value * TO_JOULE[unit]!, kind: QuantityKind.Energy }
    case CommonUnit.Horsepower:
      return { value: value * TO_WATT[unit]!, kind: QuantityKind.Power }
    case CommonUnit.Inch:
    case CommonUnit.Foot:
    case CommonUnit.Yard:
    case CommonUnit.Mile:
      return { value: value * TO_METRE[unit]!, kind: QuantityKind.Length }
    case CommonUnit.Pound:
    case CommonUnit.Ounce:
      return { value: value * TO_KILOGRAM[unit]!, kind: QuantityKind.Mass }
  }
}
