/**
 * Unit system: base units as a string enum (full English member names),
 * SI prefixes as a numeric enum (the member value IS the factor), and the
 * per-family tables that combine them. Strings only survive at the parse
 * boundary (LLM input tokens); everywhere else code refers to the enums.
 */

/** Base units — the member VALUE is the unit symbol used at display time. */
export enum BaseUnit {
  HERTZ = 'Hz',
  OHM = 'Ω',
  FARAD = 'F',
  HENRY = 'H',
  VOLT = 'V',
  AMPERE = 'A',
  WATT = 'W',
  VOLT_AMPERE = 'VA',
  VOLT_AMPERE_REACTIVE = 'VAR',
  SECOND = 's',
  DIMENSIONLESS = '',
  DEGREE = '°',
  DECIBEL = 'dB',
}

/** SI prefixes — the member VALUE is the multiplication factor. */
export enum Prefix {
  PICO = 1e-12,
  NANO = 1e-9,
  MICRO = 1e-6,
  MILLI = 1e-3,
  KILO = 1e3,
  MEGA = 1e6,
  GIGA = 1e9,
  TERA = 1e12,
}

/** The physical category a base unit belongs to (drives prefix table + zero threshold). */
export enum UnitFamily {
  FREQUENCY = 'frequency',
  RESISTANCE = 'resistance',
  CAPACITANCE = 'capacitance',
  INDUCTANCE = 'inductance',
  VOLTAGE = 'voltage',
  CURRENT = 'current',
  POWER = 'power',
  TIME = 'time',
  DIMENSIONLESS = 'dimensionless',
  ANGLE = 'angle',
  LOG = 'log',
}

/** Explicit unit → family mapping (derived units like VA/VAR share the power family). */
export const FAMILY_OF_UNIT: Record<BaseUnit, UnitFamily> = {
  [BaseUnit.HERTZ]: UnitFamily.FREQUENCY,
  [BaseUnit.OHM]: UnitFamily.RESISTANCE,
  [BaseUnit.FARAD]: UnitFamily.CAPACITANCE,
  [BaseUnit.HENRY]: UnitFamily.INDUCTANCE,
  [BaseUnit.VOLT]: UnitFamily.VOLTAGE,
  [BaseUnit.AMPERE]: UnitFamily.CURRENT,
  [BaseUnit.WATT]: UnitFamily.POWER,
  [BaseUnit.VOLT_AMPERE]: UnitFamily.POWER,
  [BaseUnit.VOLT_AMPERE_REACTIVE]: UnitFamily.POWER,
  [BaseUnit.SECOND]: UnitFamily.TIME,
  [BaseUnit.DIMENSIONLESS]: UnitFamily.DIMENSIONLESS,
  [BaseUnit.DEGREE]: UnitFamily.ANGLE,
  [BaseUnit.DECIBEL]: UnitFamily.LOG,
}

export interface FamilyDef {
  /** Base unit used for all computation. */
  base: BaseUnit
  /** Prefixes applicable to this family (factor = Prefix member value). */
  prefixes: Prefix[]
  /** Below this absolute value (in base units) the quantity is treated as zero. */
  zeroThreshold: number
  /** Alternative spellings of the base unit (lowercase keys). */
  aliases?: Record<string, BaseUnit>
}

export const UNIT_FAMILIES: Record<UnitFamily, FamilyDef> = {
  [UnitFamily.FREQUENCY]: {
    base: BaseUnit.HERTZ,
    prefixes: [Prefix.PICO, Prefix.NANO, Prefix.MICRO, Prefix.MILLI, Prefix.KILO, Prefix.MEGA, Prefix.GIGA],
    zeroThreshold: 1e-3,
  },
  [UnitFamily.RESISTANCE]: {
    base: BaseUnit.OHM,
    prefixes: [Prefix.MILLI, Prefix.KILO, Prefix.MEGA, Prefix.GIGA],
    zeroThreshold: 1e-6,
    aliases: { ohm: BaseUnit.OHM, ohms: BaseUnit.OHM },
  },
  [UnitFamily.CAPACITANCE]: {
    base: BaseUnit.FARAD,
    prefixes: [Prefix.PICO, Prefix.NANO, Prefix.MICRO, Prefix.MILLI],
    zeroThreshold: 1e-14,
  },
  [UnitFamily.INDUCTANCE]: {
    base: BaseUnit.HENRY,
    prefixes: [Prefix.NANO, Prefix.MICRO, Prefix.MILLI],
    zeroThreshold: 1e-12,
  },
  [UnitFamily.VOLTAGE]: {
    base: BaseUnit.VOLT,
    prefixes: [Prefix.NANO, Prefix.MICRO, Prefix.MILLI, Prefix.KILO, Prefix.MEGA],
    zeroThreshold: 1e-9,
  },
  [UnitFamily.CURRENT]: {
    base: BaseUnit.AMPERE,
    prefixes: [Prefix.NANO, Prefix.MICRO, Prefix.MILLI, Prefix.KILO],
    zeroThreshold: 1e-12,
  },
  [UnitFamily.POWER]: {
    base: BaseUnit.WATT,
    prefixes: [Prefix.NANO, Prefix.MICRO, Prefix.MILLI, Prefix.KILO, Prefix.MEGA],
    zeroThreshold: 1e-12,
  },
  [UnitFamily.TIME]: {
    base: BaseUnit.SECOND,
    prefixes: [Prefix.NANO, Prefix.MICRO, Prefix.MILLI],
    zeroThreshold: 1e-12,
  },
  [UnitFamily.DIMENSIONLESS]: {
    base: BaseUnit.DIMENSIONLESS,
    prefixes: [],
    zeroThreshold: 1e-12,
  },
  [UnitFamily.ANGLE]: {
    base: BaseUnit.DEGREE,
    prefixes: [],
    zeroThreshold: 1e-9,
  },
  [UnitFamily.LOG]: {
    base: BaseUnit.DECIBEL,
    prefixes: [],
    zeroThreshold: 0,
  },
}

