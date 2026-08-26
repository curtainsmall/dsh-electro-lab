import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { calcExpression, reduceRational } from '../../src/math/expression.ts'
import { serializeComplex } from '../../src/math/convert.ts'
import { QuantityKind } from '../../src/math/quantity-kind.ts'

describe('arithmetic and precedence', () => {
  it('respects operator precedence and parentheses', () => {
    expect(calcExpression('2+3*4').re).toBeCloseTo(14, 10)
    expect(calcExpression('(2+3)*4').re).toBeCloseTo(20, 10)
    expect(calcExpression('10-2-3').re).toBeCloseTo(5, 10)
    expect(calcExpression('20/4/5').re).toBeCloseTo(1, 10)
  })

  it('handles unary minus and right-associative power', () => {
    expect(calcExpression('-2^2').re).toBeCloseTo(-4, 10)
    expect(calcExpression('2^-2').re).toBeCloseTo(0.25, 10)
    expect(calcExpression('2^3^2').re).toBeCloseTo(512, 10)
    expect(calcExpression('2^10').re).toBeCloseTo(1024, 10)
  })

  it('parses scientific notation', () => {
    expect(calcExpression('1e6').re).toBeCloseTo(1e6, 10)
    expect(calcExpression('2.5e-3').re).toBeCloseTo(0.0025, 12)
    expect(calcExpression('1.5E2').re).toBeCloseTo(150, 10)
  })
})

describe('complex arithmetic', () => {
  it('evaluates complex literals with j suffix', () => {
    const result = calcExpression('3+4j')
    expect(result.re).toBeCloseTo(3, 10)
    expect(result.im).toBeCloseTo(4, 10)
  })

  it('accepts i as the imaginary unit too', () => {
    const result = calcExpression('2i')
    expect(result.re).toBeCloseTo(0, 10)
    expect(result.im).toBeCloseTo(2, 10)
  })

  it('multiplies complex numbers (j² = −1)', () => {
    const result = calcExpression('(1+j)*(1-j)')
    expect(result.re).toBeCloseTo(2, 10)
    expect(result.im).toBeCloseTo(0, 10)
    expect(calcExpression('j^2').re).toBeCloseTo(-1, 10)
  })

  it('divides complex numbers', () => {
    const result = calcExpression('(3+4j)/(1+j)')
    // (3+4j)/(1+j) = 3.5 + 0.5j
    expect(result.re).toBeCloseTo(3.5, 10)
    expect(result.im).toBeCloseTo(0.5, 10)
  })
})

describe('constants and functions', () => {
  it('evaluates constants', () => {
    expect(calcExpression('pi').re).toBeCloseTo(Math.PI, 12)
    expect(calcExpression('e').re).toBeCloseTo(Math.E, 12)
    expect(calcExpression('2*pi*1e6').re).toBeCloseTo(2 * Math.PI * 1e6, 6)
  })

  it('evaluates functions (known-value checks)', () => {
    expect(calcExpression('sin(pi/2)').re).toBeCloseTo(1, 10)
    expect(calcExpression('cos(0)').re).toBeCloseTo(1, 10)
    expect(calcExpression('sqrt(2)').re).toBeCloseTo(Math.SQRT2, 10)
    expect(calcExpression('exp(1)').re).toBeCloseTo(Math.E, 10)
    expect(calcExpression('ln(e)').re).toBeCloseTo(1, 10)
    expect(calcExpression('log10(1000)').re).toBeCloseTo(3, 10)
    expect(calcExpression('abs(3-4j)').re).toBeCloseTo(5, 10)
    expect(calcExpression('arg(j)').re).toBeCloseTo(Math.PI / 2, 10)
  })

  it('computes complex powers', () => {
    const result = calcExpression('(1+j)^2')
    expect(result.re).toBeCloseTo(0, 10)
    expect(result.im).toBeCloseTo(2, 10)
  })
})

