/**
 * filter_design — Butterworth low-pass ladder design in one call.
 */
import { ToolError } from '../tool.ts'
import { calcButterworthAttenuation, designButterworthLowpass } from '../math/filter.ts'
import { ElementKind } from '../math/circuits.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from '../tool.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const filterTool = defineJsonTool({
  name: 'filter_design',
  description: 'Design a Butterworth low-pass ladder filter: order, cutoffFrequency, and equal source/load resistance give the element list (series inductors, shunt capacitors) plus attenuation checks. queryFrequency (optional) returns the attenuation at that frequency.',
  returns: {
    type: 'object',
    fields: {
      response: { type: 'string' },
      kind: { type: 'string' },
      order: { type: 'number', kind: QuantityKind.None },
      cutoffFrequency: { type: 'number', kind: QuantityKind.Frequency },
      resistance: { type: 'number', kind: QuantityKind.Resistance },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          fields: {
            role: { type: 'string' },
            kind: { type: 'string' },
            // element.value is serializeReal'd with the element's own kind
            // (inductance for series L, capacitance for shunt C) — no single
            // QuantityKind covers both, so the leaf stays untagged.
            value: { type: 'any' },
          },
        },
      },
      attenuationAtCutoffDb: { type: 'number', kind: QuantityKind.Log },
      attenuationAtQueryDb: { type: 'number', kind: QuantityKind.Log },
    },
  },
  parameters: {
    order: { type: 'integer', description: 'filter order (≥ 1)', required: true },
    cutoffFrequency: { ...createValueParam(QuantityKind.Frequency, 'cutoff frequency (−3 dB point)'), required: true },
    resistance: { ...createValueParam(QuantityKind.Resistance, 'source/load termination resistance'), required: true },
    queryFrequency: { ...createValueParam(QuantityKind.Frequency, 'frequency to evaluate attenuation at') },
  },
  execute: (args) => {
    const order = args.order
    const cutoffFrequency = toScalar(args.cutoffFrequency)
    const resistance = toScalar(args.resistance)
    const elements = designButterworthLowpass(order, cutoffFrequency, resistance)
    const out: Record<string, JsonValue> = {
      response: 'lowpass',
      kind: 'butterworth',
      order,
      cutoffFrequency: serializeReal(cutoffFrequency, QuantityKind.Frequency),
      resistance: serializeReal(resistance, QuantityKind.Resistance),
      elements: elements.map((element) => {
        let kind: QuantityKind
        switch (element.kind) {
          case ElementKind.Inductance:
            kind = QuantityKind.Inductance
            break
          case ElementKind.Capacitance:
            kind = QuantityKind.Capacitance
            break
          default:
            throw new ToolError(`unexpected filter element kind "${element.kind}"`)
        }
        return {
          role: element.role,
          kind: element.kind,
          value: serializeReal(element.value, kind),
        }
      }),
      attenuationAtCutoffDb: serializeReal(calcButterworthAttenuation(order, cutoffFrequency, cutoffFrequency), QuantityKind.Log),
    }
    if (args.queryFrequency !== undefined) {
      const queryFrequency = toScalar(args.queryFrequency)
      out.attenuationAtQueryDb = serializeReal(calcButterworthAttenuation(order, cutoffFrequency, queryFrequency), QuantityKind.Log)
    }
    return out
  },
})
