import { describe, expect, it } from 'vitest'
import { DbUnit, convertDbLevels } from '../../src/math/db.ts'

describe('convertDbLevels (known-value checks)', () => {
  it('30 dBm = 1 W = 137 dBµV into 50 Ω (known-value approximation)', () => {
    const levels = convertDbLevels(30, DbUnit.Dbm, 50)
    expect(levels.watts).toBeCloseTo(1, 10)
    expect(levels.dbw).toBeCloseTo(0, 10)
    expect(levels.volts).toBeCloseTo(Math.sqrt(50), 8) // √(P·R) = 7.071 V
    expect(levels.dbuV).toBeCloseTo(136.9897, 3) // exact 20·log10(7.071/1e-6)
    expect(levels.dbm).toBeCloseTo(30, 10)
  })

  it('1 W is 30 dBm', () => {
    const levels = convertDbLevels(1, DbUnit.Power, 50)
    expect(levels.dbm).toBeCloseTo(30, 10)
  })

  it('0.775 V is 0 dBu; into 600 Ω it is ≈ 1 mW (0.775 is the rounded reference value)', () => {
    const levels = convertDbLevels(0.775, DbUnit.Voltage, 600)
    expect(levels.dbu).toBeCloseTo(0, 8)
    expect(levels.watts).toBeCloseTo(0.775 * 0.775 / 600, 12) // 1.001 mW exactly
    expect(levels.dbm).toBeCloseTo(0.0045, 3) // ≈ 0 dBm
  })

  it('0 dBm into 50 Ω = 107 dBµV (known-value approximation)', () => {
    const levels = convertDbLevels(0, DbUnit.Dbm, 50)
    expect(levels.dbuV).toBeCloseTo(106.9897, 3)
  })

  it('rejects non-positive impedance', () => {
    expect(() => convertDbLevels(1, DbUnit.Power, 0)).toThrow(/impedance/)
  })
})
