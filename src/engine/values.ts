/**
 * Value universe (engine value universe).
 *
 * Typed values: {type, value, kind, variant?, prefix?}. kind is part of a
 * quantity type; a missing variant/prefix field means the base representation / multiplier of 1;
 * vocabularies are always ASCII short words; symbols serve display mapping only. Declaration specs
 * (parameters/returns isomorphic, closed) and typed values share the validation
 * and conversion here.
 */
import { QuantityKind, QUANTITY_KIND_NAMES } from '../math/quantity-kind.ts'

export type Kind = QuantityKind

/** Writable typed value (number/complex carry a kind; string/boolean/array/object carry none). */
export type TypedValue =
  | { type: 'number'; value: number; kind: Kind; variant?: string; prefix?: string }
  | { type: 'complex'; value: { re: number; im: number } | { mag: number; ang: number }; kind: Kind; variant?: string; prefix?: string }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'array'; value: TypedValue[] }
  | { type: 'object'; value: Record<string, TypedValue> }

/**
 * A slot reference: a first-class call-argument value that names a slot by
 * its full path ("R" or "res.points.0"). It is NOT part of TypedValue — it
 * never enters the variable table, storage or external results; the engine
 * expands it at the call boundary before spec validation.
 */
export interface SlotValue {
  type: 'slot'
  value: string
}

/** Shape guard for slot references (call arguments only). */
export function isSlotValue(raw: unknown): raw is SlotValue {
  return typeof raw === 'object' && raw !== null && (raw as { type?: unknown }).type === 'slot'
    && typeof (raw as { value?: unknown }).value === 'string'
}

/** Declaration spec: quantity carries kind (with form), string (optional enum), boolean, array/object recursively closed. */
export type Spec =
  | { type: 'quantity'; kind: Kind; form?: 're-im' | 'mag-ang' | 'either' }
  | { type: 'string'; enum?: readonly string[] }
  | { type: 'boolean' }
  | { type: 'array'; items: Spec }
  | { type: 'object'; fields: Record<string, Spec> }

/** Solver parameter entry: spec + optional flag (returns object fields use plain Spec). */
export type ParamSpec = Spec & { optional?: boolean }

export type Parameters = Record<string, ParamSpec>

/* ── prefix word table (all-lowercase English words; symbols are display-only) ── */

export const PREFIX_SCALES: Readonly<Record<string, number>> = {
  pico: 1e-12,
  nano: 1e-9,
  micro: 1e-6,
  milli: 1e-3,
  kilo: 1e3,
  mega: 1e6,
  giga: 1e9,
  tera: 1e12,
}

/** Display symbol mapping (not part of the value universe; display only). */
export const PREFIX_SYMBOLS: Readonly<Record<string, string>> = {
  pico: 'p', nano: 'n', micro: 'µ', milli: 'm', kilo: 'k', mega: 'M', giga: 'G', tera: 'T',
}

/* ── variant word table (unique within a kind, names may repeat across kinds) ── */

/** A variant: value conversion relative to the SI base (factor multiply + offset add). */
export interface VariantInfo {
  factor: number
  offset: number
}

/** kind → variant word → conversion. No table = base representation only (variant keys must not appear). */
export const VARIANT_TABLE: Readonly<Partial<Record<Kind, Readonly<Record<string, VariantInfo>>>>> = {
  [QuantityKind.Temperature]: {
    degC: { factor: 1, offset: 273.15 },
    degF: { factor: 5 / 9, offset: (459.67 * 5) / 9 },
  },
  [QuantityKind.Angle]: {
    deg: { factor: Math.PI / 180, offset: 0 },
  },
  [QuantityKind.Pressure]: {
    bar: { factor: 1e5, offset: 0 },
    psi: { factor: 6894.757293168, offset: 0 },
    atm: { factor: 101325, offset: 0 },
  },
  [QuantityKind.Energy]: {
    cal: { factor: 4.184, offset: 0 },
    Wh: { factor: 3600, offset: 0 },
  },
  [QuantityKind.Power]: {
    hp: { factor: 745.69987158227022, offset: 0 },
  },
  [QuantityKind.Length]: {
    inch: { factor: 0.0254, offset: 0 },
    foot: { factor: 0.3048, offset: 0 },
    yard: { factor: 0.9144, offset: 0 },
    mile: { factor: 1609.344, offset: 0 },
  },
  [QuantityKind.Mass]: {
    lb: { factor: 0.45359237, offset: 0 },
    oz: { factor: 0.028349523125, offset: 0 },
  },
}

