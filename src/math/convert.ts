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
 *   polar { form: Form.Polar, mag, ang, kind }   (angles are radians — SI)
 *
 * OUTPUT — a complete snapshot, both projections always present:
 *   { re, im, kind, mag, ang }
 * The output feeds straight back into any input branch (re/im → rect,
 * mag + ang → polar).
 *
 * Validation is layered: the parameter schema bakes the expected kind
 * into an enum and the form into consts (framework-level), and these
 * helpers re-check on every unwrap (tool-level, also covering orchestrator
 * calls that bypass schema validation).
 */
import { Complex } from 'complex.js'
import { QuantityKind, isNearlyEqual } from './quantity-kind.ts'

/**
 * What a decibel ratio is taken over. The 10 vs 20 factor comes from the
 * nature of the quantity: a linear quantity (power, energy, intensity) has
 * its energy in the quantity itself → 10·log10; a quadratic quantity
 * (voltage, current, pressure — any amplitude whose energy is the square)
 * → 20·log10. Named generically so it applies outside electronics too.
 */
export enum RatioKind {
  Linear = 'linear',
  Quadratic = 'quadratic',
}

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
  ang: number
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
  ang: number
}

/** Raise unless the value carries the expected kind. */
export function expectQuantity(value: ComplexValue, expected: QuantityKind): void {
  if (value.kind !== expected) {
    throw new Error(`kind mismatch: expected "${expected}", got "${value.kind}"`)
  }
}

function polarAngle(value: PolarRadiansValue): number {
  return value.ang
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
    ang: normalizeOutputNumber(value.arg()),
  }
}

/** Convenience: tool output for a real result. */
export function serializeReal(value: number, kind: QuantityKind): ComplexOutput {
  return serializeComplex(new Complex(value, 0), kind)
}

// ── Unit conversion, split by family ─────────────────────────────────────
// One function per quantity family, each with its own unit types and its
// own number/complex policy (linear families scale complex values;
// temperature and log are real). The convert tool dispatches on the source
// unit. Local helpers keep the shared mechanics in one place.

/** Every supported unit, grouped by family. */
export enum ConvertUnit {
  // temperature → kelvin (affine)
  Celsius = 'celsius',
  Fahrenheit = 'fahrenheit',
  Kelvin = 'kelvin',
  // pressure → pascal
  Bar = 'bar',
  Psi = 'psi',
  Atm = 'atm',
  Pascal = 'pascal',
  // energy → joule
  Calorie = 'calorie',
  Kilocalorie = 'kilocalorie',
  WattHour = 'watthour',
  KilowattHour = 'kilowatthour',
  Joule = 'joule',
  // power → watt
  Horsepower = 'horsepower',
  Watt = 'watt',
  // length → metre
  Inch = 'inch',
  Foot = 'foot',
  Yard = 'yard',
  Mile = 'mile',
  Metre = 'metre',
  // mass → kilogram
  Pound = 'pound',
  Ounce = 'ounce',
  Kilogram = 'kilogram',
  // angle → radian
  Degree = 'degree',
  Radian = 'radian',
  // log scale (ratio ↔ dB)
  Ratio = 'ratio',
  Db = 'db',
}

export type TemperatureUnit = ConvertUnit.Celsius | ConvertUnit.Fahrenheit | ConvertUnit.Kelvin
export type PressureUnit = ConvertUnit.Bar | ConvertUnit.Psi | ConvertUnit.Atm | ConvertUnit.Pascal
export type EnergyUnit = ConvertUnit.Calorie | ConvertUnit.Kilocalorie | ConvertUnit.WattHour | ConvertUnit.KilowattHour | ConvertUnit.Joule
export type PowerUnit = ConvertUnit.Horsepower | ConvertUnit.Watt
export type LengthUnit = ConvertUnit.Inch | ConvertUnit.Foot | ConvertUnit.Yard | ConvertUnit.Mile | ConvertUnit.Metre
export type MassUnit = ConvertUnit.Pound | ConvertUnit.Ounce | ConvertUnit.Kilogram
export type LogUnit = ConvertUnit.Ratio | ConvertUnit.Db

