/**
 * Context fn definitions migrated from src/tools/filter-tool.ts —
 * one FnDef for the legacy filter_design tool. run mirrors the old execute;
 * real results come back as plain numbers.
 *
 * Migration notes (documented deviations from the legacy tool surface):
 * - queryFrequency was optional in the legacy tool (attenuationAtQueryDb was
 *   then omitted). A context returns object has one exact shape per fn, so
 *   queryFrequency is required here and attenuationAtQueryDb is always
 *   present; pass the cutoff frequency as queryFrequency when only the design
 *   is wanted (both attenuation fields then report the −3 dB point).
 * - elements[].value is the series-inductance (H) or shunt-capacitance (F)
 *   magnitude; a context quantity has one fixed kind per field while the
 *   element kind alternates, so the magnitude is declared kind None and the
 *   unit is carried by the element kind string.
 */
import { designButterworthLowpass, calcButterworthAttenuation } from '../../math/filter.ts'
import { toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { FnDef } from '../registry.ts'

export const filterFns: FnDef[] = [
  {
    id: 'filter_design',
    summary: 'Design a Butterworth low-pass ladder: order, cutoffFrequency and equal source/load resistance give the element list (series inductors, shunt capacitors); attenuation in dB at the cutoff and at the query frequency',
    parameters: {
      order: { type: 'quantity', kind: QuantityKind.None },
      cutoffFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
      resistance: { type: 'quantity', kind: QuantityKind.Resistance },
      queryFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
    },
    returns: {
      type: 'object',
      fields: {
        response: { type: 'string' },
        kind: { type: 'string' },
        order: { type: 'quantity', kind: QuantityKind.None },
        cutoffFrequency: { type: 'quantity', kind: QuantityKind.Frequency },
        resistance: { type: 'quantity', kind: QuantityKind.Resistance },
        elements: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              role: { type: 'string' },
              kind: { type: 'string' },
              // magnitude: inductance (H) when kind is inductance, capacitance
              // (F) when kind is capacitance — see module header.
              value: { type: 'quantity', kind: QuantityKind.None },
            },
          },
        },
        attenuationAtCutoffDb: { type: 'quantity', kind: QuantityKind.Log },
        attenuationAtQueryDb: { type: 'quantity', kind: QuantityKind.Log },
      },
    },
    run: (args) => {
      const order = args.order as number
      const cutoffFrequency = toScalar(args.cutoffFrequency as ValuePayload)
      const resistance = toScalar(args.resistance as ValuePayload)
      const queryFrequency = toScalar(args.queryFrequency as ValuePayload)
      const elements = designButterworthLowpass(order, cutoffFrequency, resistance)
      return {
        response: 'lowpass',
        kind: 'butterworth',
        order,
        cutoffFrequency,
        resistance,
        elements: elements.map((element) => ({
          role: element.role,
          kind: element.kind,
          value: element.value,
        })),
        attenuationAtCutoffDb: calcButterworthAttenuation(order, cutoffFrequency, cutoffFrequency),
        attenuationAtQueryDb: calcButterworthAttenuation(order, cutoffFrequency, queryFrequency),
      }
    },
  },
]