/** Check whether a kind word is valid. */
export function isKind(value: string): value is Kind {
  return QUANTITY_KIND_NAMES.includes(value)
}

/**
 * Validate a typed value (shape/word-table checks at set-input time). Pass returns void;
 * failure returns a human-readable error message. Values are validated by shape and word table only, with no cross-kind judgement.
 */
export function validateValue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'value must be a typed-value object'
  const v = value as Record<string, unknown>
  if (typeof v.type !== 'string') return 'typed value needs a type field'
  switch (v.type) {
    case 'number': {
      if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return 'number value must be a finite number'
      if (!isKind(String(v.kind))) return `unknown kind "${String(v.kind)}"`
      return checkPrefixVariant(v, true)
    }
    case 'complex': {
      const c = v.value as Record<string, unknown>
      const rect = typeof (c as { re?: unknown }).re === 'number' && typeof (c as { im?: unknown }).im === 'number'
      const polar = typeof (c as { mag?: unknown }).mag === 'number' && typeof (c as { ang?: unknown }).ang === 'number'
      if (!rect && !polar) return 'complex value must be {re, im} or {mag, ang} with numbers'
      if (rect && polar) return 'complex value must be exactly {re, im} or {mag, ang}'
      if (!isKind(String(v.kind))) return `unknown kind "${String(v.kind)}"`
      return checkPrefixVariant(v, false)
    }
    case 'string':
      if (typeof v.value !== 'string') return 'string value must be a string'
      return undefined
    case 'boolean':
      if (typeof v.value !== 'boolean') return 'boolean value must be a boolean'
      return undefined
    case 'array':
      if (!Array.isArray(v.value)) return 'array value must be an array'
      for (const item of v.value as unknown[]) {
        const error = validateValue(item)
        if (error !== undefined) return error
      }
      return undefined
    case 'object': {
      if (typeof v.value !== 'object' || v.value === null || Array.isArray(v.value)) return 'object value must be an object'
      for (const field of Object.values(v.value as Record<string, unknown>)) {
        const error = validateValue(field)
        if (error !== undefined) return error
      }
      return undefined
    }
    default:
      return `unknown type "${String(v.type)}" (number/complex/string/boolean/array/object)`
  }
}

/** prefix/variant combination check: prefix is valid only on the SI base representation (no variant); the variant word must be in the kind's word table. */
function checkPrefixVariant(v: Record<string, unknown>, allowComplex: boolean): string | undefined {
  const kind = v.kind as Kind
  const variant = v.variant
  if (variant !== undefined) {
    if (typeof variant !== 'string') return 'variant must be a string'
    const variants = VARIANT_TABLE[kind]
    if (variants === undefined || variants[variant] === undefined) return `variant "${variant}" is not supported for kind "${kind}"`
    if (!allowComplex) return 'variant is only supported on number values'
  }
  if (v.prefix !== undefined) {
    if (typeof v.prefix !== 'string') return 'prefix must be a string'
    if (PREFIX_SCALES[v.prefix] === undefined) return `unknown prefix "${String(v.prefix)}"`
    if (variant !== undefined) return 'prefix is only valid on the SI base representation (no variant)'
  }
  return undefined
}

/** Convert number/complex values to the SI base + rect normalization (call boundary). */
export function toCanonical(value: TypedValue): TypedValue {
  if (value.type === 'number') {
    let number = value.value
    if (value.prefix !== undefined) number *= PREFIX_SCALES[value.prefix]!
    if (value.variant !== undefined) {
      const info = VARIANT_TABLE[value.kind]![value.variant]!
      number = number * info.factor + info.offset
    }
    return { type: 'number', value: number, kind: value.kind }
  }
  if (value.type === 'complex') {
    let re: number
    let im: number
    if ('re' in value.value) {
      re = value.value.re
      im = value.value.im
    } else {
      re = value.value.mag * Math.cos(value.value.ang)
      im = value.value.mag * Math.sin(value.value.ang)
    }
    const scale = value.prefix !== undefined ? PREFIX_SCALES[value.prefix]! : 1
    return { type: 'complex', value: { re: re * scale, im: im * scale }, kind: value.kind }
  }
  return value
}

/** Convert a complex value into the form a declaration needs (re-im / mag-ang / either → re-im). */
export function toShape(value: { re: number; im: number }, form: 're-im' | 'mag-ang' | 'either' | undefined): { re: number; im: number } | { mag: number; ang: number } {
  if (form === 'mag-ang') {
    return { mag: Math.hypot(value.re, value.im), ang: Math.atan2(value.im, value.re) }
  }
  return value
}

