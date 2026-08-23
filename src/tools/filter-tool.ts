/**
 * filter_design — Butterworth low-pass ladder design in one call.
 */
import { butterworthAttenuation, butterworthLowpass } from '../math/filter.ts'
import { ElementKind } from '../math/circuits.ts'
import { toScalar, realValue } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const filterTool = defineJsonTool({
  name: 'filter_design',
  description: 'Design a Butterworth low-pass ladder filter: order, cutoffFrequency, and equal source/load resistance give the element list (series inductors, shunt capacitors) plus attenuation checks. queryFrequency (optional) returns the attenuation at that frequency.',
  parameters: {
    order: { type: 'integer', description: 'filter order (≥ 1)', required: true },
    cutoffFrequency: { ...valueParam(Unit.Frequency, 'cutoff frequency (−3 dB point)'), required: true },
    resistance: { ...valueParam(Unit.Resistance, 'source/load termination resistance'), required: true },
    queryFrequency: { ...valueParam(Unit.Frequency, 'frequency to evaluate attenuation at') },
  },
  execute: (args) => {
    const order = args.order
    const cutoffFrequency = toScalar(args.cutoffFrequency, Unit.Frequency)
    const resistance = toScalar(args.resistance, Unit.Resistance)
    const elements = butterworthLowpass(order, cutoffFrequency, resistance)
    const out: Record<string, JsonValue> = {
      response: 'lowpass',
      kind: 'butterworth',
      order,
      cutoffFrequency: realValue(cutoffFrequency, Unit.Frequency),
      resistance: realValue(resistance, Unit.Resistance),
      elements: elements.map((element) => ({
        role: element.role,
        kind: element.kind,
        value: realValue(element.value, element.kind === ElementKind.Inductance ? Unit.Inductance : Unit.Capacitance),
      })),
      attenuationAtCutoffDb: realValue(butterworthAttenuation(order, cutoffFrequency, cutoffFrequency), Unit.Log),
    }
    if (args.queryFrequency !== undefined) {
      const queryFrequency = toScalar(args.queryFrequency, Unit.Frequency)
      out.attenuationAtQueryDb = realValue(butterworthAttenuation(order, cutoffFrequency, queryFrequency), Unit.Log)
    }
    return out
  },
})
