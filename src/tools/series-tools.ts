/**
 * Series tools: arithmetic, geometric and power sums in one tool with a
 * kind discriminator. IO is JSON-and-complex-only.
 */
import { PowerSumKind, calcArithmeticSeries, calcGeometricSeries, calcPowerSum } from '../math/series.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const seriesTools = [
  defineJsonTool({
    name: 'series_sum',
    description: 'Sum of a number sequence by kind. arithmetic: a₁, commonDifference and count → sum n·(a₁+aₙ)/2 plus lastTerm. geometric: a₁, commonRatio and count → sum a₁(1−rⁿ)/(1−r) plus lastTerm; with infinite: true the convergent infinite sum a₁/(1−r) (requires |r| < 1, diverging input errors). power: power (linear|square|cube) and count → Σk, Σk² or Σk³ over the first n natural numbers.',
    returns: {
      type: 'object',
      fields: {
        kind: { type: 'string' },
        power: { type: 'string' },
        sum: { type: 'number', kind: QuantityKind.None },
        lastTerm: { type: 'number', kind: QuantityKind.None },
        converges: { type: 'boolean' },
      },
    },
    parameters: {
      kind: { type: 'string', enum: ['arithmetic', 'geometric', 'power'], description: 'series kind', required: true },
      firstTerm: { ...createValueParam(QuantityKind.None, 'first term a₁ (arithmetic, geometric)') },
      commonDifference: { ...createValueParam(QuantityKind.None, 'common difference d (arithmetic)') },
      commonRatio: { ...createValueParam(QuantityKind.None, 'common ratio r (geometric)') },
      count: { type: 'integer', description: 'number of terms n (not used for an infinite geometric sum)' },
      infinite: { type: 'boolean', description: 'geometric: evaluate the infinite sum (requires |r| < 1)' },
      power: { type: 'string', enum: [PowerSumKind.Linear, PowerSumKind.Square, PowerSumKind.Cube], description: 'power exponent (power kind)' },
    },
    execute: (args): Record<string, JsonValue> => {
      switch (args.kind) {
        case 'arithmetic': {
          if (args.firstTerm === undefined || args.commonDifference === undefined || args.count === undefined) {
            throw new Error('arithmetic requires firstTerm, commonDifference and count')
          }
          const { sum, lastTerm } = calcArithmeticSeries(
            toScalar(args.firstTerm, QuantityKind.None),
            toScalar(args.commonDifference, QuantityKind.None),
            args.count,
          )
          return { kind: args.kind, sum: serializeReal(sum, QuantityKind.None), lastTerm: serializeReal(lastTerm, QuantityKind.None) }
        }
        case 'geometric': {
          if (args.firstTerm === undefined || args.commonRatio === undefined) {
            throw new Error('geometric requires firstTerm and commonRatio')
          }
          const firstTerm = toScalar(args.firstTerm, QuantityKind.None)
          const commonRatio = toScalar(args.commonRatio, QuantityKind.None)
          const infinite = args.infinite ?? false
          if (!infinite && args.count === undefined) throw new Error('geometric requires count unless infinite is true')
          const result = calcGeometricSeries(firstTerm, commonRatio, args.count ?? 1, infinite)
          const out: Record<string, JsonValue> = { kind: args.kind, sum: serializeReal(result.sum, QuantityKind.None) }
          if (result.lastTerm !== undefined) out.lastTerm = serializeReal(result.lastTerm, QuantityKind.None)
          if (result.converges !== undefined) out.converges = result.converges
          return out
        }
        case 'power': {
          if (args.power === undefined || args.count === undefined) {
            throw new Error('power requires power and count')
          }
          const { sum } = calcPowerSum(args.power, args.count)
          return { kind: args.kind, power: args.power, sum: serializeReal(sum, QuantityKind.None) }
        }
        default:
          // unreachable: the framework schema restricts kind to the three values above
          throw new Error(`unknown series kind "${args.kind}"`)
      }
    },
  }),
]
