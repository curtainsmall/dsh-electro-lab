/**
 * Unit system: base units as a string enum (full English member names),
 * SI prefixes as a numeric enum (the member value IS the factor), and the
 * per-Unit tables that combine them. Strings only survive at the parse
 * boundary (LLM input tokens); everywhere else code refers to the enums.
 */

/** Base units — the member VALUE is the unit symbol used at display time. */
export enum BaseUnit {
  Hertz = 'Hz',
  Ohm = 'Ω',
  Farad = 'F',
  Henry = 'H',
  Volt = 'V',
  Ampere = 'A',
  Watt = 'W',
  VoltAmpere = 'VA',
  VoltAmpereReactive = 'VAR',
  Second = 's',
  Dimensionless = '',
  Degree = '°',
  Decibel = 'dB',
}

/** SI prefixes — the member VALUE is the multiplication factor. */
export enum Prefix {
  Pico = 1e-12,
  Nano = 1e-9,
  Micro = 1e-6,
  Milli = 1e-3,
  Kilo = 1e3,
  Mega = 1e6,
  Giga = 1e9,
  Tera = 1e12,
}

/** The physical category a base unit belongs to (drives prefix table + zero threshold). */
export enum Unit {
  Frequency = 'frequency',
  Resistance = 'resistance',
  Capacitance = 'capacitance',
  Inductance = 'inductance',
  Voltage = 'voltage',
  Current = 'current',
  Power = 'power',
  Time = 'time',
  Dimensionless = 'dimensionless',
  Angle = 'angle',
  Log = 'log',
}

/** Explicit unit → Unit mapping (derived units like VA/VAR share the Power unit). */
export const UNIT_BY_BASE: Record<BaseUnit, Unit> = {
  [BaseUnit.Hertz]: Unit.Frequency,
  [BaseUnit.Ohm]: Unit.Resistance,
  [BaseUnit.Farad]: Unit.Capacitance,
  [BaseUnit.Henry]: Unit.Inductance,
  [BaseUnit.Volt]: Unit.Voltage,
  [BaseUnit.Ampere]: Unit.Current,
  [BaseUnit.Watt]: Unit.Power,
  [BaseUnit.VoltAmpere]: Unit.Power,
  [BaseUnit.VoltAmpereReactive]: Unit.Power,
  [BaseUnit.Second]: Unit.Time,
  [BaseUnit.Dimensionless]: Unit.Dimensionless,
  [BaseUnit.Degree]: Unit.Angle,
  [BaseUnit.Decibel]: Unit.Log,
}

export interface UnitDef {
  /** Base unit used for all computation. */
  base: BaseUnit
  /** Prefixes applicable to this Unit (factor = Prefix member value). */
  prefixes: Prefix[]
  /** Below this absolute value (in base units) the quantity is treated as zero. */
  zeroThreshold: number
  /** Alternative spellings of the base unit (lowercase keys). */
  aliases?: Record<string, BaseUnit>
}

export const UNIT_DEFS: Record<Unit, UnitDef> = {
  [Unit.Frequency]: {
    base: BaseUnit.Hertz,
    prefixes: [Prefix.Pico, Prefix.Nano, Prefix.Micro, Prefix.Milli, Prefix.Kilo, Prefix.Mega, Prefix.Giga],
    zeroThreshold: 1e-3,
  },
  [Unit.Resistance]: {
    base: BaseUnit.Ohm,
    prefixes: [Prefix.Milli, Prefix.Kilo, Prefix.Mega, Prefix.Giga],
    zeroThreshold: 1e-6,
    aliases: { Ohm: BaseUnit.Ohm, Ohms: BaseUnit.Ohm },
  },
  [Unit.Capacitance]: {
    base: BaseUnit.Farad,
    prefixes: [Prefix.Pico, Prefix.Nano, Prefix.Micro, Prefix.Milli],
    zeroThreshold: 1e-14,
  },
  [Unit.Inductance]: {
    base: BaseUnit.Henry,
    prefixes: [Prefix.Nano, Prefix.Micro, Prefix.Milli],
    zeroThreshold: 1e-12,
  },
  [Unit.Voltage]: {
    base: BaseUnit.Volt,
    prefixes: [Prefix.Nano, Prefix.Micro, Prefix.Milli, Prefix.Kilo, Prefix.Mega],
    zeroThreshold: 1e-9,
  },
  [Unit.Current]: {
    base: BaseUnit.Ampere,
    prefixes: [Prefix.Nano, Prefix.Micro, Prefix.Milli, Prefix.Kilo],
    zeroThreshold: 1e-12,
  },
  [Unit.Power]: {
    base: BaseUnit.Watt,
    prefixes: [Prefix.Nano, Prefix.Micro, Prefix.Milli, Prefix.Kilo, Prefix.Mega],
    zeroThreshold: 1e-12,
  },
  [Unit.Time]: {
    base: BaseUnit.Second,
    prefixes: [Prefix.Nano, Prefix.Micro, Prefix.Milli],
    zeroThreshold: 1e-12,
  },
  [Unit.Dimensionless]: {
    base: BaseUnit.Dimensionless,
    prefixes: [],
    zeroThreshold: 1e-12,
  },
  [Unit.Angle]: {
    base: BaseUnit.Degree,
    prefixes: [],
    zeroThreshold: 1e-9,
  },
  [Unit.Log]: {
    base: BaseUnit.Decibel,
    prefixes: [],
    zeroThreshold: 0,
  },
}