/** Display symbol per prefix (ASCII 'u' for micro; parse also accepts 'µ'). */
export const PREFIX_SYMBOL: Record<Prefix, string> = {
  [Prefix.PICO]: 'p',
  [Prefix.NANO]: 'n',
  [Prefix.MICRO]: 'u',
  [Prefix.MILLI]: 'm',
  [Prefix.KILO]: 'k',
  [Prefix.MEGA]: 'M',
  [Prefix.GIGA]: 'G',
  [Prefix.TERA]: 'T',
}

/** Map a base-unit symbol or alias token (lowercased) to its family. */
const FAMILY_BY_BASE: Record<string, UnitFamily> = Object.fromEntries(
  Object.entries(UNIT_FAMILIES).map(([family, def]) => [def.base.toLowerCase(), family as UnitFamily]),
)

/** Map an alias token (lowercased) to its canonical base unit. */
const ALIAS_TO_BASE: Record<string, BaseUnit> = {}
for (const def of Object.values(UNIT_FAMILIES)) {
  for (const [alias, base] of Object.entries(def.aliases ?? {})) {
    ALIAS_TO_BASE[alias.toLowerCase()] = base
  }
}

/** Parse tokens: symbol (and 'µ') → Prefix. */
const PREFIX_BY_SYMBOL: Record<string, Prefix> = {
  p: Prefix.PICO,
  n: Prefix.NANO,
  u: Prefix.MICRO,
  'µ': Prefix.MICRO,
  m: Prefix.MILLI,
  k: Prefix.KILO,
  M: Prefix.MEGA,
  G: Prefix.GIGA,
  T: Prefix.TERA,
}

/** Prefix symbols sorted longest-first for greedy matching. */
const PREFIX_SYMBOLS = Object.keys(PREFIX_BY_SYMBOL).sort((a, b) => b.length - a.length)

/** Find a family from a base-unit symbol or alias token (string, at the parse boundary). */
export function familyFromToken(token: string): UnitFamily | undefined {
  const key = token.toLowerCase()
  const base = ALIAS_TO_BASE[key] ?? key
  return FAMILY_BY_BASE[base.toLowerCase()]
}

export interface SplitUnit {
  prefix: Prefix | undefined
  factor: number
  baseUnit: BaseUnit | undefined
}

/** Split a unit token like "kHz" into { prefix, factor, baseUnit }. */
export function splitUnitToken(token: string): SplitUnit | undefined {
  if (token === '') return { prefix: undefined, factor: 1, baseUnit: undefined }
  for (const symbol of PREFIX_SYMBOLS) {
    if (token.startsWith(symbol) && token.length > symbol.length) {
      const baseToken = token.slice(symbol.length)
      const base = ALIAS_TO_BASE[baseToken.toLowerCase()]
      if (base !== undefined || FAMILY_BY_BASE[baseToken.toLowerCase()] !== undefined) {
        const prefix = PREFIX_BY_SYMBOL[symbol]
        if (prefix === undefined) continue
        const baseUnit =
          base ?? Object.values(BaseUnit).find((u) => u.toLowerCase() === baseToken.toLowerCase())
        return { prefix, factor: prefix, baseUnit }
      }
    }
  }
  const lower = token.toLowerCase()
  const base = ALIAS_TO_BASE[lower]
  if (base !== undefined) return { prefix: undefined, factor: 1, baseUnit: base }
  if (FAMILY_BY_BASE[lower] !== undefined) {
    const baseUnit = Object.values(BaseUnit).find((u) => u.toLowerCase() === lower)
    return { prefix: undefined, factor: 1, baseUnit }
  }
  // Bare prefix without a base unit: "1k" means 1 kilo of the caller's family.
  const bare = PREFIX_BY_SYMBOL[token]
  if (bare !== undefined) return { prefix: bare, factor: bare, baseUnit: undefined }
  return undefined
}

/**
 * Engineering formatting: choose the largest prefix so the mantissa sits in
 * [1, 1000), round to `digits` significant figures, strip trailing zeros.
 * Returns e.g. "2.4 k" (unit appended by the caller), "1.5 n", "150 m".
 */
export function engineeringFormat(value: number, family: UnitFamily, digits = 4): string {
  const def = UNIT_FAMILIES[family]
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  let symbol = ''
  let factor = 0
  for (const prefix of def.prefixes) {
    if (abs / prefix >= 1 && prefix > factor) {
      symbol = PREFIX_SYMBOL[prefix] ?? ''
      factor = prefix
    }
  }
  const mantissa = value / (factor === 0 ? 1 : factor)
  const rounded = Number(mantissa.toPrecision(digits)).toString()
  return symbol === '' ? rounded : `${rounded} ${symbol}`
}

/** Pure relative tolerance comparison (no absolute floor). Zero matches zero exactly. */
export function nearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  if (a === 0 && b === 0) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale === 0) return a === b
  return Math.abs(a - b) <= tol * scale
}

/** Unit-aware zero check: absolute threshold per family. */
export function isNegligible(value: number, family: UnitFamily): boolean {
  if (family === UnitFamily.DIMENSIONLESS) return Math.abs(value) <= UNIT_FAMILIES[family].zeroThreshold
  return Math.abs(value) < UNIT_FAMILIES[family].zeroThreshold
}