describe('inverse trigonometric functions', () => {
  it('evaluates asin, acos and atan on the real axis', () => {
    expect(calcExpression('asin(1)').re).toBeCloseTo(Math.PI / 2, 10)
    expect(calcExpression('asin(0)').re).toBeCloseTo(0, 10)
    expect(calcExpression('acos(1)').re).toBeCloseTo(0, 10)
    expect(calcExpression('acos(0)').re).toBeCloseTo(Math.PI / 2, 10)
    expect(calcExpression('atan(1)').re).toBeCloseTo(Math.PI / 4, 10)
    expect(calcExpression('atan(0)').re).toBeCloseTo(0, 10)
  })

  it('extends to complex arguments (asin(2) leaves the real axis)', () => {
    const result = calcExpression('asin(2)')
    expect(result.re).toBeCloseTo(Math.PI / 2, 10)
    expect(result.im).toBeCloseTo(-Math.log(2 + Math.sqrt(3)), 10)
  })

  it('supports two-argument atan2(y, x) = angle of x + j·y', () => {
    expect(calcExpression('atan2(1, 1)').re).toBeCloseTo(Math.PI / 4, 10)
    expect(calcExpression('atan2(-1, -1)').re).toBeCloseTo(-3 * Math.PI / 4, 10)
    expect(calcExpression('atan2(1, 0)').re).toBeCloseTo(Math.PI / 2, 10)
    expect(calcExpression('atan2(0, -1)').re).toBeCloseTo(Math.PI, 10)
  })

  it('rejects a wrong argument count', () => {
    expect(() => calcExpression('atan2(1)')).toThrow(/expects 2 argument/)
    expect(() => calcExpression('sin(1, 2)')).toThrow(/expects 1 argument/)
    expect(() => calcExpression('atan2()')).toThrow(/expects 2 argument/)
  })
})

describe('variables', () => {
  it('substitutes variable bindings', () => {
    const result = calcExpression('x^2+2*x+1', { x: new Complex(3, 0) })
    expect(result.re).toBeCloseTo(16, 10)
    expect(result.im).toBeCloseTo(0, 10)
  })

  it('substitutes complex bindings', () => {
    const result = calcExpression('x^2', { x: new Complex(0, 2) })
    expect(result.re).toBeCloseTo(-4, 10)
    expect(result.im).toBeCloseTo(0, 10)
  })
})

