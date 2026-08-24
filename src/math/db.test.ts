import { describe, expect, it } from 'vitest'
import { DbUnit, RatioKind, convertDbLevels, convertDecibelRatio } from './db.ts'

describe('convertDbLevels (textbook checks)', () => {
  it('30 dBm = 1 W = 137 dBµV into 50 Ω (textbook approximation)', () => {
    const levels = convertDbLevels(30, DbUnit.Dbm, 50)
    expect(levels.watts).toBeCloseTo(1, 10)
    expect(levels.dbw).toBeCloseTo(0, 10)
    expect(levels.volts).toBeCloseTo(Math.sqrt(50), 8) // √(P·R) = 7.071 V
    expect(levels.dbuV).toBeCloseTo(136.9897, 3) // exact 20·log10(7.071/1e-6)
    expect(levels.dbm).toBeCloseTo(30, 10)
  })

  it('1 W is 30 dBm', () => {
    const levels = convertDbLevels(1, DbUnit.Watt, 50)
    expect(levels.dbm).toBeCloseTo(30, 10)
  })

  it('0.775 V is 0 dBu; into 600 Ω it is ≈ 1 mW (0.775 is the rounded textbook value)', () => {
    const levels = convertDbLevels(0.775, DbUnit.Volt, 600)
    expect(levels.dbu).toBeCloseTo(0, 8)
    expect(levels.watts).toBeCloseTo(0.775 * 0.775 / 600, 12) // 1.001 mW exactly
    expect(levels.dbm).toBeCloseTo(0.0045, 3) // ≈ 0 dBm
  })

  it('0 dBm into 50 Ω = 107 dBµV (textbook approximation)', () => {
    const levels = convertDbLevels(0, DbUnit.Dbm, 50)
    expect(levels.dbuV).toBeCloseTo(106.9897, 3)
  })

  it('rejects non-positive impedance', () => {
    expect(() => convertDbLevels(1, DbUnit.Watt, 0)).toThrow(/impedance/)
  })
})

describe('convertDecibelRatio (textbook checks)', () => {
  it('10 dB power ratio is ×10; voltage ratio is √10', () => {
    const power = convertDecibelRatio(RatioKind.Power, undefined, 10)
    expect(power.ratio).toBeCloseTo(10, 10)
    const voltage = convertDecibelRatio(RatioKind.Voltage, undefined, 20)
    expect(voltage.ratio).toBeCloseTo(10, 10)
    const half = convertDecibelRatio(RatioKind.Voltage, undefined, -6.0206)
    expect(half.ratio).toBeCloseTo(0.5, 3)
  })

  it('ratio to dB: power ×2 ≈ 3.01 dB, voltage ×2 ≈ 6.02 dB', () => {
    expect(convertDecibelRatio(RatioKind.Power, 2).db).toBeCloseTo(3.0103, 3)
    expect(convertDecibelRatio(RatioKind.Voltage, 2).db).toBeCloseTo(6.0206, 3)
  })

  it('rejects both or neither input', () => {
    expect(() => convertDecibelRatio(RatioKind.Power, 2, 3)).toThrow(/exactly one/)
    expect(() => convertDecibelRatio(RatioKind.Power)).toThrow(/exactly one/)
  })

  it('rejects non-positive ratio', () => {
    expect(() => convertDecibelRatio(RatioKind.Power, -1)).toThrow(/positive/)
  })
})
