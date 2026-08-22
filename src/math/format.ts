/**
 * Serialization: turn a complex result plus its fixed base unit into the
 * tool output shape. The unit is a constant of the caller (each tool knows
 * what it computes); this function produces both representations plus
 * display strings.
 */
import { Complex } from 'complex.js'
import { BaseUnit, UNIT_BY_BASE, engineeringFormat } from './units.ts'

function fmtNumber(value: number): string {
  // Rectangular components: plain precision formatting (no prefix noise).
  return Number(value.toPrecision(6)).toString()
}

/**
 * Serialize a complex value with a fixed base unit: machine values (re, im,
 * magnitude, phi) plus human displays (rectangular and polar, engineering
 * notation for magnitudes).
 */
export function serializeComplex(value: Complex, unit: BaseUnit): Record<string, number | string> {
  const Unit = UNIT_BY_BASE[unit]
  const re = fmtNumber(value.re)
  const im = value.im
  const imAbs = fmtNumber(Math.abs(im))
  const sign = im < 0 ? '-' : '+'
  const unitStr = unit === BaseUnit.Dimensionless ? '' : ` ${unit}`
  const mag = engineeringFormat(value.abs(), Unit, 4)
  const phi = ((value.arg() * 180) / Math.PI).toFixed(2)
  return {
    re: value.re,
    im: value.im,
    magnitude: value.abs(),
    phiDeg: (value.arg() * 180) / Math.PI,
    phiRad: value.arg(),
    display: `${re} ${sign} ${imAbs}j${unitStr}`,
    displayPolar: `${mag} ∠ ${phi}°${unitStr}`,
    unit,
  }
}
