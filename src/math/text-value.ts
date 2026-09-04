/**
 * Text ↔ value codec — the pure core behind parse_value / format_value.
 *
 * Parsing turns a text quantity ("100 mF", "1+2j Ω", "3 ∠ 0.5", "25 °C")
 * into the canonical value payload (SI base units) plus the resolved kind;
 * formatting renders a payload back to text with an optional engineering
 * prefix. The codec understands the SI prefixes p/n/µ/m/k/M/G/T and the
 * electrical core units, angles (°/rad) and temperatures (°C/°F/K).
 *
 * This is a math-layer module: it throws plain errors and knows nothing
 * about tools.
 */
import { QuantityKind } from './quantity-kind.ts'
import type { ValuePayload } from './convert.ts'

/** Number literal used inside the parse regexes (sign, decimals, exponent). */
const NUM = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?'

/** SI prefixes (symbol → multiplier). µ and u are both accepted. */
const PREFIX_SCALE: Readonly<Record<string, number>> = {
  p: 1e-12,
  n: 1e-9,
  µ: 1e-6,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
}
const PREFIX_SYMBOLS = 'pnuµmkMGT'
/** Engineering prefix per decade exponent (3·i, clamped). */
const ENGINEERING: ReadonlyArray<{ prefix: string; scale: number }> = [
  { prefix: 'p', scale: 1e-12 },
  { prefix: 'n', scale: 1e-9 },
  { prefix: 'µ', scale: 1e-6 },
  { prefix: 'm', scale: 1e-3 },
  { prefix: '', scale: 1 },
  { prefix: 'k', scale: 1e3 },
  { prefix: 'M', scale: 1e6 },
  { prefix: 'G', scale: 1e9 },
  { prefix: 'T', scale: 1e12 },
]

/** One known unit token: kind, canonical SI symbol, multiplier, prefixable. */
interface UnitInfo {
  kind: QuantityKind
  /** Canonical SI symbol reported on parse (temperatures/angles normalize). */
  symbol: string
  /** Scale applied to the numeric part (prefix scale multiplies on top). */
  factor: number
  /** °C / °F apply an additive offset after scaling. */
  offset?: number
  prefixable: boolean
}

/** Unit tokens → info (longest tokens first for the regex alternation). */
const UNIT_TOKENS: ReadonlyArray<{ token: string; info: UnitInfo }> = [
  { token: '°C', info: { kind: QuantityKind.Temperature, symbol: 'K', factor: 1, offset: 273.15, prefixable: false } },
  { token: '°F', info: { kind: QuantityKind.Temperature, symbol: 'K', factor: 5 / 9, offset: (459.67 * 5) / 9, prefixable: false } },
  { token: 'Hz', info: { kind: QuantityKind.Frequency, symbol: 'Hz', factor: 1, prefixable: true } },
  { token: 'ohm', info: { kind: QuantityKind.Resistance, symbol: 'Ω', factor: 1, prefixable: true } },
  { token: 'Ω', info: { kind: QuantityKind.Resistance, symbol: 'Ω', factor: 1, prefixable: true } },
  { token: 'rad', info: { kind: QuantityKind.Angle, symbol: 'rad', factor: 1, prefixable: false } },
  { token: 'dB', info: { kind: QuantityKind.Log, symbol: 'dB', factor: 1, prefixable: false } },
  { token: 'deg', info: { kind: QuantityKind.Angle, symbol: 'rad', factor: Math.PI / 180, prefixable: false } },
  { token: '°', info: { kind: QuantityKind.Angle, symbol: 'rad', factor: Math.PI / 180, prefixable: false } },
  { token: 'K', info: { kind: QuantityKind.Temperature, symbol: 'K', factor: 1, prefixable: false } },
  { token: 'F', info: { kind: QuantityKind.Capacitance, symbol: 'F', factor: 1, prefixable: true } },
  { token: 'H', info: { kind: QuantityKind.Inductance, symbol: 'H', factor: 1, prefixable: true } },
  { token: 'V', info: { kind: QuantityKind.Voltage, symbol: 'V', factor: 1, prefixable: true } },
  { token: 'A', info: { kind: QuantityKind.Current, symbol: 'A', factor: 1, prefixable: true } },
  { token: 'W', info: { kind: QuantityKind.Power, symbol: 'W', factor: 1, prefixable: true } },
  { token: 's', info: { kind: QuantityKind.Time, symbol: 's', factor: 1, prefixable: true } },
]

const UNIT_ALTERNATION = UNIT_TOKENS.map((entry) => entry.token).join('|')
/** Matches an optional prefix followed by a known unit, e.g. "mF", "kΩ", "°C". */
const SUFFIX = `(?:(?:([${PREFIX_SYMBOLS}]))?(${UNIT_ALTERNATION}))?`

/** The full number+suffix pattern for real values. */
const REAL_PATTERN = new RegExp(`^(${NUM})\\s*${SUFFIX}$`)

/** The pattern for a trailing-j complex value ("2j", "-3j"). */
const J_ONLY_PATTERN = new RegExp(`^(${NUM})\\s*j\\s*${SUFFIX}$`)