/** Display symbol per prefix (ASCII 'u' for Micro; parse also accepts 'µ'). */
export const PREFIX_SYMBOL: Record<Prefix, string> = {
  [Prefix.Pico]: 'p',
  [Prefix.Nano]: 'n',
  [Prefix.Micro]: 'u',
  [Prefix.Milli]: 'm',
  [Prefix.Kilo]: 'k',
  [Prefix.Mega]: 'M',
  [Prefix.Giga]: 'G',
  [Prefix.Tera]: 'T',
}

/** Map a base-unit symbol or alias token (lowercased) to its Unit. */
const Unit_BY_BASE: Record<string, Unit> = Object.fromEntries(
  Object.entries(UNIT_DEFS).map(([Unit, def]) => [def.base.toLowerCase(), Unit as Unit]),
)

/** Map an alias token (lowercased) to its canonical base unit. */
const ALIAS_TO_BASE: Record<string, BaseUnit> = {}
for (const def of Object.values(UNIT_DEFS)) {
  for (const [alias, base] of Object.entries(def.aliases ?? {})) {
    ALIAS_TO_BASE[alias.toLowerCase()] = base
  }
}

/** Parse tokens: symbol (and 'µ') → Prefix. */
const PREFIX_BY_SYMBOL: Record<string, Prefix> = {
  p: Prefix.Pico,
  n: Prefix.Nano,
  u: Prefix.Micro,
  'µ': Prefix.Micro,
  m: Prefix.Milli,
  k: Prefix.Kilo,
  M: Prefix.Mega,
  G: Prefix.Giga,
  T: Prefix.Tera,
}

/** Prefix symbols sorted longest-first for greedy matching. */
const PREFIX_SYMBOLS = Object.keys(PREFIX_BY_SYMBOL).sort((a, b) => b.length - a.length)

/** Find a Unit from a base-unit symbol or alias token (string, at the parse boundary). */
export function unitFromToken(token: string): Unit | undefined {
  const key = token.toLowerCase()
  const base = ALIAS_TO_BASE[key] ?? key
  return Unit_BY_BASE[base.toLowerCase()]
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
      if (base !== undefined || Unit_BY_BASE[baseToken.toLowerCase()] !== undefined) {
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
  if (Unit_BY_BASE[lower] !== undefined) {
    const baseUnit = Object.values(BaseUnit).find((u) => u.toLowerCase() === lower)
    return { prefix: undefined, factor: 1, baseUnit }
  }
  // Bare prefix without a base unit: "1k" means 1 Kilo of the caller's Unit.
  const bare = PREFIX_BY_SYMBOL[token]
  if (bare !== undefined) return { prefix: bare, factor: bare, baseUnit: undefined }
  return undefined
}

/** Pure relative tolerance comparison (no absolute floor). Zero matches zero exactly. */
export function nearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  if (a === 0 && b === 0) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale === 0) return a === b
  return Math.abs(a - b) <= tol * scale
}

/** Unit-aware zero check: absolute threshold per Unit. */
export function isNegligible(value: number, unit: Unit): boolean {
  if (unit === Unit.Dimensionless) return Math.abs(value) <= UNIT_DEFS[unit].zeroThreshold
  return Math.abs(value) < UNIT_DEFS[unit].zeroThreshold
}
