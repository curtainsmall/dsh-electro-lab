/**
 * Engine solver definitions migrated from src/tools/noise-tools.ts —
 * one SolverDef per legacy defineJsonTool. run bodies mirror the old executes
 * (SI base units; toScalar unwrapping preserved); real results come back as
 * plain numbers.
 */
import {
  calcCascadeNoiseFigure,
  calcQuantizationSnr,
  calcThermalNoisePower,
} from '../../math/noise.ts'
import { toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { SolverDef } from '../registry.ts'

export const noiseSolvers: SolverDef[] = [
  {
    id: 'thermal_noise',
    summary: 'Thermal (Johnson) noise power in a bandwidth: P = k·T·B (k = 1.380649e−23 J/K), temperature in kelvin; returns watts',
    parameters: {
      temperature: { type: 'quantity', kind: QuantityKind.None },
      bandwidth: { type: 'quantity', kind: QuantityKind.Frequency },
    },
    returns: {
      type: 'object',
      fields: {
        temperature: { type: 'quantity', kind: QuantityKind.None },
        bandwidth: { type: 'quantity', kind: QuantityKind.Frequency },
        noisePowerWatts: { type: 'quantity', kind: QuantityKind.Power },
      },
    },
    run: (args) => {
      const temperature = toScalar(args.temperature as ValuePayload)
      const bandwidth = toScalar(args.bandwidth as ValuePayload)
      const watts = calcThermalNoisePower(temperature, bandwidth)
      return { temperature, bandwidth, noisePowerWatts: watts }
    },
  },
  {
    id: 'cascade_noise_figure',
    summary: 'Total noise figure of cascaded stages (Friis) from per-stage noise figures and gains in dB: F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + …; first stage first in both arrays',
    parameters: {
      noiseFigureDb: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Log } },
      gainDb: { type: 'array', items: { type: 'quantity', kind: QuantityKind.Log } },
    },
    returns: {
      type: 'object',
      fields: {
        totalNoiseFigureDb: { type: 'quantity', kind: QuantityKind.Log },
      },
    },
    run: (args) => {
      const noiseFigureDb = (args.noiseFigureDb as ValuePayload[]).map((value) => toScalar(value))
      const gainDb = (args.gainDb as ValuePayload[]).map((value) => toScalar(value))
      return {
        totalNoiseFigureDb: calcCascadeNoiseFigure(noiseFigureDb, gainDb),
      }
    },
  },
  {
    id: 'quantization_noise',
    summary: 'Ideal SNR of a uniform quantizer in dB: SNR = 6.02·N + 1.76 (16 bits → ≈ 98 dB)',
    parameters: {
      bits: { type: 'quantity', kind: QuantityKind.None },
    },
    returns: {
      type: 'object',
      fields: {
        snrDb: { type: 'quantity', kind: QuantityKind.Log },
      },
    },
    run: (args) => {
      return {
        snrDb: calcQuantizationSnr(args.bits as number),
      }
    },
  },
]
