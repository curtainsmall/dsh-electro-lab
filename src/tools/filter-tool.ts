/**
 * filter_design — Butterworth low-pass ladder design in one call.
 */
import { calcButterworthAttenuation, designButterworthLowpass } from '../math/filter.ts'
import { ElementKind } from '../math/circuits.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const filterTool = defineJsonTool({
  name: 'filter_design',
  description: 'Design a Butterworth low-pass ladder filter: order, cutoffFrequency, and equal source/load resistance give the element list (series inductors, shunt capacitors) plus attenuation checks. queryFrequency (optional) returns the attenuation at that frequency.',
  parameters: {
    order: { type: 'integer', description: 'filter order (≥ 1)', required: true },
    cutoffFrequency: { ...createValueParam(Unit.Frequency, 'cutoff frequency (−3 dB point)'), required: true },
    resistance: { ...createValueParam(Unit.Resistance, 'source/load termination resistance'), required: true },
    queryFrequency: { ...createValueParam(Unit.Frequency, 'frequency to evaluate attenuation at') },
  },
  execute: (args) => {
    const order = args.order
    const cutoffFrequency = toScalar(args.cutoffFrequency, Unit.Frequency)
    const resistance = toScalar(args.resistance, Unit.Resistance)
    const elements = designButterworthLowpass(order, cutoffFrequency, resistance)
    const out: Record<string, JsonValue> = {
      response: 'lowpass',
      kind: 'butterworth',
      order,
      cutoffFrequency: serializeReal(cutoffFrequency, Unit.Frequency),
      resistance: serializeReal(resistance, Unit.Resistance),
      elements: elements.map((element) => {
        let unit: Unit
        switch (element.kind) {
          case ElementKind.Inductance:
            unit = Unit.Inductance
            break
          case ElementKind.Capacitance:
            unit = Unit.Capacitance
            break
          default:
            throw new Error(`unexpected filter element kind "${element.kind}"`)
        }
        return {
          role: element.role,
          kind: element.kind,
          value: serializeReal(element.value, unit),
        }
      }),
      attenuationAtCutoffDb: serializeReal(calcButterworthAttenuation(order, cutoffFrequency, cutoffFrequency), Unit.Log),
    }
    if (args.queryFrequency !== undefined) {
      const queryFrequency = toScalar(args.queryFrequency, Unit.Frequency)
      out.attenuationAtQueryDb = serializeReal(calcButterworthAttenuation(order, cutoffFrequency, queryFrequency), Unit.Log)
    }
    return out
  },
})
