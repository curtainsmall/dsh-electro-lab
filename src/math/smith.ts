/**
 * Smith-chart mathematics. SI base units; plain complex.js values.
 */
import { Complex } from 'complex.js'

/** Reflection coefficient: Γ = (Z − Z0) / (Z + Z0). */
export function zToGamma(z: Complex, z0: number): Complex {
  if (!Number.isFinite(z0) || z0 <= 0) throw new Error('reference impedance must be a positive number (Ω)')
  return z.sub(z0).div(z.add(z0))
}

/** VSWR = (1 + |Γ|) / (1 − |Γ|); |Γ| = 1 (open/short) yields Infinity. */
export function gammaToVswr(g: Complex): number {
  const m = g.abs()
  if (m === 1) return Number.POSITIVE_INFINITY
  if (m > 1) throw new Error(`|Γ| = ${m} > 1 — passive load reflection cannot exceed unity`)
  return (1 + m) / (1 - m)
}

/** Return loss in dB: −20·log10(|Γ|). |Γ| = 0 yields +Infinity (no reflection). */
export function returnLossDb(g: Complex): number {
  const m = g.abs()
  if (m === 0) return Number.POSITIVE_INFINITY
  return -20 * Math.log10(m)
}

/** Quarter-wave transformer: Z1 = √(Z0·ZL). ZL must be real and positive. */
export function quarterWaveImpedance(z0: number, zl: number): number {
  if (z0 <= 0 || zl <= 0) throw new Error('impedances must be positive (Ω)')
  return Math.sqrt(z0 * zl)
}

/**
 * L-network matching between two real resistances.
 * Q = √(Rl/Rs − 1); series element (X = Q·Rs) sits next to the SMALLER
 * resistance, shunt element (X = Rl/Q) next to the LARGER one.
 * Two conjugate solutions (low-pass / high-pass variants) are returned.
 */
export function lNetworkMatch(zs: number, zl: number, f: number): {
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
  if (zs <= 0 || zl <= 0) throw new Error('impedances must be positive (Ω)')
  if (f <= 0) throw new Error('frequency must be positive (Hz)')
  if (zs === zl) return { matched: true, seriesSide: 'source', shuntSide: 'load' }
  const smaller = Math.min(zs, zl)
  const larger = Math.max(zs, zl)
  const seriesSide = zs < zl ? 'source' : 'load'
  const shuntSide = zs < zl ? 'load' : 'source'
  const q = Math.sqrt(larger / smaller - 1)
  const xSeries = q * smaller
  const xShunt = larger / q
  const w = 2 * Math.PI * f
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
