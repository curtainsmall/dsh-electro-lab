import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  CircuitMode,
  ElementKind,
  calcNetworkImpedance,
  combineParallelImpedances,
  combineSeriesImpedances,
} from '../../src/math/circuits.ts'
import { validateNetwork } from '../../src/tools/circuit-tools.ts'

function assertClose(z: Complex, re: number, im: number, tol = 1e-6): void {
  expect(z.re).toBeCloseTo(re, tol > 1 ? tol : 6)
  expect(z.im).toBeCloseTo(im, 6)
}

describe('element leaves (through calcNetworkImpedance)', () => {
  it('computes R, jωL, and 1/(jωC) at a frequency', () => {
    const f = 1000
    const w = 2 * Math.PI * f
    assertClose(calcNetworkImpedance({ kind: ElementKind.Resistance, value: 10 }, f), 10, 0)
    assertClose(calcNetworkImpedance({ kind: ElementKind.Inductance, value: 1e-3 }, f), 0, w * 1e-3)
    assertClose(calcNetworkImpedance({ kind: ElementKind.Capacitance, value: 1e-6 }, f), 0, -1 / (w * 1e-6))
  })
})

describe('combineSeriesImpedances / combineParallelImpedances — primitive combinations', () => {
  it('series RLC equals the textbook formula (10 − j1585 at 1 kHz)', () => {
    const f = 1000
    const parts = [
      calcNetworkImpedance({ kind: ElementKind.Resistance, value: 10 }, f),
      calcNetworkImpedance({ kind: ElementKind.Inductance, value: 1e-3 }, f),
      calcNetworkImpedance({ kind: ElementKind.Capacitance, value: 1e-6 }, f),
    ]
    const z = combineSeriesImpedances(parts)
    expect(z.re).toBeCloseTo(10, 6)
    expect(z.im).toBeCloseTo(6.2832 - 159.1549, 3)
  })

  it('parallel combination matches 50 ∥ (50+j50) = 30+j10', () => {
    const z = combineParallelImpedances([new Complex(50, 0), new Complex(50, 50)])
    expect(z.re).toBeCloseTo(30, 6)
    expect(z.im).toBeCloseTo(10, 6)
  })

  it('parallel of two equal resistors halves the resistance', () => {
    const z = combineParallelImpedances([new Complex(100, 0), new Complex(100, 0)])
    expect(z.re).toBeCloseTo(50, 9)
    expect(z.im).toBeCloseTo(0, 9)
  })

  it('raises for empty lists and all-open parallels', () => {
    expect(() => combineSeriesImpedances([])).toThrow(/at least one/)
    expect(() => combineParallelImpedances([])).toThrow(/at least one/)
  })
})

describe('calcNetworkImpedance — nested topologies', () => {
  it('evaluates a nested series-with-parallel network', () => {
    // R1 in series with (R2 in parallel with L): R1=10, R2=20, L=1mH at 1 kHz
    const f = 1000
    const network: Parameters<typeof calcNetworkImpedance>[0] = {
      topology: CircuitMode.Series,
      elements: [
        { kind: ElementKind.Resistance, value: 10 },
        {
          topology: CircuitMode.Parallel,
          elements: [
            { kind: ElementKind.Resistance, value: 20 },
            { kind: ElementKind.Inductance, value: 1e-3 },
          ],
        },
      ],
    }
    const z = calcNetworkImpedance(network, f)
    // 20 ∥ j6.283 = (20·j6.283)/(20+j6.283) ≈ 1.796 + j5.718
    expect(z.re).toBeCloseTo(10 + 1.7964, 3)
    expect(z.im).toBeCloseTo(5.7185, 3)
  })
})

describe('validateNetwork', () => {
  it('accepts valid trees and rejects malformed ones', () => {
    const valid = validateNetwork({ topology: 'series', elements: [{ kind: 'resistance', value: 10 }] })
    expect(valid).toEqual({ topology: CircuitMode.Series, elements: [{ kind: ElementKind.Resistance, value: 10 }] })
    expect(() => validateNetwork(null)).toThrow(/network must be an object/)
    expect(() => validateNetwork({ kind: 'capacitor', value: 1 })).toThrow(/unknown element kind/)
    expect(() => validateNetwork({ kind: 'resistance', value: -5 })).toThrow(/non-negative/)
    expect(() => validateNetwork({ topology: 'series', elements: [] })).toThrow(/non-empty/)
    expect(() => validateNetwork({ foo: 1 })).toThrow(/must be/)
  })
})
