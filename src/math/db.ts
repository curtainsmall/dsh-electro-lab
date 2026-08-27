/**
 * Log mathematics: absolute level conversion (power/voltage references).
 * Voltage↔power conversion assumes a reference impedance (default 50 Ω).
 * Ratio ↔ dB lives in convert.ts (convertLogValue) — the primitive convert
 * covers the log scale without any electronics context.
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