/** The pattern for "re ± im j" complex values (operator required). */
const RECT_PATTERN = new RegExp(`^(${NUM})\\s*([+-])\\s*(${NUM})\\s*j\\s*${SUFFIX}$`)

/** The pattern for "mag ∠ ang [°|rad] [unit]" polar values. */
const POLAR_PATTERN = new RegExp(`^(${NUM})\\s*∠\\s*(${NUM})\\s*(°|deg|rad)?\\s*${SUFFIX}$`)

/** Resolve an optional suffix match into {scale, info} or throw on an unknown token. */
function resolveSuffix(prefixMatch: string | undefined, unitMatch: string | undefined): { scale: number; info?: UnitInfo } {
  if (unitMatch === undefined) return { scale: 1 }
  const entry = UNIT_TOKENS.find((item) => item.token === unitMatch)
  if (entry === undefined) throw new Error(`unknown unit "${unitMatch}" — supported: Hz, Ω/ohm, F, H, V, A, W, s, rad, °/deg, dB, K, °C, °F`)
  const info = entry.info
  let scale = 1
  if (prefixMatch !== undefined) {
    if (!info.prefixable) throw new Error(`prefix "${prefixMatch}" is not allowed before "${unitMatch}"`)
    const multiplier = PREFIX_SCALE[prefixMatch]
    if (multiplier === undefined) throw new Error(`unknown prefix "${prefixMatch}"`)
    scale = multiplier
  }
  return { scale, info }
}

/** Parse one real magnitude (with suffix) into an SI number + kind; undefined = no match. */
function parseReal(match: RegExpMatchArray): { value: number; info?: UnitInfo; prefix: string | null } | undefined {
  const raw = match[1]
  if (raw === undefined) return undefined
  const { scale, info } = resolveSuffix(match[2], match[3])
  const base = Number(raw)
  // The prefix scale and the unit factor (e.g. ° → π/180) multiply together.
  const scaled = base * scale * (info?.factor ?? 1)
  const value = info?.offset === undefined ? scaled : scaled + info.offset
  return { value, info, prefix: match[2] === undefined ? null : match[2] }
}

/** The parsed outcome: canonical value payload plus the resolved kind. */
export interface ParsedValueText {
  value: ValuePayload
  kind: QuantityKind
  /** Canonical SI unit symbol ('' for a bare number). */
  unit: string
  /** The prefix symbol used, or null. */
  prefix: string | null
}

function outcome(value: ValuePayload, info: UnitInfo | undefined, prefix: string | null): ParsedValueText {
  return { value, kind: info?.kind ?? QuantityKind.None, unit: info?.symbol ?? '', prefix }
}

/** Parse one text quantity into the canonical value payload (SI base units). */
export function parseValueText(text: string): ParsedValueText {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('value text is empty')
  const polar = trimmed.match(POLAR_PATTERN)
  if (polar !== null) {
    const mag = Number(polar[1])
    const angleRaw = Number(polar[2])
    const angleToken = polar[3]
    const { scale, info } = resolveSuffix(polar[4], polar[5])
    const ang = angleToken === '°' || angleToken === 'deg' ? (angleRaw * Math.PI) / 180 : angleRaw
    return outcome({ mag: mag * scale * (info?.factor ?? 1), ang }, info, polar[4] === undefined ? null : polar[4])
  }
  const rect = trimmed.match(RECT_PATTERN)
  if (rect !== null) {
    const re = Number(rect[1])
    const im = Number(rect[3]) * (rect[2] === '-' ? -1 : 1)
    const { scale, info } = resolveSuffix(rect[4], rect[5])
    if (info !== undefined && info.offset !== undefined) throw new Error('a temperature unit cannot follow a complex value')
    const multiplier = scale * (info?.factor ?? 1)
    return outcome({ re: re * multiplier, im: im * multiplier }, info, rect[4] === undefined ? null : rect[4])
  }
  const jOnly = trimmed.match(J_ONLY_PATTERN)
  if (jOnly !== null) {
    const im = Number(jOnly[1])
    const { scale, info } = resolveSuffix(jOnly[2], jOnly[3])
    if (info !== undefined && info.offset !== undefined) throw new Error('a temperature unit cannot follow a complex value')
    return outcome({ re: 0, im: im * scale * (info?.factor ?? 1) }, info, jOnly[2] === undefined ? null : jOnly[2])
  }
  const real = trimmed.match(REAL_PATTERN)
  if (real !== null) {
    const parsed = parseReal(real)
    if (parsed !== undefined) return outcome(parsed.value, parsed.info, parsed.prefix)
  }
  throw new Error(`unrecognized value text "${trimmed}" — expected forms like 100 mF, 1+2j, 3 ∠ 0.5, 25 °C`)
}

/** One batch item of {@link parseValueTexts}: parsed, or rejected with the reason. */
export type ParsedTextItem =
  | ({ ok: true; text: string } & ParsedValueText)
  | { ok: false; text: string; error: string }

/**
 * Parse a list of text quantities, item by item, tolerating failures: each
 * item is either the parsed outcome (ok) or a per-item error (ok: false with
 * the reason), so one bad string never discards the good conversions.
 */
