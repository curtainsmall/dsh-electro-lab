import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { calculateExpression, polynomialCoefficients } from './expression.ts'

describe('arithmetic and precedence', () => {
  it('respects operator precedence and parentheses', () => {
    expect(calculateExpression('2+3*4').re).toBeCloseTo(14, 10)
    expect(calculateExpression('(2+3)*4').re).toBeCloseTo(20, 10)
    expect(calculateExpression('10-2-3').re).toBeCloseTo(5, 10)
    expect(calculateExpression('20/4/5').re).toBeCloseTo(1, 10)
  })

  it('handles unary minus and right-associative power', () => {
    expect(calculateExpression('-2^2').re).toBeCloseTo(-4, 10)
    expect(calculateExpression('2^-2').re).toBeCloseTo(0.25, 10)
    expect(calculateExpression('2^3^2').re).toBeCloseTo(512, 10)
    expect(calculateExpression('2^10').re).toBeCloseTo(1024, 10)
  })

  it('parses scientific notation', () => {
    expect(calculateExpression('1e6').re).toBeCloseTo(1e6, 10)
    expect(calculateExpression('2.5e-3').re).toBeCloseTo(0.0025, 12)
    expect(calculateExpression('1.5E2').re).toBeCloseTo(150, 10)
  })
})

describe('complex arithmetic', () => {
  it('evaluates complex literals with j suffix', () => {
    const result = calculateExpression('3+4j')
    expect(result.re).toBeCloseTo(3, 10)
    expect(result.im).toBeCloseTo(4, 10)
  })

  it('accepts i as the imaginary unit too', () => {
    const result = calculateExpression('2i')
    expect(result.re).toBeCloseTo(0, 10)
    expect(result.im).toBeCloseTo(2, 10)
  })

  it('multiplies complex numbers (j² = −1)', () => {
    const result = calculateExpression('(1+j)*(1-j)')
    expect(result.re).toBeCloseTo(2, 10)
    expect(result.im).toBeCloseTo(0, 10)
    expect(calculateExpression('j^2').re).toBeCloseTo(-1, 10)
  })

  it('divides complex numbers', () => {
    const result = calculateExpression('(3+4j)/(1+j)')
    // (3+4j)/(1+j) = 3.5 + 0.5j
    expect(result.re).toBeCloseTo(3.5, 10)
    expect(result.im).toBeCloseTo(0.5, 10)
  })
})

describe('constants and functions', () => {
  it('evaluates constants', () => {
    expect(calculateExpression('pi').re).toBeCloseTo(Math.PI, 12)
    expect(calculateExpression('e').re).toBeCloseTo(Math.E, 12)
    expect(calculateExpression('2*pi*1e6').re).toBeCloseTo(2 * Math.PI * 1e6, 6)
  })

  it('evaluates functions (textbook checks)', () => {
    expect(calculateExpression('sin(pi/2)').re).toBeCloseTo(1, 10)
    expect(calculateExpression('cos(0)').re).toBeCloseTo(1, 10)
    expect(calculateExpression('sqrt(2)').re).toBeCloseTo(Math.SQRT2, 10)
    expect(calculateExpression('exp(1)').re).toBeCloseTo(Math.E, 10)
    expect(calculateExpression('ln(e)').re).toBeCloseTo(1, 10)
    expect(calculateExpression('log10(1000)').re).toBeCloseTo(3, 10)
    expect(calculateExpression('abs(3-4j)').re).toBeCloseTo(5, 10)
    expect(calculateExpression('arg(j)').re).toBeCloseTo(Math.PI / 2, 10)
  })

  it('computes complex powers', () => {
    const result = calculateExpression('(1+j)^2')
    expect(result.re).toBeCloseTo(0, 10)
    expect(result.im).toBeCloseTo(2, 10)
  })
})

describe('variables', () => {
  it('substitutes variable bindings', () => {
    const result = calculateExpression('x^2+2*x+1', { x: new Complex(3, 0) })
    expect(result.re).toBeCloseTo(16, 10)
    expect(result.im).toBeCloseTo(0, 10)
  })

  it('substitutes complex bindings', () => {
    const result = calculateExpression('x^2', { x: new Complex(0, 2) })
    expect(result.re).toBeCloseTo(-4, 10)
    expect(result.im).toBeCloseTo(0, 10)
  })
})

describe('errors', () => {
  it('rejects empty and malformed expressions', () => {
    expect(() => calculateExpression('')).toThrow(/empty/)
    expect(() => calculateExpression('2+*3')).toThrow(/unexpected/)
    expect(() => calculateExpression('(2+3')).toThrow(/expected '\)'/)
    expect(() => calculateExpression('2 3')).toThrow(/unexpected token/)
  })

  it('rejects unbound variables and unknown functions', () => {
    expect(() => calculateExpression('x+1')).toThrow(/unbound variable 'x'/)
    expect(() => calculateExpression('frobnicate(2)')).toThrow(/unknown function 'frobnicate'/)
  })
})

describe('polynomialCoefficients', () => {
  it('extracts descending coefficients (textbook checks)', () => {
    expect(polynomialCoefficients('x^2-3*x+2').coefficients.map((c) => c.re)).toEqual([1, -3, 2])
    expect(polynomialCoefficients('x^2+5').coefficients.map((c) => c.re)).toEqual([1, 0, 5])
    expect(polynomialCoefficients('3').coefficients.map((c) => c.re)).toEqual([3])
  })

  it('expands products', () => {
    expect(polynomialCoefficients('(x+1)*(x-2)').coefficients.map((c) => c.re)).toEqual([1, -1, -2])
    expect(polynomialCoefficients('(x-1)^3').coefficients.map((c) => c.re)).toEqual([1, -3, 3, -1])
  })

  it('combines like terms', () => {
    expect(polynomialCoefficients('x^2+x^2+2*x').coefficients.map((c) => c.re)).toEqual([2, 2, 0])
  })

  it('keeps complex coefficients', () => {
    const coefficients = polynomialCoefficients('(1+j)*x+2').coefficients
    expect(coefficients[0]!.re).toBeCloseTo(1, 10)
    expect(coefficients[0]!.im).toBeCloseTo(1, 10)
    expect(coefficients[1]!.re).toBeCloseTo(2, 10)
  })

  it('honors a custom variable and reports degree', () => {
    const result = polynomialCoefficients('s^2+3*s+2', 's')
    expect(result.degree).toBe(2)
    expect(result.coefficients.map((c) => c.re)).toEqual([1, 3, 2])
  })

  it('rejects non-polynomial expressions', () => {
    expect(() => polynomialCoefficients('sin(x)')).toThrow(/not a polynomial/)
    expect(() => polynomialCoefficients('x^-1')).toThrow(/non-negative integer/)
  })

  it('reports a constant expression as degree 0', () => {
    const result = polynomialCoefficients('2+2', 'x')
    expect(result.degree).toBe(0)
    expect(result.coefficients[0]!.re).toBeCloseTo(4, 10)
  })
})
