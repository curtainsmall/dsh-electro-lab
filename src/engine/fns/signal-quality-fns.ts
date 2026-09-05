/**
 * Signal-quality fns (migrated from tools/signal-quality-tools.ts): THD,
 * clock-jitter SNR ceiling, and the combined ADC noise budget. Kinds mirror
 * the old tool declarations (thd is a fraction → none, SNR values → log).
 */
import { calcAdcBudget, calcJitterSnr, calcThd } from '../../math/signal-quality.ts'
import { toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

export const signalQualityFns: FnDef[] = [
  {
    id: 'thd',
    summary: 'Total harmonic distortion of a sampled signal (fraction plus dB)',
    parameters: {
      samples: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      harmonics: { type: 'quantity', kind: QuantityKind.None, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        thd: { type: 'quantity', kind: QuantityKind.None },
        thdDb: { type: 'quantity', kind: QuantityKind.Log },
        fundamental: { type: 'quantity', kind: QuantityKind.None },
        harmonicAmplitudes: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const samples = (args.samples as ValuePayload[]).map((sample) => toScalar(sample))
      const harmonics = (args.harmonics as number | undefined) ?? 10
      const result = calcThd(samples, harmonics)
      return {
        thd: result.thd,
        thdDb: result.thd === 0 ? -300 : result.thdDb,
        fundamental: result.fundamental,
        harmonicAmplitudes: result.harmonicAmplitudes,
      }
    },
  },
  {
    id: 'jitter_snr',
    summary: 'SNR ceiling set by sampling-clock jitter',
    parameters: {
      signalFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
      jitter: { type: 'quantity', kind: QuantityKind.Time },
    },
    returns: {
      type: 'object',
      fields: {
        snrDb: { type: 'quantity', kind: QuantityKind.Log },
      },
    },
    run: (args) => {
      const snrDb = calcJitterSnr(
        toScalar(args.signalFrequency as ValuePayload),
        toScalar(args.jitter as ValuePayload),
      )
      return { snrDb }
    },
  },
  {
    id: 'adc_budget',
    summary: 'ADC noise budget: quantization, jitter and optional thermal SNR into a total SNR and ENOB',
    parameters: {
      bits: { type: 'quantity', kind: QuantityKind.None },
      signalFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
      jitter: { type: 'quantity', kind: QuantityKind.Time },
      thermalSnrDb: { type: 'quantity', kind: QuantityKind.Log, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        snrQuantizationDb: { type: 'quantity', kind: QuantityKind.Log },
        snrJitterDb: { type: 'quantity', kind: QuantityKind.Log },
        snrTotalDb: { type: 'quantity', kind: QuantityKind.Log },
        enob: { type: 'quantity', kind: QuantityKind.None },
      },
    },
    run: (args) => {
      const result = calcAdcBudget(
        args.bits as number,
        toScalar(args.signalFrequency as ValuePayload),
        toScalar(args.jitter as ValuePayload),
        args.thermalSnrDb === undefined ? undefined : toScalar(args.thermalSnrDb as ValuePayload),
      )
      return {
        snrQuantizationDb: result.snrQuantizationDb,
        snrJitterDb: result.snrJitterDb,
        snrTotalDb: result.snrTotalDb,
        enob: result.enob,
      }
    },
  },
]
