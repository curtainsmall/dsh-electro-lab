/**
 * Smith-chart mathematics. SI base units; plain complex.js values.
 */
import { Complex } from 'complex.js'

/** Reflection coefficient: Γ = (Z − Z0) / (Z + Z0). */
export function zToGamma(impedance: Complex, referenceImpedance: number): Complex {
  if (!Number.isFinite(referenceImpedance) || referenceImpedance <= 0) throw new Error('reference impedance must be a positive number (Ω)')
  return impedance.sub(referenceImpedance).div(impedance.add(referenceImpedance))
}

/** VSWR = (1 + |Γ|) / (1 − |Γ|); |Γ| = 1 (open/short) yields Infinity. */
export function gammaToVswr(reflectionCoefficient: Complex): number {
  const magnitude = reflectionCoefficient.abs()
  if (magnitude === 1) return Number.POSITIVE_INFINITY
  if (magnitude > 1) throw new Error(`|Γ| = ${magnitude} > 1 — passive load reflection cannot exceed unity`)
  return (1 + magnitude) / (1 - magnitude)
}

/** Return loss in dB: −20·log10(|Γ|). |Γ| = 0 yields +Infinity (no reflection). */
export function returnLossDb(reflectionCoefficient: Complex): number {
  const magnitude = reflectionCoefficient.abs()
  if (magnitude === 0) return Number.POSITIVE_INFINITY
  return -20 * Math.log10(magnitude)
}

/** Quarter-wave transformer: Z1 = √(Z0·ZL). ZL must be real and positive. */
export function quarterWaveImpedance(lineImpedance: number, loadImpedance: number): number {
  if (lineImpedance <= 0 || loadImpedance <= 0) throw new Error('impedances must be positive (Ω)')
  return Math.sqrt(lineImpedance * loadImpedance)
}

/**
 * L-network matching between two real Resistances.
 * Q = √(Rl/Rs − 1); series element (X = Q·Rs) sits next to the SMALLER, shunt element (X = Rl/Q) next to the LARGER one.
 * Two conjugate solutions (low-pass / high-pass variants) are returned.
 */
export function lNetworkMatch(sourceImpedance: number, loadImpedance: number, frequency: number): {
  matched: boolean
  q?: number
  seriesSide: 'source' | 'load'
  shuntSide: 'source' | 'load'
  solutions?: {
    xSeries: number
    xShunt: number
    lSeries?: number
    cSeries?: number
    lShunt?: number
    cShunt?: number
  }[]
} {
  if (sourceImpedance <= 0 || loadImpedance <= 0) throw new Error('impedances must be positive (Ω)')
  if (frequency <= 0) throw new Error('frequency must be positive (Hz)')
  if (sourceImpedance === loadImpedance) return { matched: true, seriesSide: 'source', shuntSide: 'load' }
  const smaller = Math.min(sourceImpedance, loadImpedance)
  const larger = Math.max(sourceImpedance, loadImpedance)
  const seriesSide = sourceImpedance < loadImpedance ? 'source' : 'load'
  const shuntSide = sourceImpedance < loadImpedance ? 'load' : 'source'
  const q = Math.sqrt(larger / smaller - 1)
  const xSeries = q * smaller
  const xShunt = larger / q
  const w = 2 * Math.PI * frequency
  const elements = (xs: number, xp: number) => ({
    lSeries: xs > 0 ? xs / w : undefined,
    cSeries: xs < 0 ? -1 / (w * xs) : undefined,
    lShunt: xp > 0 ? xp / w : undefined,
    cShunt: xp < 0 ? -1 / (w * xp) : undefined,
  })
  return {
    matched: false,
    q,
    seriesSide,
    shuntSide,
    solutions: [
      { xSeries, xShunt: -xShunt, ...elements(xSeries, -xShunt) },
      { xSeries: -xSeries, xShunt, ...elements(-xSeries, xShunt) },
    ],
  }
}
