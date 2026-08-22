import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { gammaToVswr, lNetworkMatch, quarterWaveImpedance, returnLossDb, zToGamma } from './smith.ts'

describe('z_to_gamma (textbook check)', () => {
  it('Z = 50 + j50 Ω on a 50 Ω line → Γ = 0.447∠63.43°', () => {
    const g = zToGamma(new Complex(50, 50), 50)
    // Γ = 50j / (100 + 50j) = 0.2 + 0.4j
    expect(g.re).toBeCloseTo(0.2, 6)
    expect(g.im).toBeCloseTo(0.4, 6)
    expect(g.abs()).toBeCloseTo(Math.sqrt(0.2), 6) // 0.4472
    expect((g.arg() * 180) / Math.PI).toBeCloseTo(63.4349, 3)
  })

  it('open and short circuits map to |Γ| = 1', () => {
    expect(zToGamma(new Complex(1e12, 0), 50).abs()).toBeCloseTo(1, 6)
    expect(zToGamma(new Complex(0, 0), 50).abs()).toBeCloseTo(1, 6)
  })

  it('matched load gives Γ = 0', () => {
    expect(zToGamma(new Complex(50, 0), 50).abs()).toBe(0)
  })
})

describe('VSWR and return loss', () => {
  it('Γ = 0.4472 → VSWR 2.62 (textbook check)', () => {
    const g = zToGamma(new Complex(50, 50), 50)
    expect(gammaToVswr(g)).toBeCloseTo(2.618, 3)
  })

  it('|Γ| = 1 yields infinite VSWR', () => {
    expect(gammaToVswr(new Complex(1, 0))).toBe(Number.POSITIVE_INFINITY)
  })

  it('Γ = 0.4472 → return loss ≈ 6.99 dB (textbook check)', () => {
    const g = zToGamma(new Complex(50, 50), 50)
    expect(returnLossDb(g)).toBeCloseTo(6.9897, 3)
  })

  it('perfect match gives infinite return loss', () => {
    expect(returnLossDb(new Complex(0, 0))).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('quarter-wave transformer', () => {
  it('Z1 = √(Z0·ZL) (textbook check)', () => {
    // 50 Ω line to 100 Ω load → Z1 = √5000 ≈ 70.71 Ω
    expect(quarterWaveImpedance(50, 100)).toBeCloseTo(70.7107, 4)
  })
})

describe('L-network match', () => {
  it('50 Ω → 100 Ω at 1 MHz: Q = 1, Xs = 50, Xp = 100', () => {
    const result = lNetworkMatch(50, 100, 1e6)
    expect(result.matched).toBe(false)
    expect(result.q).toBeCloseTo(1, 6)
    expect(result.seriesSide).toBe('source') // smaller R (50) on source side
    expect(result.shuntSide).toBe('load')
    const solutions = result.solutions!
    const a = solutions[0]!
    const b = solutions[1]!
    // Solution A: Xs = +50 (L = 7.96 µH), Xp = −100 (C = 1.59 nF)
    expect(a.xSeries).toBeCloseTo(50, 6)
    expect(a.xShunt).toBeCloseTo(-100, 6)
    expect(a.lSeries).toBeCloseTo(50 / (2 * Math.PI * 1e6), 8)
    expect(a.cShunt).toBeCloseTo(1 / (2 * Math.PI * 1e6 * 100), 12)
    // Solution B: mirror image
    expect(b.xSeries).toBeCloseTo(-50, 6)
    expect(b.xShunt).toBeCloseTo(100, 6)
    expect(b.cSeries).toBeCloseTo(1 / (2 * Math.PI * 1e6 * 50), 12)
    expect(b.lShunt).toBeCloseTo(100 / (2 * Math.PI * 1e6), 8)
  })

  it('reports matched when equal', () => {
    expect(lNetworkMatch(50, 50, 1e6).matched).toBe(true)
  })
})
