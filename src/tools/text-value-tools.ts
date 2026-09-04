/**
 * Text ↔ value codec tools: parse_value turns a LIST of text quantities into
 * the canonical value payloads (SI base units), item by item and tolerant of
 * single failures; format_value renders a LIST of value payloads back to
 * text. They complement convert_unit: questions arrive as strings like
 * "100 mF" or "1+2j Ω", and the codec makes those explicit tool calls
 * instead of the model converting prefixes in prose.
 */
import { defineJsonTool, createValueParam } from '../tool.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { QuantityKind, QUANTITY_KIND_NAMES } from '../math/quantity-kind.ts'
import { formatValueText, parseValueTexts, type PrefixMode } from '../math/text-value.ts'

/** Lowercase kind names for the format tool's enum (schema values are plain strings). */
const KIND_OPTIONS = [...QUANTITY_KIND_NAMES]

/** parse_value: a list of texts → per-item value payloads (+ kind), failures tolerated. */
const parseTool = defineJsonTool({
  name: 'parse_value',
  description: 'Parse a LIST of text quantities into canonical value payloads in one call. ' +
    'Each item accepts a real number with an optional SI prefix and unit — ' +
    'prefixes p, n, µ/u, m, k, M, G, T; units Hz, Ω/ohm, F, H, V, A, W, s (all prefixable), rad, °/deg, K, °C, °F, dB — ' +
    'a bare number (also scientific like 1e3), a rectangular complex like "1+2j" or "1 - 2j" (optionally with a unit, e.g. "1+2j Ω"), ' +
    'a pure imaginary like "2j", or a polar like "3 ∠ 0.5" / "220∠30°" (angle token °/deg converts to radians; without a token the angle is radians). ' +
    'Values normalize to SI base units: 100 mF → 0.1, 50 kHz → 50000, 25 °C → 298.15. ' +
    'Items are parsed independently: each returns {ok: true, value (a bare number or {re,im} or {mag,ang}), kind (lowercase quantity kind name), unit (canonical SI symbol), prefix (used prefix or null)} ' +
    'or {ok: false, error} when that one text is unreadable — re-call only the failed items.',
  returns: { type: 'any' },
  parameters: {
    texts: {
      type: 'array',
      items: { type: 'string', description: 'one text quantity, e.g. "100 mF", "1+2j Ω", "3 ∠ 0.5", "25 °C"' },
      description: 'the text quantities to parse, e.g. ["100 mF", "50 kHz", "1+2j Ω"]',
      required: true,
    },
  },
  execute: (args) => parseValueTexts(args.texts as string[]) as unknown as JsonValue,
})

/** format_value: a list of value payloads (+ optional kind/prefix) → per-item text. */
const formatTool = defineJsonTool({
  name: 'format_value',
  description: 'Render a LIST of value payloads as readable text in one call, each with an optional unit and engineering prefix. ' +
    'Pass the kind (lowercase quantity kind name) to append its SI unit (e.g. resistance → Ω), omit it for a bare number — one kind applies to the whole list. ' +
    'prefix: "auto" picks the engineering prefix that keeps the magnitude between 1 and 1000 (100 mF for 0.1 F, 50 kHz for 50000 Hz), ' +
    '"none" prints plain SI, or pass an explicit prefix p/n/µ/m/k/M/G/T. ' +
    'Rectangular values print as "1 + 2j Ω"; polar values print as "3 ∠ 0.5 rad V". Angles are radians. Returns one string per input value, in order.',
  returns: { type: 'any' },
  parameters: {
    values: {
      type: 'array',
      items: createValueParam(QuantityKind.None, 'one value to format: a bare number, {re, im} (rectangular) or {mag, ang} (polar, angles in radians)'),
      description: 'the values to format, e.g. [0.1, 50000] or [{re: 1, im: 2}]',
      required: true,
    },
    kind: {
      type: 'string',
      enum: KIND_OPTIONS,
      description: 'lowercase quantity kind name for the unit suffix (optional; omit for bare numbers)',
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
    const values = args.values as unknown[]
    return values.map((value) => formatValueText(value as never, kind, prefix))
  },
})

export const textValueTools = [parseTool, formatTool]
