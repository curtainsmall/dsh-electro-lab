/**
 * Signal-quality tools: THD, jitter SNR and the ADC noise budget.
 * IO is JSON-and-complex-only.
 */
import { calcAdcBudget, calcJitterSnr, calcThd } from '../math/signal-quality.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from '../tool.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const signalQualityTools = [
  defineJsonTool({
    name: 'thd',
    description: 'Total harmonic distortion of a sampled signal: √(Σ harmonic²)/fundamental, with the fundamental taken as the dominant non-DC DFT bin and harmonics at 2f₀..harmonics·f₀ (harmonics alias back via spectral folding, so the result is independent of which mirror peak is picked). thd is a fraction (0.05 = 5 %); thdDb is 20·log10(thd), floored at −300 dB when no harmonics are present (JSON cannot carry −Infinity).',
    returns: {
      type: 'object',
      fields: {
        thd: { type: 'number', kind: QuantityKind.None },
        thdDb: { type: 'number', kind: QuantityKind.Log },
        fundamental: { type: 'number', kind: QuantityKind.None },
        harmonicAmplitudes: { type: 'array', items: { type: 'number', kind: QuantityKind.None } },
      },
    },
    parameters: {
      samples: {
        type: 'array',
        description: 'time-domain samples, kind none',
        required: true,
        items: createValueParam(QuantityKind.None, 'value (kind none)'),
      },
      harmonics: { type: 'integer', description: 'harmonics to include, starting at 2nd (default 10)' },
    },
    execute: (args): Record<string, JsonValue> => {
      const samples = args.samples.map((sample) => toScalar(sample))
      const harmonics = args.harmonics ?? 10
      const result = calcThd(samples, harmonics)
      return {
        thd: serializeReal(result.thd, QuantityKind.None),
        thdDb: serializeReal(result.thd === 0 ? -300 : result.thdDb, QuantityKind.Log),
        fundamental: serializeReal(result.fundamental, QuantityKind.None),
        harmonicAmplitudes: result.harmonicAmplitudes.map((amplitude) => serializeReal(amplitude, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'jitter_snr',
    description: 'SNR ceiling set by sampling-clock jitter: SNR = −20·log10(2π·f·tⱼ) dB, with signal frequency f and RMS jitter tⱼ. Higher frequency or jitter lowers the ceiling; independent of the quantizer.',
    returns: {
      type: 'object',
      fields: {
        snrDb: { type: 'number', kind: QuantityKind.Log },
      },
    },
    parameters: {
      signalFrequency: { ...createValueParam(QuantityKind.Frequency, 'signal frequency'), required: true },
      jitter: { ...createValueParam(QuantityKind.Time, 'RMS clock jitter'), required: true },
    },
    execute: (args): Record<string, JsonValue> => {
      const snrDb = calcJitterSnr(
        toScalar(args.signalFrequency),
        toScalar(args.jitter),
      )
      return { snrDb: serializeReal(snrDb, QuantityKind.Log) }
    },
  }),
  defineJsonTool({
    name: 'adc_budget',
    description: 'Complete ADC noise budget in one call: quantization SNR (6.02·N + 1.76 dB), jitter SNR (−20·log10(2π·f·tⱼ)) and an optional thermal SNR (signal-dependent, supply it from thermal_noise against your signal level). Noise powers add linearly and the total is reported as snrTotalDb with ENOB = (snrTotalDb − 1.76)/6.02.',
    returns: {
      type: 'object',
      fields: {
        snrQuantizationDb: { type: 'number', kind: QuantityKind.Log },
        snrJitterDb: { type: 'number', kind: QuantityKind.Log },
        snrTotalDb: { type: 'number', kind: QuantityKind.Log },
        enob: { type: 'number', kind: QuantityKind.None },
        snrThermalDb: { type: 'number', kind: QuantityKind.Log },
      },
    },
    parameters: {
      bits: { type: 'integer', description: 'quantizer resolution in bits', required: true },
      signalFrequency: { ...createValueParam(QuantityKind.Frequency, 'signal frequency'), required: true },
      jitter: { ...createValueParam(QuantityKind.Time, 'RMS clock jitter'), required: true },
      thermalSnrDb: { ...createValueParam(QuantityKind.Log, 'thermal SNR contribution in dB (optional)') },
    },
    execute: (args): Record<string, JsonValue> => {
      const result = calcAdcBudget(
        args.bits,
        toScalar(args.signalFrequency),
        toScalar(args.jitter),
        args.thermalSnrDb === undefined ? undefined : toScalar(args.thermalSnrDb),
      )
      const out: Record<string, JsonValue> = {
        snrQuantizationDb: serializeReal(result.snrQuantizationDb, QuantityKind.Log),
        snrJitterDb: serializeReal(result.snrJitterDb, QuantityKind.Log),
        snrTotalDb: serializeReal(result.snrTotalDb, QuantityKind.Log),
        enob: serializeReal(result.enob, QuantityKind.None),
      }
      if (result.snrThermalDb !== undefined) out.snrThermalDb = serializeReal(result.snrThermalDb, QuantityKind.Log)
      return out
    },
  }),
]
