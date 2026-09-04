/**
 * Text ↔ value codec tools: parse_value turns a text quantity into the
 * canonical value payload (SI base units) and format_value renders a payload
 * back to text. They complement convert_unit: questions arrive as strings
 * like "100 mF" or "1+2j Ω", and the codec makes those explicit tool calls
 * instead of the model converting prefixes in prose.
 */
import { defineJsonTool, createValueParam } from '../tool.ts'
import { QuantityKind, QUANTITY_KIND_NAMES } from '../math/quantity-kind.ts'
import { formatValueText, parseValueText, type PrefixMode } from '../math/text-value.ts'

/** Lowercase kind names for the format tool's enum (schema values are plain strings). */
const KIND_OPTIONS = [...QUANTITY_KIND_NAMES]

/** parse_value: text → value payload + kind. */
const parseTool = defineJsonTool({
  name: 'parse_value',
  description: 'Parse one text quantity into the canonical value payload. Accepts a real number with an optional SI prefix and unit — ' +
    'prefixes p, n, µ/u, m, k, M, G, T; units Hz, Ω/ohm, F, H, V, A, W, s (all prefixable), rad, °/deg, K, °C, °F, dB — ' +
    'a bare number (also scientific like 1e3), a rectangular complex like "1+2j" or "1 - 2j" (optionally with a unit, e.g. "1+2j Ω"), ' +
    'a pure imaginary like "2j", or a polar like "3 ∠ 0.5" / "220∠30°" (angle token °/deg converts to radians; without a token the angle is radians). ' +
    'Values normalize to SI base units: 100 mF → 0.1, 50 kHz → 50000, 25 °C → 298.15. ' +
    'Returns {value (a bare number or {re,im} or {mag,ang}), kind (lowercase quantity kind name), unit (canonical SI symbol), prefix (used prefix or null)}.',
  returns: { type: 'any' },
  parameters: {
    text: { type: 'string', description: 'the text quantity to parse, e.g. "100 mF", "1+2j Ω", "3 ∠ 0.5", "25 °C"', required: true },
  },
  execute: (args) => {
    const parsed = parseValueText(args.text)
    return {
      value: parsed.value,
      kind: parsed.kind,
      unit: parsed.unit,
      prefix: parsed.prefix,
    }
  },
})

/** format_value: value payload (+ optional kind/prefix) → text. */
const formatTool = defineJsonTool({
  name: 'format_value',
  description: 'Render a value payload as readable text with an optional unit and engineering prefix. ' +
    'Pass the kind (lowercase quantity kind name) to append its SI unit (e.g. resistance → Ω), omit it for a bare number. ' +
    'prefix: "auto" picks the engineering prefix that keeps the magnitude between 1 and 1000 (100 mF for 0.1 F, 50 kHz for 50000 Hz), ' +
    '"none" prints plain SI, or pass an explicit prefix p/n/µ/m/k/M/G/T. ' +
    'Rectangular values print as "1 + 2j Ω"; polar values print as "3 ∠ 0.5 rad V". Angles are radians.',
  returns: { type: 'any' },
  parameters: {
    value: {
      ...createValueParam(QuantityKind.None, 'the value to format: a real number, {re, im} (rectangular) or {mag, ang} (polar, angles in radians)'),
      required: true,
    },
    kind: {
      type: 'string',
      enum: KIND_OPTIONS,
      description: 'lowercase quantity kind name for the unit suffix (optional; omit for a bare number)',
    },
    prefix: {
      type: 'string',
      enum: ['auto', 'none', 'p', 'n', 'µ', 'm', 'k', 'M', 'G', 'T'],
      description: 'prefix policy: auto (default), none, or an explicit prefix',
    },
  },
  execute: (args) => {
    const kind = args.kind === undefined ? QuantityKind.None : (args.kind as QuantityKind)
    const prefix: PrefixMode = args.prefix === undefined ? 'auto' : (args.prefix as PrefixMode)
    return { text: formatValueText(args.value as never, kind, prefix) }
  },
})

export const textValueTools = [parseTool, formatTool]
