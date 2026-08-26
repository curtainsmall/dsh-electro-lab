/**
 * Common-unit conversion tool: a legacy unit in, its SI base quantity out.
 * IO is JSON-and-complex-only.
 */
import { CommonUnit, convertCommonUnit, toScalar, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'

const ALL_UNITS = [
  CommonUnit.Celsius,
  CommonUnit.Fahrenheit,
  CommonUnit.Bar,
  CommonUnit.Psi,
  CommonUnit.Atm,
  CommonUnit.Calorie,
  CommonUnit.Kilocalorie,
  CommonUnit.WattHour,
  CommonUnit.KilowattHour,
  CommonUnit.Horsepower,
  CommonUnit.Inch,
  CommonUnit.Foot,
  CommonUnit.Yard,
  CommonUnit.Mile,
  CommonUnit.Pound,
  CommonUnit.Ounce,
]

export const unitTools = [
  defineJsonTool({
    name: 'convert_unit',
    description: 'Convert a common non-SI unit to its SI base quantity: temperature (celsius, fahrenheit → K), pressure (bar, psi, atm → Pa), energy (calorie, kilocalorie, watthour, kilowatthour → J), power (horsepower → W), length (inch, foot, yard, mile → m), mass (pound, ounce → kg). The result carries the SI quantity kind.',
    parameters: {
      value: { ...createValueParam(QuantityKind.None, 'magnitude in the source unit'), required: true },
      unit: {
        type: 'string',
        enum: ALL_UNITS,
        description: 'source unit to convert from',
        required: true,
      },
    },
    execute: (args) => {
      const { value, kind } = convertCommonUnit(toScalar(args.value, QuantityKind.None), args.unit)
      return { value: serializeReal(value, kind) }
    },
  }),
]
