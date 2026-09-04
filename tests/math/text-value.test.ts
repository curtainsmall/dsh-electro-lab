import { describe, expect, it } from 'vitest'
import { QuantityKind } from '../../src/math/quantity-kind.ts'
import { formatValueText, parseValueText, parseValueTexts } from '../../src/math/text-value.ts'

describe('parseValueText — real values with prefix + unit', () => {
  it('parses prefixed electrical units into SI base values', () => {
    const cap = parseValueText('100 mF')
    expect(cap.value).toBe(0.1)
    expect(cap.kind).toBe(QuantityKind.Capacitance)
    expect(cap.unit).toBe('F')
    expect(cap.prefix).toBe('m')

    expect(parseValueText('50 kHz').value).toBe(50000)
    expect(parseValueText('50 kHz').kind).toBe(QuantityKind.Frequency)
    expect(parseValueText('1.5kΩ').value).toBe(1500)
    expect(parseValueText('1.5kΩ').kind).toBe(QuantityKind.Resistance)
    expect(parseValueText('2.2 uF').value).toBeCloseTo(2.2e-6, 12)
    expect(parseValueText('10 µs').value).toBeCloseTo(1e-5, 12)
    expect(parseValueText('10 µs').kind).toBe(QuantityKind.Time)
    expect(parseValueText('3 mA').value).toBe(0.003)
    expect(parseValueText('2 MW').value).toBe(2e6)
    expect(parseValueText('5 nH').value).toBe(5e-9)
    expect(parseValueText('5 nH').kind).toBe(QuantityKind.Inductance)
  })

  it('accepts no space, ohm aliases and bare/scientific numbers', () => {
    expect(parseValueText('100ohm').value).toBe(100)
    expect(parseValueText('100ohm').unit).toBe('Ω')
    expect(parseValueText('100Ω').kind).toBe(QuantityKind.Resistance)
    expect(parseValueText('42').value).toBe(42)
    expect(parseValueText('42').kind).toBe(QuantityKind.None)
    expect(parseValueText('1e3').value).toBe(1000)
    expect(parseValueText('-2.5').value).toBe(-2.5)
    expect(parseValueText('9 V').value).toBe(9)
  })

  it('converts angles and temperatures to SI (radians, kelvin)', () => {
    expect(parseValueText('90°').value).toBeCloseTo(Math.PI / 2, 12)
    expect(parseValueText('90°').kind).toBe(QuantityKind.Angle)
    expect(parseValueText('0.5 rad').value).toBe(0.5)
    const celsius = parseValueText('25 °C')
    expect(celsius.value).toBeCloseTo(298.15, 12)
    expect(celsius.kind).toBe(QuantityKind.Temperature)
    expect(celsius.unit).toBe('K')
    const fahrenheit = parseValueText('212 °F')
    expect(fahrenheit.value).toBeCloseTo(373.15, 12)
    expect(parseValueText('300 K').value).toBe(300)
    expect(parseValueText('10 dB').value).toBe(10)
    expect(parseValueText('10 dB').kind).toBe(QuantityKind.Log)
  })
})

describe('parseValueText — complex and polar', () => {
  it('parses rectangular forms with optional units', () => {
    const rect = parseValueText('1+2j')
    expect(rect.value).toEqual({ re: 1, im: 2 })
    expect(rect.kind).toBe(QuantityKind.None)
    expect(parseValueText('1 + 2j').value).toEqual({ re: 1, im: 2 })
    expect(parseValueText('1 - 2j').value).toEqual({ re: 1, im: -2 })
    expect(parseValueText('2j').value).toEqual({ re: 0, im: 2 })
    expect(parseValueText('-3j').value).toEqual({ re: 0, im: -3 })
    const withUnit = parseValueText('1+2j Ω')
    expect(withUnit.value).toEqual({ re: 1, im: 2 })
    expect(withUnit.kind).toBe(QuantityKind.Resistance)
  })

  it('parses polar forms and converts degree angles to radians', () => {
    const polar = parseValueText('3 ∠ 0.5')
    expect(polar.value).toEqual({ mag: 3, ang: 0.5 })
    expect(polar.kind).toBe(QuantityKind.None)
    const degrees = parseValueText('220∠30° V')
    expect((degrees.value as { mag: number }).mag).toBe(220)
    expect((degrees.value as { mag: number; ang: number }).ang).toBeCloseTo(Math.PI / 6, 12)
    expect(degrees.kind).toBe(QuantityKind.Voltage)
    expect(parseValueText('220∠0.5 rad V').value).toEqual({ mag: 220, ang: 0.5 })
  })
})

