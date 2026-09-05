/**
 * Transmission-line fns (migrated from tools/transmission-tools.ts):
 * wavelength, coaxial-line characterization, and rise-time/bandwidth
 * conversion. Kinds mirror the old tool declarations.
 */
import {
  calcBandwidthFromRiseTime,
  calcCoaxialParameters,
  calcRiseTimeFromBandwidth,
  calcWavelength,
} from '../../math/transmission.ts'
import { toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

export const transmissionFns: FnDef[] = [
  {
    id: 'wavelength_frequency',
    summary: 'Wavelength from frequency (velocity factor aware)',
    parameters: {
      frequency: { type: 'quantity', kind: QuantityKind.Frequency },
      velocityFactor: { type: 'quantity', kind: QuantityKind.None, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        frequency: { type: 'quantity', kind: QuantityKind.Frequency },
        velocityFactor: { type: 'quantity', kind: QuantityKind.None },
        wavelength: { type: 'quantity', kind: QuantityKind.None },
      },
    },
    run: (args) => {
      const frequency = toScalar(args.frequency as ValuePayload)
      const velocityFactor = args.velocityFactor === undefined ? 1 : toScalar(args.velocityFactor as ValuePayload)
      return {
        frequency,
        velocityFactor,
        wavelength: calcWavelength(frequency, velocityFactor),
      }
    },
  },
  {
    id: 'coaxial_parameters',
    summary: 'Coaxial-line characterization from geometry (impedance, velocity factor, per-meter C and L)',
    parameters: {
      innerDiameter: { type: 'quantity', kind: QuantityKind.None },
      outerDiameter: { type: 'quantity', kind: QuantityKind.None },
      relativePermittivity: { type: 'quantity', kind: QuantityKind.None },
    },
    returns: {
      type: 'object',
      fields: {
        impedance: { type: 'quantity', kind: QuantityKind.Resistance },
        velocityFactor: { type: 'quantity', kind: QuantityKind.None },
        capacitancePerMeter: { type: 'quantity', kind: QuantityKind.Capacitance },
        inductancePerMeter: { type: 'quantity', kind: QuantityKind.Inductance },
      },
    },
    run: (args) => {
      const innerDiameter = toScalar(args.innerDiameter as ValuePayload)
      const outerDiameter = toScalar(args.outerDiameter as ValuePayload)
      const relativePermittivity = toScalar(args.relativePermittivity as ValuePayload)
      const result = calcCoaxialParameters(innerDiameter, outerDiameter, relativePermittivity)
      return {
        impedance: result.impedance,
        velocityFactor: result.velocityFactor,
        capacitancePerMeter: result.capacitancePerMeter,
        inductancePerMeter: result.inductancePerMeter,
      }
    },
  },
  {
    id: 'rise_time_bandwidth',
    summary: 'Convert between rise time and bandwidth (tr ≈ 0.35/BW)',
    parameters: {
      bandwidth: { type: 'quantity', kind: QuantityKind.Frequency, optional: true },
      riseTime: { type: 'quantity', kind: QuantityKind.Time, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        bandwidth: { type: 'quantity', kind: QuantityKind.Frequency },
        riseTime: { type: 'quantity', kind: QuantityKind.Time },
      },
    },
    run: (args) => {
      const bandwidth = args.bandwidth === undefined ? undefined : toScalar(args.bandwidth as ValuePayload)
      const riseTime = args.riseTime === undefined ? undefined : toScalar(args.riseTime as ValuePayload)
      if ((bandwidth === undefined) === (riseTime === undefined)) {
        throw new Error('provide exactly one of bandwidth or riseTime')
      }
      return bandwidth !== undefined
        ? { bandwidth, riseTime: calcRiseTimeFromBandwidth(bandwidth) }
        : { bandwidth: calcBandwidthFromRiseTime(riseTime!), riseTime: riseTime! }
    },
  },
]
