import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { ElementRole, MatchTopology, MatchVariant, calcCapacitanceFromReactance, designMatch, calcInductanceFromReactance, calcQuarterWaveImpedance, calcReturnLossDb, convertImpedanceToReflection, convertReflectionToVswr } from '../../src/math/smith.ts'

describe('impedance_to_reflection (textbook check)', () => {
  it('Z = 50 + j50 Ω on a 50 Ω line → Γ = 0.447∠63.43°', () => {
    const g = convertImpedanceToReflection(new Complex(50, 50), 50)
    // Γ = 50j / (100 + 50j) = 0.2 + 0.4j
    expect(g.re).toBeCloseTo(0.2, 6)
    expect(g.im).toBeCloseTo(0.4, 6)
    expect(g.abs()).toBeCloseTo(Math.sqrt(0.2), 6) // 0.4472
    expect((g.arg() * 180) / Math.PI).toBeCloseTo(63.4349, 3)
  })

  it('open and short circuits map to |Γ| = 1', () => {
    expect(convertImpedanceToReflection(new Complex(1e12, 0), 50).abs()).toBeCloseTo(1, 6)
    expect(convertImpedanceToReflection(new Complex(0, 0), 50).abs()).toBeCloseTo(1, 6)
  })

  it('matched load gives Γ = 0', () => {
    expect(convertImpedanceToReflection(new Complex(50, 0), 50).abs()).toBe(0)
  })
})

describe('VSWR and return loss', () => {
  it('Γ = 0.4472 → VSWR 2.62 (textbook check)', () => {
    const g = convertImpedanceToReflection(new Complex(50, 50), 50)
    expect(convertReflectionToVswr(g)).toBeCloseTo(2.618, 3)
  })

  it('|Γ| = 1 yields infinite VSWR', () => {
    expect(convertReflectionToVswr(new Complex(1, 0))).toBe(Number.POSITIVE_INFINITY)
  })

  it('Γ = 0.4472 → return loss ≈ 6.99 dB (textbook check)', () => {
    const g = convertImpedanceToReflection(new Complex(50, 50), 50)
    expect(calcReturnLossDb(g)).toBeCloseTo(6.9897, 3)
  })

  it('perfect match gives infinite return loss', () => {
    expect(calcReturnLossDb(new Complex(0, 0))).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('quarter-wave transformer', () => {
  it('Z1 = √(Z0·ZL) (textbook check)', () => {
    // 50 Ω line to 100 Ω load → Z1 = √5000 ≈ 70.71 Ω
    expect(calcQuarterWaveImpedance(50, 100)).toBeCloseTo(70.7107, 4)
  })
})

describe('reactance ↔ element values', () => {
  it('positive reactance is an inductance, negative is a capacitance', () => {
    const angularFrequency = 2 * Math.PI * 1e6
    expect(calcInductanceFromReactance(50, angularFrequency)).toBeCloseTo(50 / angularFrequency, 12)
    expect(calcInductanceFromReactance(-50, angularFrequency)).toBeUndefined()
    expect(calcCapacitanceFromReactance(-100, angularFrequency)).toBeCloseTo(1 / (angularFrequency * 100), 12)
    expect(calcCapacitanceFromReactance(100, angularFrequency)).toBeUndefined()
  })
})

describe('L-network match', () => {
  it('50 Ω → 100 Ω at 1 MHz: Q = 1, Xs = 50, Xp = 100', () => {
    const design = designMatch(MatchTopology.L, 50, 100, 1e6)
    expect(design.qualityFactor).toBeCloseTo(1, 6)
    const lowPass = design.solutions[MatchVariant.LowPass]!
    const highPass = design.solutions[MatchVariant.HighPass]!
    // series arm sits next to the smaller resistance (50 Ω, source side)
    expect(lowPass[0]!.role).toBe(ElementRole.SeriesSource)
    expect(lowPass[1]!.role).toBe(ElementRole.ShuntLoad)
    // Low-pass: Xs = +50, Xp = −100 (L + C)
    expect(lowPass[0]!.reactance).toBeCloseTo(50, 6)
    expect(lowPass[1]!.reactance).toBeCloseTo(-100, 6)
    // High-pass: mirror image
    expect(highPass[0]!.reactance).toBeCloseTo(-50, 6)
    expect(highPass[1]!.reactance).toBeCloseTo(100, 6)
  })
})