/** Linear scale factor to the family base unit (complete for every linear unit). */
const TO_BASE: Partial<Record<ConvertUnit, number>> = {
  // pressure → pascal
  [ConvertUnit.Bar]: 1e5,
  [ConvertUnit.Psi]: 6894.757293168,
  [ConvertUnit.Atm]: 101325,
  [ConvertUnit.Pascal]: 1,
  // energy → joule
  [ConvertUnit.Calorie]: 4.184, // thermochemical calorie
  [ConvertUnit.Kilocalorie]: 4184,
  [ConvertUnit.WattHour]: 3600,
  [ConvertUnit.KilowattHour]: 3.6e6,
  [ConvertUnit.Joule]: 1,
  // power → watt
  [ConvertUnit.Horsepower]: 745.6998715822702, // mechanical horsepower
  [ConvertUnit.Watt]: 1,
  // length → metre
  [ConvertUnit.Inch]: 0.0254,
  [ConvertUnit.Foot]: 0.3048,
  [ConvertUnit.Yard]: 0.9144,
  [ConvertUnit.Mile]: 1609.344,
  [ConvertUnit.Metre]: 1,
  // mass → kilogram
  [ConvertUnit.Pound]: 0.45359237, // avoirdupois pound
  [ConvertUnit.Ounce]: 0.028349523125,
  [ConvertUnit.Kilogram]: 1,
  // angle → radian
  [ConvertUnit.Degree]: Math.PI / 180,
  [ConvertUnit.Radian]: 1,
}

/** Unwrap a value to a real number; a complex value with an imaginary part is rejected. */
function asReal(value: number | Complex, family: string): number {
  if (value instanceof Complex) {
    if (!isNearlyEqual(value.im, 0)) throw new Error(`${family} conversion requires a real value`)
    return value.re
  }
  return value
}

/** Scale by a factor: linear families scale both components of a complex value. */
function scaleLinear(value: number | Complex, factor: number): Complex {
  return value instanceof Complex ? value.mul(factor) : new Complex(value * factor, 0)
}

function toKelvin(unit: TemperatureUnit, value: number): number {
  switch (unit) {
    case ConvertUnit.Celsius:
      return value + 273.15
    case ConvertUnit.Fahrenheit:
      return ((value + 459.67) * 5) / 9
    case ConvertUnit.Kelvin:
      return value
  }
}

function fromKelvin(unit: TemperatureUnit, kelvin: number): number {
  switch (unit) {
    case ConvertUnit.Celsius:
      return kelvin - 273.15
    case ConvertUnit.Fahrenheit:
      return (kelvin * 9) / 5 - 459.67
    case ConvertUnit.Kelvin:
      return kelvin
  }
}

/** Temperature is affine: convert via kelvin; requires a real value. */
export function convertTemperature(value: number | Complex, from: TemperatureUnit, to: TemperatureUnit): Complex {
  const kelvin = toKelvin(from, asReal(value, 'temperature'))
  return new Complex(fromKelvin(to, kelvin), 0)
}

/** Pressure: linear, complex values scale both components. */
export function convertPressure(value: number | Complex, from: PressureUnit, to: PressureUnit): Complex {
  return scaleLinear(value, TO_BASE[from]! / TO_BASE[to]!)
}

/** Energy: linear, complex values scale both components. */
export function convertEnergy(value: number | Complex, from: EnergyUnit, to: EnergyUnit): Complex {
  return scaleLinear(value, TO_BASE[from]! / TO_BASE[to]!)
}

/** Power: linear, complex values scale both components. */
export function convertPower(value: number | Complex, from: PowerUnit, to: PowerUnit): Complex {
  return scaleLinear(value, TO_BASE[from]! / TO_BASE[to]!)
}

/** Length: linear, complex values scale both components. */
export function convertLength(value: number | Complex, from: LengthUnit, to: LengthUnit): Complex {
  return scaleLinear(value, TO_BASE[from]! / TO_BASE[to]!)
}

/** Mass: linear, complex values scale both components. */
export function convertMass(value: number | Complex, from: MassUnit, to: MassUnit): Complex {
  return scaleLinear(value, TO_BASE[from]! / TO_BASE[to]!)
}

/**
 * Angle: degrees → radians. Angles are radians everywhere on the tool
 * boundary, so this is the only angle conversion that exists — a radian
 * value needs no conversion (identity), and the target is always radians.
 * Linear, so complex values scale both components.
 */
export function convertAngle(value: number | Complex): Complex {
  return scaleLinear(value, Math.PI / 180)
}

/**
 * Log scale: ratio ↔ dB. Power ratios use 10·log10, voltage ratios
 * 20·log10; requires a real value and a kind.
 */
export function convertLogValue(value: number | Complex, from: LogUnit, to: LogUnit, kind: RatioKind): Complex {
  const valueRe = asReal(value, 'log')
  let logFactor: number
  switch (kind) {
    case RatioKind.Linear:
      logFactor = 10
      break
    case RatioKind.Quadratic:
      logFactor = 20
      break
  }
  let ratio: number
  switch (from) {
    case ConvertUnit.Db:
      ratio = 10 ** (valueRe / logFactor)
      break
    case ConvertUnit.Ratio:
      ratio = valueRe
      break
  }
  let converted: number
  switch (to) {
    case ConvertUnit.Db:
      if (ratio <= 0) throw new Error('ratio must be positive')
      converted = logFactor * Math.log10(ratio)
      break
    case ConvertUnit.Ratio:
      converted = ratio
      break
  }
  return new Complex(converted, 0)
}