/* ── spec matching and native conversion (declaration is the validator) ───── */

/** Validate that a typed value matches a declaration spec (quantity kinds must match; objects are closed). */
export function validateAgainstSpec(spec: Spec, value: TypedValue, path: string): string | undefined {
  switch (spec.type) {
    case 'quantity': {
      if (value.type !== 'number' && value.type !== 'complex') return `${path}: expected a quantity, got ${value.type}`
      if (value.kind !== spec.kind) return `${path}: expected kind ${spec.kind}, got ${value.kind}`
      return undefined
    }
    case 'string':
      if (value.type !== 'string') return `${path}: expected a string, got ${value.type}`
      if (spec.enum !== undefined && !spec.enum.includes(value.value)) return `${path}: expected one of ${spec.enum.join(', ')}, got "${value.value}"`
      return undefined
    case 'boolean':
      if (value.type !== 'boolean') return `${path}: expected a boolean, got ${value.type}`
      return undefined
    case 'array': {
      if (value.type !== 'array') return `${path}: expected an array, got ${value.type}`
      for (let i = 0; i < value.value.length; i++) {
        const error = validateAgainstSpec(spec.items, value.value[i]!, `${path}[${i}]`)
        if (error !== undefined) return error
      }
      return undefined
    }
    case 'object': {
      if (value.type !== 'object') return `${path}: expected an object, got ${value.type}`
      for (const key of Object.keys(value.value)) {
        const fieldSpec = spec.fields[key]
        if (fieldSpec === undefined) return `${path}: unexpected field "${key}"`
      }
      for (const [key, fieldSpec] of Object.entries(spec.fields)) {
        const field = value.value[key]
        if (field === undefined) return `${path}: missing field "${key}"`
        const error = validateAgainstSpec(fieldSpec, field, `${path}.${key}`)
        if (error !== undefined) return error
      }
      return undefined
    }
  }
}

/**
 * Convert kernel-native output (number / {re,im} / {mag,ang} / string / boolean / array / object)
 * into a typed value per its returns spec (result shaping). Structural mismatch throws.
 */
export function fromNative(spec: Spec, raw: unknown, path: string): TypedValue {
  switch (spec.type) {
    case 'quantity': {
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) throw new Error(`${path}: result is not a finite number`)
        return { type: 'number', value: raw, kind: spec.kind }
      }
      if (raw !== null && typeof raw === 'object') {
        const box = raw as Record<string, unknown>
        if (typeof box.re === 'number' && typeof box.im === 'number') return { type: 'complex', value: { re: box.re, im: box.im }, kind: spec.kind }
        if (typeof box.mag === 'number' && typeof box.ang === 'number') return { type: 'complex', value: { mag: box.mag, ang: box.ang }, kind: spec.kind }
      }
      throw new Error(`${path}: quantity result must be a number or {re, im} / {mag, ang}`)
    }
    case 'string':
      if (typeof raw !== 'string') throw new Error(`${path}: expected a string result`)
      return { type: 'string', value: raw }
    case 'boolean':
      if (typeof raw !== 'boolean') throw new Error(`${path}: expected a boolean result`)
      return { type: 'boolean', value: raw }
    case 'array': {
      if (!Array.isArray(raw)) throw new Error(`${path}: expected an array result`)
      return { type: 'array', value: raw.map((item, index) => fromNative(spec.items, item, `${path}[${index}]`)) }
    }
    case 'object': {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}: expected an object result`)
      const box = raw as Record<string, unknown>
      for (const key of Object.keys(box)) {
        if (spec.fields[key] === undefined) throw new Error(`${path}: unexpected field "${key}"`)
      }
      const fields: Record<string, TypedValue> = {}
      for (const [key, fieldSpec] of Object.entries(spec.fields)) {
        if (!(key in box)) throw new Error(`${path}: missing field "${key}"`)
        fields[key] = fromNative(fieldSpec, box[key], `${path}.${key}`)
      }
      return { type: 'object', value: fields }
    }
  }
}

/** Read a value out of a slot by dot path (path only walks object fields). */
export function refPath(value: TypedValue, path: string | undefined): TypedValue {
  if (path === undefined || path.length === 0) return value
  const segments = path.split('.')
  let current = value
  for (const segment of segments) {
    if (current.type !== 'object') throw new Error(`slot path "${path}" steps through a non-object value`)
    const next = current.value[segment]
    if (next === undefined) throw new Error(`slot path "${path}" has no field "${segment}"`)
    current = next
  }
  return current
}
