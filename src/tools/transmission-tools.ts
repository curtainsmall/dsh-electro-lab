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
import { Unit } from '../math/units.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const transmissionTools = [
  defineJsonTool({
    name: 'wavelength_frequency',
    description: 'Wavelength from frequency (or the reverse is implied): λ = c·velocityFactor/f with c = 299792458 m/s. velocityFactor < 1 for a medium (cable dielectric, 0.66 typical). At 300 MHz in vacuum: 1 m.',
    parameters: {
      frequency: { ...createValueParam(Unit.Frequency, 'frequency in Hz'), required: true },
      velocityFactor: { ...createValueParam(Unit.None, 'velocity factor (default 1)') },
    },
    execute: (args) => {
      const frequency = toScalar(args.frequency, Unit.Frequency)
      const velocityFactor = args.velocityFactor === undefined ? 1 : toScalar(args.velocityFactor, Unit.None)
      return {
        frequency: serializeReal(frequency, Unit.Frequency),
        velocityFactor: serializeReal(velocityFactor, Unit.None),
        wavelength: serializeReal(calcWavelength(frequency, velocityFactor), Unit.None),
      }
    },
  }),
  defineJsonTool({
    name: 'coaxial_parameters',
    description: 'Coaxial-line characterization from geometry: Z₀ = (138/√εr)·log₁₀(D/d), velocityFactor = 1/√εr, capacitance and inductance per meter (C′ = 1/(vf·c·Z₀), L′ = Z₀/(vf·c)). Example: d = 1 mm, D = 3.58 mm, εr = 2.25 → ≈ 50 Ω, vf 0.667, ≈ 98 pF/m, ≈ 254 nH/m.',
    parameters: {
      innerDiameter: { ...createValueParam(Unit.None, 'inner (center conductor) diameter in meters'), required: true },
      outerDiameter: { ...createValueParam(Unit.None, 'outer (shield) diameter in meters'), required: true },
      relativePermittivity: { ...createValueParam(Unit.None, 'dielectric relative permittivity'), required: true },
    },
    execute: (args) => {
      const innerDiameter = toScalar(args.innerDiameter, Unit.None)
      const outerDiameter = toScalar(args.outerDiameter, Unit.None)
      const relativePermittivity = toScalar(args.relativePermittivity, Unit.None)
      const result = calcCoaxialParameters(innerDiameter, outerDiameter, relativePermittivity)
      const out: Record<string, JsonValue> = {
        impedance: serializeReal(result.impedance, Unit.Resistance),
        velocityFactor: serializeReal(result.velocityFactor, Unit.None),
      }
      out.capacitancePerMeter = serializeReal(result.capacitancePerMeter, Unit.Capacitance)
      out.inductancePerMeter = serializeReal(result.inductancePerMeter, Unit.Inductance)
      return out
    },
  }),
  defineJsonTool({
    name: 'rise_time_bandwidth',
    description: 'Convert between rise time and bandwidth: tr ≈ 0.35/BW. Provide exactly one of bandwidth or riseTime; the other is returned.',
    parameters: {
      bandwidth: { ...createValueParam(Unit.Frequency, 'bandwidth in Hz (−3 dB)') },
      riseTime: { ...createValueParam(Unit.Time, 'rise time in seconds (10–90 %)') },
    },
    execute: (args) => {
      const bandwidth = args.bandwidth === undefined ? undefined : toScalar(args.bandwidth, Unit.Frequency)
      const riseTime = args.riseTime === undefined ? undefined : toScalar(args.riseTime, Unit.Time)
      if ((bandwidth === undefined) === (riseTime === undefined)) {
        throw new Error('provide exactly one of bandwidth or riseTime')
      }
      const out: Record<string, JsonValue> = {}
      if (bandwidth !== undefined) {
        out.bandwidth = serializeReal(bandwidth, Unit.Frequency)
        out.riseTime = serializeReal(calcRiseTimeFromBandwidth(bandwidth), Unit.Time)
      } else {
        out.bandwidth = serializeReal(calcBandwidthFromRiseTime(riseTime!), Unit.Frequency)
        out.riseTime = serializeReal(riseTime!, Unit.Time)
      }
      return out
    },
  }),
]
