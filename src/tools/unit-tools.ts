/**
 * Unified unit-conversion tool: a value in, a source unit and a target unit,
 * the converted value out — in the unit the caller asked for. One O(1) unit
 * → family lookup maps both units at the start of the call; the family
 * check runs once, then the tool dispatches to the per-family math function.
 * IO is JSON-and-complex-only.
 */
import {
  ConvertUnit,
  convertAngle,
  convertEnergy,
  convertLength,
  convertLogValue,
  convertMass,
  convertPower,
  convertPressure,
  convertTemperature,
  toComplex,
  serializeComplex,
  type TemperatureUnit,
  type PressureUnit,
  type EnergyUnit,
  type PowerUnit,
  type LengthUnit,
  type MassUnit,
  type LogUnit,
} from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { RatioKind } from '../math/db.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

const ALL_UNITS = Object.values(ConvertUnit)

/** Convert family: the tool's dispatch discriminator. */
enum ConvertFamily {
  Temperature = 'temperature',
  Pressure = 'pressure',
  Energy = 'energy',
  Power = 'power',
  Length = 'length',
  Mass = 'mass',
  Angle = 'angle',
  Log = 'log',
}

/** O(1) unit → family map (pure map; the dispatch itself is the switch below). */
const FAMILY_OF: Record<ConvertUnit, ConvertFamily> = {
  [ConvertUnit.Celsius]: ConvertFamily.Temperature,
  [ConvertUnit.Fahrenheit]: ConvertFamily.Temperature,
  [ConvertUnit.Kelvin]: ConvertFamily.Temperature,
  [ConvertUnit.Bar]: ConvertFamily.Pressure,
  [ConvertUnit.Psi]: ConvertFamily.Pressure,
  [ConvertUnit.Atm]: ConvertFamily.Pressure,
  [ConvertUnit.Pascal]: ConvertFamily.Pressure,
  [ConvertUnit.Calorie]: ConvertFamily.Energy,
  [ConvertUnit.Kilocalorie]: ConvertFamily.Energy,
  [ConvertUnit.WattHour]: ConvertFamily.Energy,
  [ConvertUnit.KilowattHour]: ConvertFamily.Energy,
  [ConvertUnit.Joule]: ConvertFamily.Energy,
  [ConvertUnit.Horsepower]: ConvertFamily.Power,
  [ConvertUnit.Watt]: ConvertFamily.Power,
  [ConvertUnit.Inch]: ConvertFamily.Length,
  [ConvertUnit.Foot]: ConvertFamily.Length,
  [ConvertUnit.Yard]: ConvertFamily.Length,
  [ConvertUnit.Mile]: ConvertFamily.Length,
  [ConvertUnit.Metre]: ConvertFamily.Length,
  [ConvertUnit.Pound]: ConvertFamily.Mass,
  [ConvertUnit.Ounce]: ConvertFamily.Mass,
  [ConvertUnit.Kilogram]: ConvertFamily.Mass,
  [ConvertUnit.Degree]: ConvertFamily.Angle,
  [ConvertUnit.Radian]: ConvertFamily.Angle,
  [ConvertUnit.Ratio]: ConvertFamily.Log,
  [ConvertUnit.Db]: ConvertFamily.Log,
}

export const unitTools = [
  defineJsonTool({
    name: 'convert',
    description: 'Convert a value from one unit to any other unit of the same family: temperature (celsius, fahrenheit, kelvin), pressure (bar, psi, atm, pascal), energy (calorie, kilocalorie, watthour, kilowatthour, joule), power (horsepower, watt), length (inch, foot, yard, mile, metre), mass (pound, ounce, kilogram), angle (degree → radian only; angles are always radians), log scale (ratio ↔ db, requires kind power|voltage). The result is returned in the target unit.',
    parameters: {
      value: { ...createValueParam(QuantityKind.None, 'value in the source unit'), required: true },
      from: { type: 'string', enum: ALL_UNITS, description: 'source unit', required: true },
      to: { type: 'string', enum: ALL_UNITS, description: 'target unit', required: true },
      kind: { type: 'string', enum: [RatioKind.Power, RatioKind.Voltage], description: 'power or voltage (required when converting between ratio and db)' },
    },
    execute: (args): Record<string, JsonValue> => {
      const value = toComplex(args.value, QuantityKind.None)
      // One O(1) lookup per unit; the family check runs once, not per branch.
      const fromFamily = FAMILY_OF[args.from as ConvertUnit]
      const toFamily = FAMILY_OF[args.to as ConvertUnit]
      if (fromFamily !== toFamily) {
        throw new Error(`cannot convert from ${args.from} to ${args.to} — different unit families`)
      }
      // The casts below are safe: FAMILY_OF already verified membership.
      switch (fromFamily) {
        case ConvertFamily.Temperature: {
          const from = args.from as TemperatureUnit
          const to = args.to as TemperatureUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertTemperature(value, from, to), QuantityKind.Temperature) }
        }
        case ConvertFamily.Pressure: {
          const from = args.from as PressureUnit
          const to = args.to as PressureUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertPressure(value, from, to), QuantityKind.Pressure) }
        }
        case ConvertFamily.Energy: {
          const from = args.from as EnergyUnit
          const to = args.to as EnergyUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertEnergy(value, from, to), QuantityKind.Energy) }
        }
        case ConvertFamily.Power: {
          const from = args.from as PowerUnit
          const to = args.to as PowerUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertPower(value, from, to), QuantityKind.Power) }
        }
        case ConvertFamily.Length: {
          const from = args.from as LengthUnit
          const to = args.to as LengthUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertLength(value, from, to), QuantityKind.Length) }
        }
        case ConvertFamily.Mass: {
          const from = args.from as MassUnit
          const to = args.to as MassUnit
          return { from: args.from, to: args.to, value: serializeComplex(convertMass(value, from, to), QuantityKind.Mass) }
        }
        case ConvertFamily.Angle: {
          // angles are radians everywhere: degree is the only source unit,
          // radian the only (identity) target unit
          if (args.from !== ConvertUnit.Degree || args.to !== ConvertUnit.Radian) {
            throw new Error('angles are always radians: only degree → radian is supported')
          }
          return { from: args.from, to: args.to, value: serializeComplex(convertAngle(value), QuantityKind.Angle) }
        }
        case ConvertFamily.Log: {
          const from = args.from as LogUnit
          const to = args.to as LogUnit
          if (args.kind === undefined) throw new Error('log conversion (ratio ↔ db) requires kind (power | voltage)')
          return { from: args.from, to: args.to, value: serializeComplex(convertLogValue(value, from, to, args.kind), QuantityKind.Log) }
        }
        default:
          // unreachable: FAMILY_OF covers every ConvertUnit member
          throw new Error(`unknown unit ${args.from}`)
      }
    },
  }),
]
