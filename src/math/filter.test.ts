import { describe, expect, it } from 'vitest'
import { calcButterworthAttenuation, designButterworthLowpass } from './filter.ts'
import { ElementKind } from './circuits.ts'

describe('designButterworthLowpass', () => {
  it('order 2: g1 = g2 = √2 (R = 50, fc = 1 kHz)', () => {
    const elements = designButterworthLowpass(2, 1000, 50)
    expect(elements).toHaveLength(2)
    expect(elements[0]).toEqual({ role: 'series', kind: ElementKind.Inductance, value: expect.any(Number) })
    expect(elements[1]).toEqual({ role: 'shunt', kind: ElementKind.Capacitance, value: expect.any(Number) })
    const w = 2 * Math.PI * 1000
    const g = Math.sqrt(2)
    expect(elements[0]!.value).toBeCloseTo((50 * g) / w, 9)
    expect(elements[1]!.value).toBeCloseTo(g / (50 * w), 12)
  })

  it('order 3: g = 1, 2, 1', () => {
    const elements = designButterworthLowpass(3, 1000, 50)
    expect(elements).toHaveLength(3)
    const w = 2 * Math.PI * 1000
    expect(elements[0]!.value).toBeCloseTo(50 / w, 9) // L = R·g1/ωc, g1 = 1
    expect(elements[1]!.value).toBeCloseTo(2 / (50 * w), 12) // C = g2/(R·ωc), g2 = 2
    expect(elements[2]!.value).toBeCloseTo(50 / w, 9)
  })

  it('alternates series/shunt roles', () => {
    const elements = designButterworthLowpass(4, 1000, 50)
    expect(elements.map((e) => e.role)).toEqual(['series', 'shunt', 'series', 'shunt'])
  })

  it('rejects invalid orders and non-positive values', () => {
    expect(() => designButterworthLowpass(0, 1000, 50)).toThrow(/positive integer/)
    expect(() => designButterworthLowpass(2.5, 1000, 50)).toThrow(/positive integer/)
    expect(() => designButterworthLowpass(2, 0, 50)).toThrow(/positive/)
    expect(() => designButterworthLowpass(2, 1000, 0)).toThrow(/positive/)
  })
})

describe('calcButterworthAttenuation', () => {
  it('is exactly 3.0103 dB at the cutoff for any order', () => {
    for (const order of [1, 2, 3, 5]) {
      expect(calcButterworthAttenuation(order, 1000, 1000)).toBeCloseTo(10 * Math.log10(2), 6)
    }
  })

  it('rolls off at 20·n dB per decade', () => {
    // one decade above cutoff: ≈ 20·n dB (exact: 10·log10(1+10^(2n)))
    expect(calcButterworthAttenuation(2, 1000, 10000)).toBeCloseTo(40, 2)
    expect(calcButterworthAttenuation(3, 1000, 10000)).toBeCloseTo(60, 2)
    expect(calcButterworthAttenuation(4, 1000, 10000)).toBeCloseTo(80, 2)
  })
})
