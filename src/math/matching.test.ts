import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { MatchTopology, MatchVariant, designMatch, type MatchElement } from './smith.ts'
import { ElementKind, calcNetworkImpedance } from './circuits.ts'
import { CircuitMode } from './circuits.ts'

const F = 1e6
const W = 2 * Math.PI * F

/** Build a NetworkElement node for one match element (sign → L/C). */
function buildElementNode(element: MatchElement) {
  return element.reactance > 0
    ? { kind: ElementKind.Inductance, value: element.reactance / W }
    : { kind: ElementKind.Capacitance, value: -1 / (W * element.reactance) }
}

/** Input impedance of a pi network with the load attached. */
function calcPiInputImpedance(elements: MatchElement[], loadImpedance: number): Complex {
  const [shuntSource, series, shuntLoad] = elements
  return calcNetworkImpedance(
    {
      topology: CircuitMode.Parallel,
      elements: [
        buildElementNode(shuntSource!),
        {
          topology: CircuitMode.Series,
          elements: [
            buildElementNode(series!),
            {
              topology: CircuitMode.Parallel,
              elements: [buildElementNode(shuntLoad!), { kind: ElementKind.Resistance, value: loadImpedance }],
            },
          ],
        },
      ],
    },
    F,
  )
}

/** Input impedance of a T network with the load attached. */
function calcTInputImpedance(elements: MatchElement[], loadImpedance: number): Complex {
  const [seriesSource, shunt, seriesLoad] = elements
  return calcNetworkImpedance(
    {
      topology: CircuitMode.Series,
      elements: [
        buildElementNode(seriesSource!),
        {
          topology: CircuitMode.Parallel,
          elements: [
            buildElementNode(shunt!),
            {
              topology: CircuitMode.Series,
              elements: [buildElementNode(seriesLoad!), { kind: ElementKind.Resistance, value: loadImpedance }],
            },
          ],
        },
      ],
    },
    F,
  )
}

describe('designPiNetworkMatch — round-trip through calcNetworkImpedance', () => {
  it('50 Ω → 100 Ω at Q = 5: input impedance returns to 50 + j0', () => {
    const design = designMatch(MatchTopology.Pi, 50, 100, F, 5)
    for (const solution of Object.values(design.solutions)) {
      const zin = calcPiInputImpedance(solution, 100)
      expect(zin.re).toBeCloseTo(50, 6)
      expect(zin.im).toBeCloseTo(0, 4)
    }
    // the low-pass variant carries the inductive series arm
    expect(design.solutions[MatchVariant.LowPass]![1]!.reactance).toBeGreaterThan(0)
    expect(design.solutions[MatchVariant.HighPass]![1]!.reactance).toBeLessThan(0)
  })

  it('rejects Q at or below the L-network minimum', () => {
    expect(() => designMatch(MatchTopology.Pi, 50, 100, F, 1)).toThrow(/must exceed/)
  })
})

describe('designTNetworkMatch — round-trip through calcNetworkImpedance', () => {
  it('50 Ω → 100 Ω at Q = 5: input impedance returns to 50 + j0', () => {
    const design = designMatch(MatchTopology.T, 50, 100, F, 5)
    for (const solution of Object.values(design.solutions)) {
      const zin = calcTInputImpedance(solution, 100)
      expect(zin.re).toBeCloseTo(50, 6)
      expect(zin.im).toBeCloseTo(0, 4)
    }
    // the low-pass variant carries the inductive series arms
    expect(design.solutions[MatchVariant.LowPass]![0]!.reactance).toBeGreaterThan(0)
    expect(design.solutions[MatchVariant.LowPass]![2]!.reactance).toBeGreaterThan(0)
    expect(design.solutions[MatchVariant.HighPass]![0]!.reactance).toBeLessThan(0)
  })

  it('rejects Q at or below the L-network minimum', () => {
    expect(() => designMatch(MatchTopology.T, 50, 100, F, 1)).toThrow(/must exceed/)
  })
})

describe('designMatch — l topology and guards', () => {
  it('l topology derives its implied Q (50 → 100 gives Q = 1)', () => {
    const design = designMatch(MatchTopology.L, 50, 100, F)
    expect(design.qualityFactor).toBeCloseTo(1, 6)
    // both named variants present, each a two-element L network
    expect(design.solutions[MatchVariant.LowPass]).toHaveLength(2)
    expect(design.solutions[MatchVariant.HighPass]).toHaveLength(2)
    // low-pass = series inductive, high-pass = series capacitive
    expect(design.solutions[MatchVariant.LowPass]![0]!.reactance).toBeGreaterThan(0)
    expect(design.solutions[MatchVariant.HighPass]![0]!.reactance).toBeLessThan(0)
  })

  it('rejects equal impedances and invalid inputs', () => {
    expect(() => designMatch(MatchTopology.L, 50, 50, F)).toThrow(/already equal/)
    expect(() => designMatch(MatchTopology.Pi, 50, 100, F)).toThrow(/requires a qualityFactor/)
    expect(() => designMatch(MatchTopology.T, 50, 100, F)).toThrow(/requires a qualityFactor/)
    expect(() => designMatch(MatchTopology.Pi, 0, 100, F, 5)).toThrow(/positive/)
  })
})
