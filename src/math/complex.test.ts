import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import { addComplex, assertFiniteComplex, multiplyComplex, negateComplex, reciprocalComplex } from './complex.ts'

describe('complex arithmetic (textbook checks)', () => {
  it('adds, negates, multiplies and reciprocates', () => {
    expect(addComplex(new Complex(1, 2), new Complex(3, -4)).toString()).toBe(new Complex(4, -2).toString())
    expect(negateComplex(new Complex(1, 2)).toString()).toBe(new Complex(-1, -2).toString())
    expect(multiplyComplex(new Complex(1, 1), new Complex(1, -1)).toString()).toBe(new Complex(2, 0).toString())
    expect(reciprocalComplex(new Complex(0, 1)).toString()).toBe(new Complex(0, -1).toString()) // 1/j = −j
  })

  it('rejects reciprocal of zero', () => {
    expect(() => reciprocalComplex(new Complex(0, 0))).toThrow(/zero/)
  })

  it('guards non-finite results', () => {
    expect(() => assertFiniteComplex(new Complex(Number.NaN, 0), 'test')).toThrow(/non-finite/)
    expect(() => assertFiniteComplex(new Complex(0, Number.POSITIVE_INFINITY), 'test')).toThrow(/non-finite/)
    expect(() => assertFiniteComplex(new Complex(1, 2), 'test')).not.toThrow()
  })
})
