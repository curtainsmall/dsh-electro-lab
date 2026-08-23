/**
 * Smith-chart mathematics. SI base units; plain complex.js values.
 */
import { Complex } from 'complex.js'

/** Reflection coefficient: Γ = (Z − Z0) / (Z + Z0). */
export function impedanceToReflection(impedance: Complex, referenceImpedance: number): Complex {
  if (!Number.isFinite(referenceImpedance) || referenceImpedance <= 0) throw new Error('reference impedance must be a positive number (Ω)')
  return impedance.sub(referenceImpedance).div(impedance.add(referenceImpedance))
}

/** VSWR = (1 + |Γ|) / (1 − |Γ|); |Γ| = 1 (open/short) yields Infinity. */
export function reflectionToVswr(reflectionCoefficient: Complex): number {
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

/** Which side of a match the network element sits on. */
export enum MatchSide {
  Source = 'source',
  Load = 'load',
}

/**
 * L-network matching between two real resistances.
 * Q = √(Rl/Rs − 1); series element (X = Q·Rs) sits next to the SMALLER, shunt element (X = Rl/Q) next to the LARGER one.
 * Two conjugate solutions (low-pass / high-pass variants) are returned.
 */
export function lNetworkMatch(sourceImpedance: number, loadImpedance: number, frequency: number): {
  matched: boolean
  qualityFactor?: number
  seriesSide: MatchSide
  shuntSide: MatchSide
  solutions?: {
    seriesReactance: number
    shuntReactance: number
    seriesInductance?: number
    seriesCapacitance?: number
    shuntInductance?: number
    shuntCapacitance?: number
  }[]
} {
  if (sourceImpedance <= 0 || loadImpedance <= 0) throw new Error('impedances must be positive (Ω)')
  if (frequency <= 0) throw new Error('frequency must be positive (Hz)')
  if (sourceImpedance === loadImpedance) return { matched: true, seriesSide: MatchSide.Source, shuntSide: MatchSide.Load }
  const smaller = Math.min(sourceImpedance, loadImpedance)
  const larger = Math.max(sourceImpedance, loadImpedance)
  const seriesSide = sourceImpedance < loadImpedance ? MatchSide.Source : MatchSide.Load
  const shuntSide = sourceImpedance < loadImpedance ? MatchSide.Load : MatchSide.Source
  const qualityFactor = Math.sqrt(larger / smaller - 1)
  const seriesReactance = qualityFactor * smaller
  const shuntReactance = larger / qualityFactor
  const w = 2 * Math.PI * frequency
  const elements = (xs: number, xp: number) => ({
    seriesInductance: xs > 0 ? xs / w : undefined,
    seriesCapacitance: xs < 0 ? -1 / (w * xs) : undefined,
    shuntInductance: xp > 0 ? xp / w : undefined,
    shuntCapacitance: xp < 0 ? -1 / (w * xp) : undefined,
  })
  return {
    matched: false,
    qualityFactor,
    seriesSide,
    shuntSide,
    solutions: [
      { seriesReactance, shuntReactance: -shuntReactance, ...elements(seriesReactance, -shuntReactance) },
      { seriesReactance: -seriesReactance, shuntReactance, ...elements(-seriesReactance, shuntReactance) },
    ],
  }
}

/** Matching topology. */
export enum MatchTopology {
  L = 'l',
  Pi = 'pi',
  T = 't',
}

/** Role of one element inside a matching network. */
export enum ElementRole {
  ShuntSource = 'shunt-source',
  Series = 'series',
  ShuntLoad = 'shunt-load',
  SeriesSource = 'series-source',
  SeriesLoad = 'series-load',
}

/** Pure mappings: match side → element role (used by designMatch). */
const SHUNT_ROLE: Record<MatchSide, ElementRole.ShuntSource | ElementRole.ShuntLoad> = {
  [MatchSide.Source]: ElementRole.ShuntSource,
  [MatchSide.Load]: ElementRole.ShuntLoad,
}

const SERIES_ROLE: Record<MatchSide, ElementRole.SeriesSource | ElementRole.SeriesLoad> = {
  [MatchSide.Source]: ElementRole.SeriesSource,
  [MatchSide.Load]: ElementRole.SeriesLoad,
}

/** One signed reactance in a matching network (positive = inductive). */
export interface MatchElement {
  role: ElementRole
  reactance: number
}

/** A designed matching network: ordered elements per solution. */
export interface MatchDesign {
  topology: MatchTopology
  qualityFactor: number
  solutions: MatchElement[][]
}

/**
 * Design a pi network matching two real resistances with a specified Q.
 * Formulas (Bowick): with Rs < Rl and Q > QL = √(Rl/Rs − 1):
 *   Rint = Rs/(1+Q²); Xp1 = Rs/Q; Q2 = √(Rl/Rint − 1);
 *   Xp2 = Rl/Q2; Xs = Rint·(Q + Q2).
 */
export function piNetworkMatch(sourceImpedance: number, loadImpedance: number, qualityFactor: number): MatchElement[][] {
  const [small, large, flipped] = sourceImpedance <= loadImpedance
    ? [sourceImpedance, loadImpedance, false]
    : [loadImpedance, sourceImpedance, true]
  const minimumQ = Math.sqrt(large / small - 1)
  if (qualityFactor <= minimumQ) {
    throw new Error(`pi network: qualityFactor ${qualityFactor} must exceed the L-network minimum ${minimumQ.toFixed(3)}`)
  }
  const q = qualityFactor
  const rint = small / (1 + q * q)
  const q2 = Math.sqrt(large / rint - 1)
  const xp1 = small / q
  const xp2 = large / q2
  const xs = rint * (q + q2)
  const shuntSource = flipped ? ElementRole.ShuntLoad : ElementRole.ShuntSource
  const shuntLoad = flipped ? ElementRole.ShuntSource : ElementRole.ShuntLoad
  return [
    [
      { role: shuntSource, reactance: -xp1 },
      { role: ElementRole.Series, reactance: xs },
      { role: shuntLoad, reactance: -xp2 },
    ],
    [
      { role: shuntSource, reactance: xp1 },
      { role: ElementRole.Series, reactance: -xs },
      { role: shuntLoad, reactance: xp2 },
    ],
  ]
}

/**
 * Design a T network matching two real resistances with a specified Q.
 *
 * A T network is two back-to-back L networks sharing an intermediate
 * resistance Rp (Rs → Rp step-up, then Rp → Rl step-down). The two shunt
 * elements sit at the same junction and merge into one:
 *   Q1 = √(Rp/Rs − 1), Q2 = √(Rp/Rl − 1), Q = Q1 + Q2
 * Rp is solved implicitly from the specified Q (bisection), then:
 *   Xs1 = Q1·Rs; Xs2 = Q2·Rl; Xp = Rp/Q.
 */
export function tNetworkMatch(sourceImpedance: number, loadImpedance: number, qualityFactor: number): MatchElement[][] {
  const [small, large, flipped] = sourceImpedance <= loadImpedance
    ? [sourceImpedance, loadImpedance, false]
    : [loadImpedance, sourceImpedance, true]
  const minimumQ = Math.sqrt(large / small - 1)
  if (qualityFactor <= minimumQ) {
    throw new Error(`t network: qualityFactor ${qualityFactor} must exceed the L-network minimum ${minimumQ.toFixed(3)}`)
  }
  // Solve √(Rp/small − 1) + √(Rp/large − 1) = qualityFactor for Rp.
  const target = (rp: number) => Math.sqrt(rp / small - 1) + Math.sqrt(rp / large - 1) - qualityFactor
  let lower = large
  let upper = large
  while (target(upper) < 0) upper *= 2
  for (let i = 0; i < 80; i++) {
    const mid = (lower + upper) / 2
    if (target(mid) < 0) lower = mid
    else upper = mid
  }
  const rp = (lower + upper) / 2
  const q1 = Math.sqrt(rp / small - 1)
  const q2 = Math.sqrt(rp / large - 1)
  const xs1 = q1 * small
  const xs2 = q2 * large
  const xp = rp / qualityFactor
  const seriesSource = flipped ? ElementRole.SeriesLoad : ElementRole.SeriesSource
  const seriesLoad = flipped ? ElementRole.SeriesSource : ElementRole.SeriesLoad
  return [
    [
      { role: seriesSource, reactance: xs1 },
      { role: ElementRole.ShuntSource, reactance: -xp },
      { role: seriesLoad, reactance: xs2 },
    ],
    [
      { role: seriesSource, reactance: -xs1 },
      { role: ElementRole.ShuntSource, reactance: xp },
      { role: seriesLoad, reactance: -xs2 },
    ],
  ]
}

/** Design any supported matching topology; 'l' uses the implied Q, 'pi'/'t' need a specified Q. */
export function designMatch(
  topology: MatchTopology,
  sourceImpedance: number,
  loadImpedance: number,
  frequency: number,
  qualityFactor?: number,
): MatchDesign {
  if (sourceImpedance <= 0 || loadImpedance <= 0) throw new Error('impedances must be positive (Ω)')
  if (frequency <= 0) throw new Error('frequency must be positive (Hz)')
  if (sourceImpedance === loadImpedance) {
    throw new Error('source and load are already equal — no network needed')
  }
  switch (topology) {
    case MatchTopology.Pi: {
      if (qualityFactor === undefined) throw new Error('pi network requires a qualityFactor')
      return { topology, qualityFactor, solutions: piNetworkMatch(sourceImpedance, loadImpedance, qualityFactor) }
    }
    case MatchTopology.T: {
      if (qualityFactor === undefined) throw new Error('t network requires a qualityFactor')
      return { topology, qualityFactor, solutions: tNetworkMatch(sourceImpedance, loadImpedance, qualityFactor) }
    }
    case MatchTopology.L: {
      const result = lNetworkMatch(sourceImpedance, loadImpedance, frequency)
      if (result.matched) throw new Error('source and load are already equal — no network needed')
      const shuntRole = SHUNT_ROLE[result.shuntSide]
      const seriesRole = SERIES_ROLE[result.seriesSide]
      const solutions: MatchElement[][] = result.solutions!.map((solution) => [
        { role: seriesRole, reactance: solution.seriesReactance },
        { role: shuntRole, reactance: solution.shuntReactance },
      ])
      return { topology, qualityFactor: result.qualityFactor!, solutions }
    }
  }
}