export function parseValueTexts(texts: readonly string[]): ParsedTextItem[] {
  return texts.map((text) => {
    try {
      const parsed = parseValueText(text)
      return { ok: true, text, ...parsed }
    } catch (error) {
      return { ok: false, text, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** SI symbol per kind ('' for kinds without one). */
const KIND_SYMBOL: Readonly<Record<QuantityKind, string>> = {
  [QuantityKind.Time]: 's',
  [QuantityKind.Length]: 'm',
  [QuantityKind.Mass]: 'kg',
  [QuantityKind.Current]: 'A',
  [QuantityKind.Temperature]: 'K',
  [QuantityKind.AmountOfSubstance]: 'mol',
  [QuantityKind.LuminousIntensity]: 'cd',
  [QuantityKind.Frequency]: 'Hz',
  [QuantityKind.Resistance]: 'Ω',
  [QuantityKind.Capacitance]: 'F',
  [QuantityKind.Inductance]: 'H',
  [QuantityKind.Voltage]: 'V',
  [QuantityKind.Power]: 'W',
  [QuantityKind.Angle]: 'rad',
  [QuantityKind.Pressure]: 'Pa',
  [QuantityKind.Energy]: 'J',
  [QuantityKind.Log]: 'dB',
  [QuantityKind.None]: '',
}

/** Kinds whose symbol takes an engineering prefix. */
const PREFIXABLE_KINDS: ReadonlySet<QuantityKind> = new Set([
  QuantityKind.Time,
  QuantityKind.Frequency,
  QuantityKind.Resistance,
  QuantityKind.Capacitance,
  QuantityKind.Inductance,
  QuantityKind.Voltage,
  QuantityKind.Current,
  QuantityKind.Power,
])

/** Format one real number compactly (up to 6 significant digits, no exponent for sane ranges). */
function fmtNumber(x: number): string {
  if (Object.is(x, -0)) x = 0
  const abs = Math.abs(x)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-12)) return String(x)
  return String(Number(x.toPrecision(6)))
}

export type PrefixMode = 'auto' | 'none' | 'p' | 'n' | 'µ' | 'm' | 'k' | 'M' | 'G' | 'T'

/** Resolve the prefix policy to {symbol, scale} for one magnitude. */
function resolvePrefix(mode: PrefixMode, magnitude: number, kind: QuantityKind): { symbol: string; scale: number } {
  if (mode === 'none' || !PREFIXABLE_KINDS.has(kind)) return { symbol: '', scale: 1 }
  if (mode !== 'auto') {
    const scale = PREFIX_SCALE[mode]
    if (scale === undefined) throw new Error(`unknown prefix "${mode}"`)
    return { symbol: mode, scale }
  }
  if (magnitude === 0) return { symbol: '', scale: 1 }
  const decade = Math.floor(Math.log10(magnitude) / 3)
  const index = Math.max(0, Math.min(ENGINEERING.length - 1, decade + 4))
  const entry = ENGINEERING[index]!
  return { symbol: entry.prefix, scale: entry.scale }
}

/** Render a value payload as text; kind selects the unit suffix, prefix the scale policy. */
export function formatValueText(value: ValuePayload, kind: QuantityKind = QuantityKind.None, prefix: PrefixMode = 'auto'): string {
  const symbol = KIND_SYMBOL[kind] ?? ''
  const withUnit = (body: string): string => (symbol.length === 0 ? body : `${body} ${symbol}`)
  const isPolar = typeof value === 'object' && value !== null && 'mag' in value
  if (isPolar) {
    const { mag, ang } = value as { mag: number; ang: number }
    const resolved = resolvePrefix(prefix, Math.abs(mag), kind)
    const scaled = mag / resolved.scale
    const number = fmtNumber(scaled)
    const angText = fmtNumber(ang)
    return withUnit(`${number}${resolved.symbol} ∠ ${angText} rad`)
  }
  let magnitude: number
  let body: string
  if (typeof value === 'number') {
    magnitude = Math.abs(value)
    body = fmtNumber(value)
  } else {
    const { re, im } = value as { re: number; im: number }
    magnitude = Math.hypot(re, im)
    if (re === 0 && im === 0) body = '0'
    else if (re === 0) body = `${fmtNumber(im)}j`
    else if (im === 0) body = fmtNumber(re)
    else body = im < 0 ? `${fmtNumber(re)} - ${fmtNumber(-im)}j` : `${fmtNumber(re)} + ${fmtNumber(im)}j`
  }
  // Real numbers take the prefix on the magnitude; complex bodies print the
  // prefix per component when it is not auto (auto keeps complex components
  // plain — component prefixes would be ambiguous).
  if (typeof value === 'number') {
    const resolved = resolvePrefix(prefix, magnitude, kind)
    const scaled = value / resolved.scale
    const number = fmtNumber(scaled)
    if (resolved.symbol === '') return withUnit(number)
    return `${number} ${resolved.symbol}${symbol}`
  }
  if (prefix === 'none' || !PREFIXABLE_KINDS.has(kind)) return withUnit(body)
  return withUnit(body)
}
