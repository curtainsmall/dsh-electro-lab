/**
 * Noise tools: thermal noise, cascaded noise figure (Friis), quantization
 * SNR. IO is JSON-and-complex-only.
 */
import { calcCascadeNoiseFigure, calcQuantizationSnr, calcThermalNoisePower } from '../math/noise.ts'
import { convertDbLevels, DbUnit } from '../math/db.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

const dbArrayParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: createValueParam(Unit.Log, 'dB value'),
})

export const noiseTools = [
  defineJsonTool({
    name: 'thermal_noise',
    description: 'Thermal (Johnson) noise power in a bandwidth: P = k·T·B (k = 1.380649e−23 J/K). Returns watts and dBm. At 290 K in 1 MHz: −114 dBm (textbook floor).',
    parameters: {
      temperature: { ...createValueParam(Unit.None, 'temperature in kelvin'), required: true },
      bandwidth: { ...createValueParam(Unit.Frequency, 'bandwidth in Hz'), required: true },
    },
    execute: (args) => {
      const temperature = toScalar(args.temperature, Unit.None)
      const bandwidth = toScalar(args.bandwidth, Unit.Frequency)
      const watts = calcThermalNoisePower(temperature, bandwidth)
      const out: Record<string, JsonValue> = {
        temperature: serializeReal(temperature, Unit.None),
        bandwidth: serializeReal(bandwidth, Unit.Frequency),
        noisePowerWatts: serializeReal(watts, Unit.Power),
      }
      out.noisePowerDbm = serializeReal(convertDbLevels(watts, DbUnit.Watt, 50).dbm, Unit.Log)
      return out
    },
  }),
  defineJsonTool({
    name: 'cascade_noise_figure',
    description: 'Total noise figure of cascaded stages (Friis formula) from per-stage noise figures and gains in dB: F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + … First stage dominates; later stages contribute less when earlier gains are high.',
    parameters: {
      noiseFigureDb: { ...dbArrayParam('per-stage noise figures in dB, first stage first'), required: true },
      gainDb: { ...dbArrayParam('per-stage gains in dB, first stage first'), required: true },
    },
    execute: (args) => {
      const noiseFigureDb = args.noiseFigureDb.map((value) => toScalar(value, Unit.Log))
      const gainDb = args.gainDb.map((value) => toScalar(value, Unit.Log))
      return {
        totalNoiseFigureDb: serializeReal(calcCascadeNoiseFigure(noiseFigureDb, gainDb), Unit.Log),
      }
    },
  }),
  defineJsonTool({
    name: 'quantization_noise',
    description: 'Ideal SNR of a uniform quantizer: SNR = 6.02·N + 1.76 dB (N-bit ADC/DAC). 16 bits → ≈ 98 dB.',
    parameters: {
      bits: { type: 'integer', description: 'quantizer resolution in bits', required: true },
    },
    execute: (args) => {
      return {
        snrDb: serializeReal(calcQuantizationSnr(args.bits), Unit.Log),
      }
    },
  }),
]
