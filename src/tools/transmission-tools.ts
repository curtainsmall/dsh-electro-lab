/**
 * Transmission-line tools: wavelength, coaxial characterization, and
 * rise-time/bandwidth conversion. IO is JSON-and-complex-only.
 */
import {
  calcBandwidthFromRiseTime,
  calcCoaxialParameters,
  calcRiseTimeFromBandwidth,
  calcWavelength,
} from '../math/transmission.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const transmissionTools = [
  defineJsonTool({
    name: 'wavelength_frequency',
    description: 'Wavelength from frequency (or the reverse is implied): λ = c·velocityFactor/f with c = 299792458 m/s. velocityFactor < 1 for a medium (cable dielectric, 0.66 typical). At 300 MHz in vacuum: 1 m.',
    returns: {
      type: 'object',
      fields: {
        frequency: { type: 'number', kind: QuantityKind.Frequency },
        velocityFactor: { type: 'number', kind: QuantityKind.None },
        wavelength: { type: 'number', kind: QuantityKind.None },
      },
    },
    parameters: {
      frequency: { ...createValueParam(QuantityKind.Frequency, 'frequency in Hz'), required: true },
      velocityFactor: { ...createValueParam(QuantityKind.None, 'velocity factor (default 1)') },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, QuantityKind.Frequency)
      const velocityFactor = args.velocityFactor === undefined ? 1 : toScalar(args.velocityFactor, QuantityKind.None)
      return {
        frequency: serializeReal(frequency, QuantityKind.Frequency),
        velocityFactor: serializeReal(velocityFactor, QuantityKind.None),
        wavelength: serializeReal(calcWavelength(frequency, velocityFactor), QuantityKind.None),
      }
    },
  }),
  defineJsonTool({
    name: 'coaxial_parameters',
    description: 'Coaxial-line characterization from geometry: Z₀ = (138/√εr)·log₁₀(D/d), velocityFactor = 1/√εr, capacitance and inductance per meter (C′ = 1/(vf·c·Z₀), L′ = Z₀/(vf·c)). Example: d = 1 mm, D = 3.58 mm, εr = 2.25 → ≈ 50 Ω, vf 0.667, ≈ 98 pF/m, ≈ 254 nH/m.',
    returns: {
      type: 'object',
      fields: {
        impedance: { type: 'number', kind: QuantityKind.Resistance },
        velocityFactor: { type: 'number', kind: QuantityKind.None },
        capacitancePerMeter: { type: 'number', kind: QuantityKind.Capacitance },
        inductancePerMeter: { type: 'number', kind: QuantityKind.Inductance },
      },
    },
    parameters: {
      innerDiameter: { ...createValueParam(QuantityKind.None, 'inner (center conductor) diameter in meters'), required: true },
      outerDiameter: { ...createValueParam(QuantityKind.None, 'outer (shield) diameter in meters'), required: true },
      relativePermittivity: { ...createValueParam(QuantityKind.None, 'dielectric relative permittivity'), required: true },
    },
    execute: (args) => {
      const innerDiameter = toScalar(args.innerDiameter, QuantityKind.None)
      const outerDiameter = toScalar(args.outerDiameter, QuantityKind.None)
      const relativePermittivity = toScalar(args.relativePermittivity, QuantityKind.None)
      const result = calcCoaxialParameters(innerDiameter, outerDiameter, relativePermittivity)
      const out: Record<string, JsonValue> = {
        impedance: serializeReal(result.impedance, QuantityKind.Resistance),
        velocityFactor: serializeReal(result.velocityFactor, QuantityKind.None),
      }
      out.capacitancePerMeter = serializeReal(result.capacitancePerMeter, QuantityKind.Capacitance)
      out.inductancePerMeter = serializeReal(result.inductancePerMeter, QuantityKind.Inductance)
      return out
    },
  }),
  defineJsonTool({
    name: 'rise_time_bandwidth',
    description: 'Convert between rise time and bandwidth: tr ≈ 0.35/BW. Provide exactly one of bandwidth or riseTime; the other is returned.',
    returns: {
      type: 'object',
      fields: {
        bandwidth: { type: 'number', kind: QuantityKind.Frequency },
        riseTime: { type: 'number', kind: QuantityKind.Time },
      },
    },
    parameters: {
      bandwidth: { ...createValueParam(QuantityKind.Frequency, 'bandwidth in Hz (−3 dB)') },
      riseTime: { ...createValueParam(QuantityKind.Time, 'rise time in seconds (10–90 %)') },
    },
    execute: (args) => {
      const bandwidth = args.bandwidth === undefined ? undefined : toScalar(args.bandwidth, QuantityKind.Frequency)
      const riseTime = args.riseTime === undefined ? undefined : toScalar(args.riseTime, QuantityKind.Time)
      if ((bandwidth === undefined) === (riseTime === undefined)) {
        throw new Error('provide exactly one of bandwidth or riseTime')
      }
      const out: Record<string, JsonValue> = {}
      if (bandwidth !== undefined) {
        out.bandwidth = serializeReal(bandwidth, QuantityKind.Frequency)
        out.riseTime = serializeReal(calcRiseTimeFromBandwidth(bandwidth), QuantityKind.Time)
      } else {
        out.bandwidth = serializeReal(calcBandwidthFromRiseTime(riseTime!), QuantityKind.Frequency)
        out.riseTime = serializeReal(riseTime!, QuantityKind.Time)
      }
      return out
    },
  }),
]
