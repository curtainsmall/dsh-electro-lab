/**
 * Log tools: absolute level conversion and ratio conversion.
 * IO is JSON-and-complex-only.
 */
import { DbUnit, RatioKind, convertDbLevels, convertDecibelRatio } from '../math/db.ts'
import { toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const dbTools = [
  defineJsonTool({
    name: 'db_convert',
    description: 'Convert an absolute level to all common references: watts, dBm (1 mW), dBW (1 W), volts RMS, dBu (0.775 V) and dBµV. Voltage↔power conversions use the reference impedance (default 50 Ω; 0 dBm into 50 Ω = 107 dBµV).',
    parameters: {
      value: { ...createValueParam(QuantityKind.None, 'the level in its own unit'), required: true },
      unit: {
        type: 'string',
        enum: [DbUnit.Power, DbUnit.Dbm, DbUnit.Dbw, DbUnit.Voltage, DbUnit.Dbu, DbUnit.DbuV],
        description: 'unit of the input value',
        required: true,
      },
      impedance: { ...createValueParam(QuantityKind.Resistance, 'reference impedance for voltage↔power (default 50)') },
    },
    execute: (args) => {
      const value = toScalar(args.value, QuantityKind.None)
      const impedance = args.impedance === undefined ? 50 : toScalar(args.impedance, QuantityKind.Resistance)
      const levels = convertDbLevels(value, args.unit, impedance)
      const out: Record<string, JsonValue> = {
        unit: args.unit,
        impedance: serializeReal(impedance, QuantityKind.Resistance),
        watts: serializeReal(levels.watts, QuantityKind.Power),
        dbm: serializeReal(levels.dbm, QuantityKind.Log),
        dbw: serializeReal(levels.dbw, QuantityKind.Log),
        volts: serializeReal(levels.volts, QuantityKind.Voltage),
        dbu: serializeReal(levels.dbu, QuantityKind.Log),
        dbuV: serializeReal(levels.dbuV, QuantityKind.Log),
      }
      return out
    },
  }),
  defineJsonTool({
    name: 'decibel_ratio',
    description: 'Convert between a ratio and decibels. Provide exactly one of ratio or db (the level in dB); the other is returned. Power ratios use 10·log₁₀ (10 dB = ×10 power), voltage ratios 20·log₁₀ (20 dB = ×10 voltage).',
    parameters: {
      kind: {
        type: 'string',
        enum: [RatioKind.Power, RatioKind.Voltage],
        description: 'what the ratio is taken over',
        required: true,
      },
      ratio: { ...createValueParam(QuantityKind.None, 'linear ratio (positive)') },
      db: { ...createValueParam(QuantityKind.Log, 'decibel value') },
    },
    execute: (args) => {
      const ratio = args.ratio === undefined ? undefined : toScalar(args.ratio, QuantityKind.None)
      const db = args.db === undefined ? undefined : toScalar(args.db, QuantityKind.Log)
      const result = convertDecibelRatio(args.kind, ratio, db)
      const out: Record<string, JsonValue> = { kind: args.kind }
      if (result.db !== undefined) out.db = serializeReal(result.db, QuantityKind.Log)
      if (result.ratio !== undefined) out.ratio = serializeReal(result.ratio, QuantityKind.None)
      return out
    },
  }),
]