describe('regression — single-stub matching quadratic (lossless output)', () => {
  it('computes both tangent roots; serialized output carries no negative zero', () => {
    // y_L = g + jb with g = 0.5190311418685122, b = -0.2768166089965398;
    // solving Re[y(d)] = 1 with t = tan(βd) gives A·t² − 2b·t + (1−g) = 0.
    // The plus branch divides +0 by a negative denominator, so complex.js
    // yields im = -0 — which the harness lossless-JSON boundary rejects.
    const variables = {
      b: new Complex(-0.2768166089965398, 0),
      g: new Complex(0.5190311418685122, 0),
    }
    const roots = [
      calcExpression('(-(-2*b) - sqrt((-2*b)^2 - 4*(b^2+g^2-g)*(1-g)))/(2*(b^2+g^2-g))', variables),
      calcExpression('(-(-2*b) + sqrt((-2*b)^2 - 4*(b^2+g^2-g)*(1-g)))/(2*(b^2+g^2-g))', variables),
    ]
    expect(roots[0]!.re).toBeCloseTo(3.9108440016582695, 12)
    expect(roots[1]!.re).toBeCloseTo(-0.7108440016582688, 12)
    for (const root of roots) {
      const output = serializeComplex(root, QuantityKind.None)
      for (const value of [output.re, output.im, output.mag, output.angRad]) {
        expect(Object.is(value, -0)).toBe(false)
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })
})

describe('errors', () => {
  it('rejects empty and malformed expressions', () => {
    expect(() => calcExpression('')).toThrow(/empty/)
    expect(() => calcExpression('2+*3')).toThrow(/unexpected/)
    expect(() => calcExpression('(2+3')).toThrow(/expected '\)'/)
    expect(() => calcExpression('2 3')).toThrow(/unexpected token/)
  })

  it('rejects unbound variables and unknown functions', () => {
    expect(() => calcExpression('x+1')).toThrow(/unbound variable 'x'/)
    expect(() => calcExpression('frobnicate(2)')).toThrow(/unknown function 'frobnicate'/)
  })
})

describe('reduceRational — pure polynomials', () => {
  it('extracts descending coefficients (known-value checks)', () => {
    expect(reduceRational('x^2-3*x+2').numerator.map((c) => c.re)).toEqual([1, -3, 2])
    expect(reduceRational('x^2-3*x+2').denominator.map((c) => c.re)).toEqual([1])
    expect(reduceRational('x^2+5').numerator.map((c) => c.re)).toEqual([1, 0, 5])
    expect(reduceRational('3').numerator.map((c) => c.re)).toEqual([3])
  })

  it('expands products and combines like terms', () => {
    expect(reduceRational('(x+1)*(x-2)').numerator.map((c) => c.re)).toEqual([1, -1, -2])
    expect(reduceRational('(x-1)^3').numerator.map((c) => c.re)).toEqual([1, -3, 3, -1])
    expect(reduceRational('x^2+x^2+2*x').numerator.map((c) => c.re)).toEqual([2, 2, 0])
  })

  it('keeps complex coefficients', () => {
    const numerator = reduceRational('(1+j)*x+2').numerator
    expect(numerator[0]!.re).toBeCloseTo(1, 10)
    expect(numerator[0]!.im).toBeCloseTo(1, 10)
    expect(numerator[1]!.re).toBeCloseTo(2, 10)
  })

  it('honors a custom variable', () => {
    expect(reduceRational('s^2+3*s+2', 's').numerator.map((c) => c.re)).toEqual([1, 3, 2])
  })
})

describe('reduceRational — rational functions', () => {
  it('reduces a plain ratio (unreduced view)', () => {
    const result = reduceRational('(s+1)/(s^2+3*s+2)', 's', false)
    expect(result.numerator.map((c) => c.re)).toEqual([1, 1])
    expect(result.denominator.map((c) => c.re)).toEqual([1, 3, 2])
  })

  it('normalizes negative powers', () => {
    const result = reduceRational('s^-1+2', 's')
    // (1 + 2s) / s
    expect(result.numerator.map((c) => c.re)).toEqual([2, 1])
    expect(result.denominator.map((c) => c.re)).toEqual([1, 0])
  })

  it('keeps parameter symbols via bindings (RC low-pass)', () => {
    const result = reduceRational('1/(1+s*RC)', 's', true, { RC: new Complex(10000, 0) })
    expect(result.numerator.map((c) => c.re)).toEqual([1])
    expect(result.denominator[0]!.re).toBeCloseTo(10000, 10)
    expect(result.denominator[1]!.re).toBeCloseTo(1, 10)
  })

  it('adds rationals by cross-multiplication', () => {
    const result = reduceRational('1/s + 2/(s+1)', 's')
    // (s+1 + 2s) / (s(s+1)) = (3s+1) / (s²+s)
    expect(result.numerator.map((c) => c.re)).toEqual([3, 1])
    expect(result.denominator.map((c) => c.re)).toEqual([1, 1, 0])
  })

  it('handles nested division', () => {
    const result = reduceRational('1/(1+1/s)', 's')
    // 1 / ((s+1)/s) = s/(s+1)
    expect(result.numerator.map((c) => c.re)).toEqual([1, 0])
    expect(result.denominator.map((c) => c.re)).toEqual([1, 1])
  })

  it('cancels common factors by default and keeps them with reduce false', () => {
    const reduced = reduceRational('(x+1)/(x^2+3*x+2)')
    expect(reduced.numerator.map((c) => c.re)).toEqual([1])
    expect(reduced.denominator.map((c) => c.re)).toEqual([1, 2])
    const unreduced = reduceRational('(x+1)/(x^2+3*x+2)', 'x', false)
    expect(unreduced.numerator.map((c) => c.re)).toEqual([1, 1])
    expect(unreduced.denominator.map((c) => c.re)).toEqual([1, 3, 2])
  })

  it('rejects division by the zero polynomial', () => {
    expect(() => reduceRational('1/(x-x)')).toThrow(/identically zero/)
  })

  it('rejects non-rational expressions', () => {
    expect(() => reduceRational('sin(x)')).toThrow(/not a rational function/)
    expect(() => reduceRational('x^0.5')).toThrow(/integer exponent/)
    expect(() => reduceRational('x^x')).toThrow(/must not contain the variable/)
  })
})
