/**
 * Noise tools: thermal noise, cascaded noise figure (Friis), quantization
 * SNR. IO is JSON-and-complex-only.
 */
import { calcCascadeNoiseFigure, calcQuantizationSnr, calcThermalNoisePower } from '../math/noise.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

const dbArrayParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: createValueParam(QuantityKind.Log, 'dB value'),
})

export const noiseTools = [
  defineJsonTool({
    name: 'thermal_noise',
    description: 'Thermal (Johnson) noise power in a bandwidth: P = k·T·B (k = 1.380649e−23 J/K). Returns watts. At 290 K in 1 MHz ≈ 4.0e−15 W.',
    returns: {
      type: 'object',
      fields: {
        temperature: { type: 'number', kind: QuantityKind.None },
        bandwidth: { type: 'number', kind: QuantityKind.Frequency },
        noisePowerWatts: { type: 'number', kind: QuantityKind.Power },
      },
    },
    parameters: {
      temperature: { ...createValueParam(QuantityKind.None, 'temperature in kelvin'), required: true },
      bandwidth: { ...createValueParam(QuantityKind.Frequency, 'bandwidth in Hz'), required: true },
    },
    execute: (args) => {
      const temperature = toScalar(args.temperature)
      const bandwidth = toScalar(args.bandwidth)
      const watts = calcThermalNoisePower(temperature, bandwidth)
      const out: Record<string, JsonValue> = {
        temperature: serializeReal(temperature, QuantityKind.None),
        bandwidth: serializeReal(bandwidth, QuantityKind.Frequency),
        noisePowerWatts: serializeReal(watts, QuantityKind.Power),
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'cascade_noise_figure',
    description: 'Total noise figure of cascaded stages (Friis formula) from per-stage noise figures and gains in dB: F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + … First stage dominates; later stages contribute less when earlier gains are high.',
    returns: {
      type: 'object',
      fields: {
        totalNoiseFigureDb: { type: 'number', kind: QuantityKind.Log },
      },
    },
    parameters: {
      noiseFigureDb: { ...dbArrayParam('per-stage noise figures in dB, first stage first'), required: true },
      gainDb: { ...dbArrayParam('per-stage gains in dB, first stage first'), required: true },
    },
    execute: (args) => {
      const noiseFigureDb = args.noiseFigureDb.map((value) => toScalar(value))
      const gainDb = args.gainDb.map((value) => toScalar(value))
      return {
        totalNoiseFigureDb: serializeReal(calcCascadeNoiseFigure(noiseFigureDb, gainDb), QuantityKind.Log),
      }
    },
  }),
  defineJsonTool({
    name: 'quantization_noise',
    description: 'Ideal SNR of a uniform quantizer: SNR = 6.02·N + 1.76 dB (N-bit ADC/DAC). 16 bits → ≈ 98 dB.',
    returns: {
      type: 'object',
      fields: {
        snrDb: { type: 'number', kind: QuantityKind.Log },
      },
    },
    parameters: {
      bits: { type: 'integer', description: 'quantizer resolution in bits', required: true },
    },
    execute: (args) => {
      return {
        snrDb: serializeReal(calcQuantizationSnr(args.bits), QuantityKind.Log),
      }
    },
  }),
]
