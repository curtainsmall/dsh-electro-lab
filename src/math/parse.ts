/**
 * Parsing: convert LLM-facing inputs (numbers, SI-prefixed strings, complex
 * forms) into base-unit numbers / complex.js values. Units exist only at
 * this boundary — computation always runs on bare base-unit values.
 */
import { Complex } from 'complex.js'
import { familyFromToken, splitUnitToken, UnitFamily } from './units.ts'

/**
 * Parse a scalar input into a base-unit value.
 * Accepts a plain number (interpreted in `family` base units) or a string
 * with an optional SI prefix and unit ("1.5nF", "2.4kHz", "1k", "1k Ω").
 */
export function parseScalar(input: number | string, family: UnitFamily): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`invalid number: ${input}`)
    return input
  }
  const text = input.replace(/\s+/g, '')
  const unitMatch = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*((?:[A-Za-zµ°Ω]\s*)*)$/)
  if (unitMatch === null) throw new Error(`cannot parse quantity: "${input}"`)
  const num = Number(unitMatch[1])
  if (!Number.isFinite(num)) throw new Error(`invalid number in "${input}"`)
  const unitToken = (unitMatch[2] ?? '').replace(/\s+/g, '')
  if (unitToken === '') {
    // Bare number: interpret in the caller-declared family's base unit.
    return num
  }
  const wholeFamily = familyFromToken(unitToken)
  if (wholeFamily !== undefined) {
    // Whole token is a base unit or alias ("F", "ohm") — no scale.
    return num
  }
  const split = splitUnitToken(unitToken)
  if (split === undefined) {
    throw new Error(`unknown unit "${unitToken}" in "${input}"`)
  }
  if (split.baseUnit !== undefined) {
    const tokenFamily = familyFromToken(split.baseUnit)
    if (tokenFamily !== undefined && tokenFamily !== family) {
      throw new Error(`unit "${unitToken}" is ${tokenFamily}, expected ${family} in "${input}"`)
    }
  }
  return num * split.factor
}

/**
 * Parse a complex input into a Complex.
 * Accepts: number (real), { re, im }, "a+bj" / "a-bi" (optional trailing
 * unit, applied to both parts), "r∠θ°" (polar), or a bare real with unit.
 */
export function parseComplex(input: number | string | { re: number; im: number }, family: UnitFamily = UnitFamily.DIMENSIONLESS): Complex {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`invalid number: ${input}`)
    return new Complex(input, 0)
  }
  if (typeof input === 'object') {
    const { re, im } = input
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new Error(`invalid complex parts: ${JSON.stringify(input)}`)
    return new Complex(re, im)
  }
  const text = input.replace(/\s+/g, '')
  // Polar: "5∠53.13°"
  const polar = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*∠\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*°?$/)
  if (polar !== null) {
    const r = Number(polar[1])
    const deg = Number(polar[2])
    if (!Number.isFinite(r) || !Number.isFinite(deg)) throw new Error(`invalid polar form: "${input}"`)
    const phi = (deg * Math.PI) / 180
    return new Complex(r * Math.cos(phi), r * Math.sin(phi))
  }
  // Rectangular with optional unit suffix: "50+50j Ω", "1k+1kj Ω"
  const rect = text.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([+-]\s*(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*[ij]\s*((?:[A-Za-zµ°Ω]\s*)*)$/,
  )
  if (rect !== null) {
    let re = Number(rect[1])
    let im = Number((rect[2] ?? '').replace(/\s+/g, ''))
    if (!Number.isFinite(re) || !Number.isFinite(im)) throw new Error(`invalid complex form: "${input}"`)
    const unitToken = (rect[3] ?? '').replace(/\s+/g, '')
    if (unitToken !== '') {
      const split = splitUnitToken(unitToken)
      if (split === undefined) throw new Error(`unknown unit "${unitToken}" in "${input}"`)
      if (split.baseUnit !== undefined) {
        const tokenFamily = familyFromToken(split.baseUnit)
        if (tokenFamily !== undefined && tokenFamily !== family) {
          throw new Error(`unit "${unitToken}" is ${tokenFamily}, expected ${family} in "${input}"`)
        }
      }
      re *= split.factor
      im *= split.factor
    }
    return new Complex(re, im)
  }
  // Bare real (optionally with unit): "50", "1k", "50 Ω"
  const real = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*((?:[A-Za-zµ°Ω]\s*)*)$/)
  if (real !== null) {
    let re = Number(real[1])
    if (!Number.isFinite(re)) throw new Error(`invalid number in "${input}"`)
    const unitToken = (real[2] ?? '').replace(/\s+/g, '')
    if (unitToken !== '') {
      const split = splitUnitToken(unitToken)
      if (split === undefined) throw new Error(`unknown unit "${unitToken}" in "${input}"`)
      if (split.baseUnit !== undefined) {
        const tokenFamily = familyFromToken(split.baseUnit)
        if (tokenFamily !== undefined && tokenFamily !== family) {
          throw new Error(`unit "${unitToken}" is ${tokenFamily}, expected ${family} in "${input}"`)
        }
      }
      re *= split.factor
    }
    return new Complex(re, 0)
  }
  throw new Error(`cannot parse complex value: "${input}"`)
}
