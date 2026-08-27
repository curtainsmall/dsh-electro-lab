/**
 * Log tools: absolute level conversion and ratio conversion.
 * IO is JSON-and-complex-only.
 */
import { DbUnit, convertDbLevels } from '../math/db.ts'
import { ConvertUnit, RatioKind, convertLogValue, toScalar, serializeReal } from '../math/convert.ts'
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
    description: 'Convert between a ratio and decibels. Provide exactly one of ratio or db (the level in dB); the other is returned. Linear ratios (power-like, e.g. power, energy) use 10·log₁₀ (10 dB = ×10), quadratic ratios (amplitude-like, e.g. voltage, current, pressure) use 20·log₁₀ (20 dB = ×10).',
    parameters: {
      kind: {
        type: 'string',
        enum: [RatioKind.Linear, RatioKind.Quadratic],
        description: 'linear (power-like, 10·log10) or quadratic (amplitude-like, 20·log10)',
        required: true,
      },
      ratio: { ...createValueParam(QuantityKind.None, 'linear ratio (positive)') },
      db: { ...createValueParam(QuantityKind.Log, 'decibel value') },
    },
    execute: (args): Record<string, JsonValue> => {
      const ratio = args.ratio === undefined ? undefined : toScalar(args.ratio, QuantityKind.None)
      const db = args.db === undefined ? undefined : toScalar(args.db, QuantityKind.Log)
      if ((ratio === undefined) === (db === undefined)) {
        throw new Error('provide exactly one of ratio or db')
      }
      const out: Record<string, JsonValue> = { kind: args.kind }
      if (db !== undefined) {
        out.ratio = serializeReal(convertLogValue(db, ConvertUnit.Db, ConvertUnit.Ratio, args.kind).re, QuantityKind.None)
      } else {
        out.db = serializeReal(convertLogValue(ratio!, ConvertUnit.Ratio, ConvertUnit.Db, args.kind).re, QuantityKind.Log)
      }
      return out
    },
  }),
]