describe('parseValueText — errors', () => {
  it('throws on empty, junk, unknown units and prefixes on non-prefixable units', () => {
    expect(() => parseValueText('')).toThrow(/empty/)
    expect(() => parseValueText('abc')).toThrow(/unrecognized value text/)
    expect(() => parseValueText('5 X')).toThrow(/unrecognized/)
    expect(() => parseValueText('5 mrad')).toThrow(/prefix "m" is not allowed/)
    expect(() => parseValueText('5 m°C')).toThrow(/prefix/)
    expect(() => parseValueText('1+2j °C')).toThrow(/temperature unit cannot follow/)
  })
})

describe('formatValueText', () => {
  it('formats real values with auto engineering prefixes', () => {
    expect(formatValueText(0.1, QuantityKind.Capacitance)).toBe('100 mF')
    expect(formatValueText(50000, QuantityKind.Frequency)).toBe('50 kHz')
    expect(formatValueText(1500, QuantityKind.Resistance)).toBe('1.5 kΩ')
    expect(formatValueText(9, QuantityKind.Voltage)).toBe('9 V')
    expect(formatValueText(0.003, QuantityKind.Current)).toBe('3 mA')
  })

  it('honors none and explicit prefixes and omits units for kind none', () => {
    expect(formatValueText(0.1, QuantityKind.Capacitance, 'none')).toBe('0.1 F')
    expect(formatValueText(1500, QuantityKind.Resistance, 'k')).toBe('1.5 kΩ')
    expect(formatValueText(0.1, QuantityKind.Capacitance, 'µ')).toBe('100000 µF')
    expect(formatValueText(42)).toBe('42')
    expect(formatValueText(298.15, QuantityKind.Temperature)).toBe('298.15 K')
    expect(formatValueText(10, QuantityKind.Log)).toBe('10 dB')
  })

  it('formats complex and polar payloads', () => {
    expect(formatValueText({ re: 1, im: 2 })).toBe('1 + 2j')
    expect(formatValueText({ re: 1, im: -2 }, QuantityKind.Resistance, 'none')).toBe('1 - 2j Ω')
    expect(formatValueText({ re: 0, im: -3 })).toBe('-3j')
    expect(formatValueText({ mag: 3, ang: 0.5 })).toBe('3 ∠ 0.5 rad')
    expect(formatValueText({ mag: 220, ang: 0 }, QuantityKind.Voltage)).toBe('220 ∠ 0 rad V')
  })
})

describe('parseValueTexts — batch parsing with per-item tolerance', () => {
  it('parses every item in order with its own outcome', () => {
    const items = parseValueTexts(['100 mF', '50 kHz', '25 °C'])
    expect(items).toHaveLength(3)
    const first = items[0] as { ok: true; value: number; kind: QuantityKind; unit: string; prefix: string | null }
    expect(first.ok).toBe(true)
    expect(first.value).toBe(0.1)
    expect(first.kind).toBe(QuantityKind.Capacitance)
    expect(first.unit).toBe('F')
    expect(first.prefix).toBe('m')
    expect((items[1] as { ok: true; value: number }).value).toBe(50000)
    expect((items[2] as { ok: true; value: number }).value).toBeCloseTo(298.15, 12)
  })

  it('keeps the good items and reports the bad ones individually', () => {
    const items = parseValueTexts(['100ohm', '1 second', '1+2j', 'nonsense'])
    expect(items[0]).toMatchObject({ ok: true, value: 100, kind: QuantityKind.Resistance })
    const bad = items[1] as { ok: false; error: string }
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/unrecognized value text "1 second"/)
    expect((items[2] as { ok: true }).ok).toBe(true)
    expect((items[3] as { ok: false; error: string }).error).toMatch(/unrecognized/)
  })

  it('returns an empty list for no input', () => {
    expect(parseValueTexts([])).toEqual([])
  })
})
