/**
 * Log mathematics: absolute level conversion (power/voltage references)
 * and ratio conversion. Voltage↔power conversion assumes a reference
 * impedance (default 50 Ω).
 */

/** Absolute level unit: the reference each value is measured against. */
export enum DbUnit {
  Power = 'watt',
  Dbm = 'dbm',
  Dbw = 'dbw',
  Voltage = 'volt',
  Dbu = 'dbu',
  DbuV = 'dbuv',
}

/** What a decibel ratio is taken over. */
export enum RatioKind {
  Power = 'power',
  Voltage = 'voltage',
}

/**
 * Convert an absolute level to every other level. `value` is in `unit`;
 * `impedance` is needed for voltage↔power conversions (default 50 Ω).
 * Returns all levels: watts, dBm, dBW, volts RMS, dBu (0.775 V) and dBµV.
 */
export function convertDbLevels(
  value: number,
  unit: DbUnit,
  impedance = 50,
): { watts: number; dbm: number; dbw: number; volts: number; dbu: number; dbuV: number } {
  if (impedance <= 0) throw new Error('impedance must be positive (Ω)')
  let watts: number
  switch (unit) {
    case DbUnit.Power:
      watts = value
      break
    case DbUnit.Dbm:
      watts = 10 ** (value / 10) * 1e-3
      break
    case DbUnit.Dbw:
      watts = 10 ** (value / 10)
      break
    case DbUnit.Voltage: {
      if (value < 0) throw new Error('voltage must be non-negative (V RMS)')
      watts = (value * value) / impedance
      break
    }
    case DbUnit.Dbu: {
      const volts = 0.775 * 10 ** (value / 20)
      watts = (volts * volts) / impedance
      break
    }
    case DbUnit.DbuV: {
      const volts = 1e-6 * 10 ** (value / 20)
      watts = (volts * volts) / impedance
      break
    }
  }
  if (watts < 0) throw new Error('power must be non-negative (W)')
  const volts = Math.sqrt(watts * impedance)
  return {
    watts,
    dbm: 10 * Math.log10(watts / 1e-3),
    dbw: 10 * Math.log10(watts),
    volts,
    dbu: 20 * Math.log10(volts / 0.775),
    dbuV: 20 * Math.log10(volts / 1e-6),
  }
}

/**
 * Convert between a ratio and decibels. Exactly one of `ratio`/`db` must be
 * given; the other is returned. Power ratios use 10·log10, voltage ratios
 * 20·log10.
 */
export function convertDecibelRatio(
  kind: RatioKind,
  ratio?: number,
  db?: number,
): { db?: number; ratio?: number } {
  if ((ratio === undefined) === (db === undefined)) {
    throw new Error('provide exactly one of ratio or db')
  }
  if (db !== undefined) {
    if (kind === RatioKind.Power) return { db, ratio: 10 ** (db / 10) }
    return { db, ratio: 10 ** (db / 20) }
  }
  const value = ratio!
  if (value <= 0) throw new Error('ratio must be positive')
  return { ratio: value, db: kind === RatioKind.Power ? 10 * Math.log10(value) : 20 * Math.log10(value) }
}

/** Magnitude to decibels: 20·log₁₀(magnitude); zero maps to −Infinity. */
export function calcMagnitudeToDb(magnitude: number): number {
  if (magnitude < 0) throw new Error('magnitude must be non-negative')
  return 20 * Math.log10(magnitude)
}
