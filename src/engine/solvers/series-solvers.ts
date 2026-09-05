/**
 * Series solvers (migrated from tools/series-tools.ts): series_sum with an
 * arithmetic / geometric / power kind discriminator.
 *
 * Engine object returns are closed and require every declared field, so the
 * old per-branch output shapes ({kind,sum,lastTerm} / {kind,sum,converges} /
 * {kind,power,sum}) are unified into the full five-key object: power is an
 * empty string when no exponent applies; converges is always truthful (finite
 * sums and a convergent infinite sum all converge — a diverging infinite
 * input errors inside the kernel); lastTerm is 0 for the convergent infinite
 * geometric case (the limit of its general term) and count^p for power sums
 * (the last summed term).
 */
import { PowerSumKind, calcArithmeticSeries, calcGeometricSeries, calcPowerSum } from '../../math/series.ts'
import { toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { SolverDef } from '../registry.ts'

/** Last summed term of a power sum Σk^p over the first n naturals = n^p. */
function powerLastTerm(power: PowerSumKind, count: number): number {
  const exponent = power === PowerSumKind.Linear ? 1 : power === PowerSumKind.Square ? 2 : 3
  return count ** exponent
}

export const seriesSolvers: SolverDef[] = [
  {
    id: 'series_sum',
    summary: 'Sum of a number sequence: arithmetic, geometric (finite or convergent infinite), or power sum',
    parameters: {
      kind: { type: 'string', enum: ['arithmetic', 'geometric', 'power'] },
      firstTerm: { type: 'quantity', kind: QuantityKind.None, optional: true },
      commonDifference: { type: 'quantity', kind: QuantityKind.None, optional: true },
      commonRatio: { type: 'quantity', kind: QuantityKind.None, optional: true },
      count: { type: 'quantity', kind: QuantityKind.None, optional: true },
      infinite: { type: 'boolean', optional: true },
      power: { type: 'string', enum: [PowerSumKind.Linear, PowerSumKind.Square, PowerSumKind.Cube], optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        kind: { type: 'string' },
        power: { type: 'string' },
        sum: { type: 'quantity', kind: QuantityKind.None },
        lastTerm: { type: 'quantity', kind: QuantityKind.None },
        converges: { type: 'boolean' },
      },
    },
    run: (args) => {
      const kind = args.kind as 'arithmetic' | 'geometric' | 'power'
      switch (kind) {
        case 'arithmetic': {
          const firstTerm = args.firstTerm as ValuePayload | undefined
          const commonDifference = args.commonDifference as ValuePayload | undefined
          const count = args.count as number | undefined
          if (firstTerm === undefined || commonDifference === undefined || count === undefined) {
            throw new Error('arithmetic requires firstTerm, commonDifference and count')
          }
          const { sum, lastTerm } = calcArithmeticSeries(toScalar(firstTerm), toScalar(commonDifference), count)
          return { kind, power: '', sum, lastTerm, converges: true }
        }
        case 'geometric': {
          const firstTerm = args.firstTerm as ValuePayload | undefined
          const commonRatio = args.commonRatio as ValuePayload | undefined
          if (firstTerm === undefined || commonRatio === undefined) {
            throw new Error('geometric requires firstTerm and commonRatio')
          }
          const infinite = (args.infinite as boolean | undefined) ?? false
          const count = args.count as number | undefined
          if (!infinite && count === undefined) throw new Error('geometric requires count unless infinite is true')
          const result = calcGeometricSeries(toScalar(firstTerm), toScalar(commonRatio), count ?? 1, infinite)
          return {
            kind,
            power: '',
            sum: result.sum,
            lastTerm: result.lastTerm ?? 0,
            converges: result.converges ?? true,
          }
        }
        case 'power': {
          const power = args.power as PowerSumKind | undefined
          const count = args.count as number | undefined
          if (power === undefined || count === undefined) throw new Error('power requires power and count')
          const { sum } = calcPowerSum(power, count)
          return { kind, power, sum, lastTerm: powerLastTerm(power, count), converges: true }
        }
      }
    },
  },
]
