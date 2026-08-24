/**
 * String-expression engine: one recursive-descent parser shared by two
 * consumers — evaluate (arithmetic, complex-aware) and collectCoefficients
 * (polynomial expansion about one variable).
 *
 * Grammar (precedence low → high):
 *   expression  := addSub
 *   addSub      := mulDiv (('+' | '-') mulDiv)*
 *   mulDiv      := unary (('*' | '/') unary)*
 *   unary       := ('-' | '+')* power
 *   power       := primary ('^' unary)?        (right-associative)
 *   primary     := number | identifier (call | '(' expr ')')?
 *
 * Numbers: decimal with optional scientific exponent (1e6, 2.5e-3) and an
 * optional imaginary suffix (3+4j, 2i). 'j'/'i' alone is the imaginary unit.
 * Constants: pi, e. Functions: sin cos tan exp ln log10 sqrt abs arg
 * conjugate real imag. Everything else is a variable; unbound variables
 * error on evaluation.
 */
import { Complex } from 'complex.js'

// ── Enums ────────────────────────────────────────────────────────────────

/** Binary operators of the expression language, with their source spelling. */
enum BinaryOperator {
  Add = '+',
  Subtract = '-',
  Multiply = '*',
  Divide = '/',
  Power = '^',
}

/** Kind of an expression AST node. */
enum ExprKind {
  Number = 'number',
  Variable = 'variable',
  Negate = 'negate',
  Binary = 'binary',
  Call = 'call',
}

/** Kind of a lexer token. */
enum TokenKind {
  Number = 'number',
  Identifier = 'identifier',
  Operator = 'operator',
  LeftParen = 'leftParen',
  RightParen = 'rightParen',
  Comma = 'comma',
  End = 'end',
}

// ── Types ────────────────────────────────────────────────────────────────

type Expr =
  | { kind: ExprKind.Number; value: Complex }
  | { kind: ExprKind.Variable; name: string }
  | { kind: ExprKind.Negate; operand: Expr }
  | { kind: ExprKind.Binary; operator: BinaryOperator; left: Expr; right: Expr }
  | { kind: ExprKind.Call; functionName: string; argument: Expr }

type Token =
  | { kind: TokenKind.Number; value: Complex }
  | { kind: TokenKind.Identifier; value: string }
  | { kind: TokenKind.Operator; value: BinaryOperator }
  | { kind: TokenKind.LeftParen }
  | { kind: TokenKind.RightParen }
  | { kind: TokenKind.Comma }
  | { kind: TokenKind.End }

/** A rational function as two coefficient arrays, descending power order. */
interface Rational {
  numerator: Complex[]
  denominator: Complex[]
}

// ── Pure mappings ────────────────────────────────────────────────────────

const CONSTANTS: Record<string, Complex> = {
  pi: new Complex(Math.PI, 0),
  e: new Complex(Math.E, 0),
  j: new Complex(0, 1),
  i: new Complex(0, 1),
}

/** Unary functions callable in expressions; all complex-valued. */
const FUNCTIONS: Record<string, (argument: Complex) => Complex> = {
  sin: (z) => z.sin(),
  cos: (z) => z.cos(),
  tan: (z) => z.tan(),
  exp: (z) => z.exp(),
  ln: (z) => z.log(),
  log10: (z) => z.log().div(Math.log(10)),
  sqrt: (z) => z.sqrt(),
  abs: (z) => new Complex(z.abs(), 0),
  arg: (z) => new Complex(z.arg(), 0),
  conjugate: (z) => z.conjugate(),
  real: (z) => new Complex(z.re, 0),
  imag: (z) => new Complex(z.im, 0),
}

const IDENTIFIER_START = /[a-zA-Z_]/
const IDENTIFIER_PART = /[a-zA-Z0-9_]/

// ── Tokenizer ────────────────────────────────────────────────────────────

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]!
    if (/\s/.test(char)) {
      index++
      continue
    }
    if (char === '(') {
      tokens.push({ kind: TokenKind.LeftParen })
      index++
      continue
    }
    if (char === ')') {
      tokens.push({ kind: TokenKind.RightParen })
      index++
      continue
    }
    if (char === ',') {
      tokens.push({ kind: TokenKind.Comma })
      index++
      continue
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ kind: TokenKind.Operator, value: char as BinaryOperator })
      index++
      continue
    }
    if (/\d/.test(char)) {
      let number = ''
      while (index < source.length && /\d/.test(source[index]!)) number += source[index++]
      if (source[index] === '.') {
        number += source[index++]
        while (index < source.length && /\d/.test(source[index]!)) number += source[index++]
      }
      if (source[index] === 'e' || source[index] === 'E') {
        // scientific exponent only when a digit follows; otherwise 'e' is Euler's constant
        let lookahead = index + 1
        if (source[lookahead] === '+' || source[lookahead] === '-') lookahead++
        if (/\d/.test(source[lookahead] ?? '')) {
          number += source[index++] // 'e' or 'E'
          if (source[index] === '+' || source[index] === '-') number += source[index++]
          while (index < source.length && /\d/.test(source[index]!)) number += source[index++]
        }
      }
      let imaginary = false
      if (source[index] === 'j' || source[index] === 'J' || source[index] === 'i' || source[index] === 'I') {
        imaginary = true
        index++
      }
      const magnitude = Number.parseFloat(number)
      if (!Number.isFinite(magnitude)) throw new Error(`invalid number literal '${number}' in expression`)
      tokens.push({ kind: TokenKind.Number, value: imaginary ? new Complex(0, magnitude) : new Complex(magnitude, 0) })
      continue
    }
    if (IDENTIFIER_START.test(char)) {
      let identifier = ''
      while (index < source.length && IDENTIFIER_PART.test(source[index]!)) identifier += source[index++]
      tokens.push({ kind: TokenKind.Identifier, value: identifier })
      continue
    }
    throw new Error(`unexpected character '${char}' at position ${index} in expression`)
  }
  tokens.push({ kind: TokenKind.End })
  return tokens
}

// ── Parser ───────────────────────────────────────────────────────────────

class Parser {
  private position = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expression = this.parseAddSub()
    if (this.peek().kind !== TokenKind.End) {
      throw new Error(`unexpected token '${this.describe(this.peek())}' in expression`)
    }
    return expression
  }

  private parseAddSub(): Expr {
    let left = this.parseMulDiv()
    for (;;) {
      const token = this.peek()
      if (token.kind !== TokenKind.Operator || (token.value !== BinaryOperator.Add && token.value !== BinaryOperator.Subtract)) return left
      this.next()
      left = { kind: ExprKind.Binary, operator: token.value, left, right: this.parseMulDiv() }
    }
  }

  private parseMulDiv(): Expr {
    let left = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token.kind !== TokenKind.Operator || (token.value !== BinaryOperator.Multiply && token.value !== BinaryOperator.Divide)) return left
      this.next()
      left = { kind: ExprKind.Binary, operator: token.value, left, right: this.parseUnary() }
    }
  }

  private parseUnary(): Expr {
    const token = this.peek()
    if (token.kind === TokenKind.Operator && (token.value === BinaryOperator.Subtract || token.value === BinaryOperator.Add)) {
      this.next()
      const operand = this.parseUnary()
      return token.value === BinaryOperator.Subtract ? { kind: ExprKind.Negate, operand } : operand
    }
    return this.parsePower()
  }

  private parsePower(): Expr {
    const base = this.parsePrimary()
    const token = this.peek()
    if (token.kind === TokenKind.Operator && token.value === BinaryOperator.Power) {
      this.next()
      return { kind: ExprKind.Binary, operator: BinaryOperator.Power, left: base, right: this.parseUnary() }
    }
    return base
  }

  private parsePrimary(): Expr {
    const token = this.next()
    if (token.kind === TokenKind.Number) return { kind: ExprKind.Number, value: token.value }
    if (token.kind === TokenKind.LeftParen) {
      const expression = this.parseAddSub()
      if (this.peek().kind !== TokenKind.RightParen) {
        throw new Error(`expected ')' in expression, got '${this.describe(this.peek())}'`)
      }
      this.next()
      return expression
    }
    if (token.kind === TokenKind.Identifier) {
      if (this.peek().kind === TokenKind.LeftParen) {
        this.next()
        const argument = this.parseAddSub()
        if (this.peek().kind !== TokenKind.RightParen) {
          throw new Error(`expected ')' after argument of ${token.value} in expression`)
        }
        this.next()
        return { kind: ExprKind.Call, functionName: token.value, argument }
      }
      return { kind: ExprKind.Variable, name: token.value }
    }
    throw new Error(`unexpected token '${this.describe(token)}' in expression`)
  }

  private peek(): Token {
    return this.tokens[this.position]!
  }

  private next(): Token {
    return this.tokens[this.position++]!
  }

  private describe(token: Token): string {
    return token.kind === TokenKind.Number || token.kind === TokenKind.Identifier || token.kind === TokenKind.Operator
      ? `${token.kind} '${token.value}'`
      : token.kind
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────

function evaluate(expression: Expr, variables: Record<string, Complex>): Complex {
  switch (expression.kind) {
    case ExprKind.Number:
      return expression.value
    case ExprKind.Variable: {
      const constant = CONSTANTS[expression.name]
      if (constant !== undefined) return constant
      const value = variables[expression.name]
      if (value === undefined) {
        throw new Error(`unbound variable '${expression.name}' — provide it in variables, or it may be a typo`)
      }
      return value
    }
    case ExprKind.Negate:
      return evaluate(expression.operand, variables).neg()
    case ExprKind.Binary: {
      if (expression.operator === BinaryOperator.Power) {
        return evaluatePower(evaluate(expression.left, variables), evaluate(expression.right, variables))
      }
      const left = evaluate(expression.left, variables)
      const right = evaluate(expression.right, variables)
      switch (expression.operator) {
        case BinaryOperator.Add:
          return left.add(right)
        case BinaryOperator.Subtract:
          return left.sub(right)
        case BinaryOperator.Multiply:
          return left.mul(right)
        case BinaryOperator.Divide:
          return left.div(right)
      }
      throw new Error(`unknown operator '${expression.operator}'`)
    }
    case ExprKind.Call: {
      const fn = FUNCTIONS[expression.functionName]
      if (fn === undefined) {
        throw new Error(`unknown function '${expression.functionName}' — available: ${Object.keys(FUNCTIONS).join(', ')}`)
      }
      return fn(evaluate(expression.argument, variables))
    }
  }
}

/** Complex power with the principal branch: a^b = exp(b·ln(a)). */
function evaluatePower(base: Complex, exponent: Complex): Complex {
  if (exponent.im === 0) {
    const n = exponent.re
    if (Number.isInteger(n) && n >= 0) {
      let result = new Complex(1, 0)
      for (let i = 0; i < n; i++) result = result.mul(base)
      return result
    }
  }
  return exponent.mul(base.log()).exp()
}

/** Whether the expression tree mentions the variable. */
function containsVariable(expression: Expr, name: string): boolean {
  switch (expression.kind) {
    case ExprKind.Number:
      return false
    case ExprKind.Variable:
      return expression.name === name
    case ExprKind.Negate:
      return containsVariable(expression.operand, name)
    case ExprKind.Binary:
      return containsVariable(expression.left, name) || containsVariable(expression.right, name)
    case ExprKind.Call:
      return containsVariable(expression.argument, name)
  }
}

// ── Rational function expansion ──────────────────────────────────────────

/**
 * Reduce an expression built from + - * / and integer powers in one variable
 * to a single rational function and return its numerator/denominator
 * coefficients in descending power order, [aₙ … a₁, a₀]. Pure polynomials
 * come back with denominator [1]; negative powers (s^-1), nested divisions
 * and sums of rationals are normalized automatically. Common factors are
 * canceled unless reduce is false. Functions of the variable (sin(x)) and
 * non-integer powers are rejected.
 */
export function rationalCoefficients(
  source: string,
  variable = 'x',
  reduce = true,
  parameters: Record<string, Complex> = {},
): { numerator: Complex[]; denominator: Complex[] } {
  const expression = new Parser(tokenize(source)).parse()
  let rational = rationalOf(expression, variable, parameters)
  if (isZeroPolynomial(rational.denominator)) {
    throw new Error('denominator is identically zero — division by the zero polynomial')
  }
  if (reduce) {
    const gcd = polynomialGcd(rational.numerator, rational.denominator)
    if (gcd.length > 1) {
      rational = {
        numerator: divideAscending(rational.numerator.slice().reverse(), gcd.slice().reverse()).quotient.reverse(),
        denominator: divideAscending(rational.denominator.slice().reverse(), gcd.slice().reverse()).quotient.reverse(),
      }
    }
  }
  return {
    numerator: trimPolynomial(rational.numerator),
    denominator: trimPolynomial(rational.denominator),
  }
}

/** Reduce a subtree to one rational function; parameters supply symbol values. */
function rationalOf(expression: Expr, variable: string, parameters: Record<string, Complex>): Rational {
  const ONE = new Complex(1, 0)
  switch (expression.kind) {
    case ExprKind.Number:
      return { numerator: [expression.value], denominator: [ONE] }
    case ExprKind.Variable: {
      if (expression.name === variable) {
        // the polynomial variable is x¹ = [1, 0]
        return { numerator: [new Complex(1, 0), new Complex(0, 0)], denominator: [ONE] }
      }
      const constant = CONSTANTS[expression.name]
      if (constant !== undefined) return { numerator: [constant], denominator: [ONE] }
      const parameter = parameters[expression.name]
      if (parameter !== undefined) return { numerator: [parameter], denominator: [ONE] }
      throw new Error(`unbound variable '${expression.name}' — provide it in variables, or it may be a typo`)
    }
    case ExprKind.Negate: {
      const rational = rationalOf(expression.operand, variable, parameters)
      return { numerator: rational.numerator.map((coefficient) => coefficient.neg()), denominator: rational.denominator }
    }
    case ExprKind.Binary: {
      if (expression.operator === BinaryOperator.Power) {
        // exponent must be a constant integer; negative powers flip the fraction
        if (containsVariable(expression.right, variable)) {
          throw new Error(`power exponent must not contain the variable for rational expansion, got an expression in ${variable}`)
        }
        const exponent = evaluate(expression.right, parameters)
        if (exponent.im !== 0 || !Number.isInteger(exponent.re)) {
          throw new Error(`rational expansion needs an integer exponent, got ${exponent.toString()}`)
        }
        let base = rationalOf(expression.left, variable, parameters)
        const power = Math.abs(exponent.re)
        if (exponent.re < 0) base = { numerator: base.denominator, denominator: base.numerator }
        let result: Rational = { numerator: [ONE], denominator: [ONE] }
        for (let i = 0; i < power; i++) result = multiplyRationals(result, base)
        return result
      }
      const left = rationalOf(expression.left, variable, parameters)
      const right = rationalOf(expression.right, variable, parameters)
      switch (expression.operator) {
        case BinaryOperator.Add:
          return addRationals(left, right)
        case BinaryOperator.Subtract:
          return subtractRationals(left, right)
        case BinaryOperator.Multiply:
          return multiplyRationals(left, right)
        case BinaryOperator.Divide:
          return divideRationals(left, right)
      }
      throw new Error(`operator '${expression.operator}' is not supported in rational expansion`)
    }
    case ExprKind.Call: {
      if (!containsVariable(expression.argument, variable)) {
        return { numerator: [evaluate(expression, parameters)], denominator: [ONE] }
      }
      throw new Error(`'${expression.functionName}(${variable})' is not a rational function of ${variable}`)
    }
  }
}

/** A/B + C/D = (AD + CB) / BD */
function addRationals(left: Rational, right: Rational): Rational {
  return {
    numerator: addPolynomials(
      convolvePolynomials(left.numerator, right.denominator),
      convolvePolynomials(right.numerator, left.denominator),
    ),
    denominator: convolvePolynomials(left.denominator, right.denominator),
  }
}

/** A/B − C/D = (AD − CB) / BD */
function subtractRationals(left: Rational, right: Rational): Rational {
  return {
    numerator: addPolynomials(
      convolvePolynomials(left.numerator, right.denominator),
      convolvePolynomials(right.numerator, left.denominator).map((coefficient) => coefficient.neg()),
    ),
    denominator: convolvePolynomials(left.denominator, right.denominator),
  }
}

/** A/B · C/D = AC / BD */
function multiplyRationals(left: Rational, right: Rational): Rational {
  return {
    numerator: convolvePolynomials(left.numerator, right.numerator),
    denominator: convolvePolynomials(left.denominator, right.denominator),
  }
}

/** (A/B) / (C/D) = AD / BC — avoid U+00F7: rolldown on Windows hangs on it even in comments */
function divideRationals(left: Rational, right: Rational): Rational {
  return {
    numerator: convolvePolynomials(left.numerator, right.denominator),
    denominator: convolvePolynomials(left.denominator, right.numerator),
  }
}

/** Trim leading zero coefficients, keeping at least one entry. */
function trimPolynomial(coefficients: Complex[]): Complex[] {
  let start = 0
  while (start < coefficients.length - 1 && coefficients[start]!.abs() === 0) start++
  return coefficients.slice(start)
}

/** A polynomial is zero when it trimmed down to a single zero entry. */
function isZeroPolynomial(coefficients: Complex[]): boolean {
  return coefficients.every((coefficient) => coefficient.abs() === 0)
}

/**
 * Long division in ascending coefficient order (index = power):
 * dividend = quotient · divisor + remainder. The highest (trailing) term of
 * the remainder is eliminated each round, so the loop strictly shrinks.
 */
function divideAscending(dividend: Complex[], divisor: Complex[]): { quotient: Complex[]; remainder: Complex[] } {
  const remainder = dividend.slice()
  const quotient: Complex[] = new Array(Math.max(dividend.length - divisor.length + 1, 0)).fill(null).map(() => new Complex(0, 0))
  const leading = divisor[divisor.length - 1]!
  while (remainder.length >= divisor.length && remainder[remainder.length - 1]!.abs() !== 0) {
    const degree = remainder.length - divisor.length
    const factor = remainder[remainder.length - 1]!.div(leading)
    quotient[degree] = quotient[degree]!.add(factor)
    for (let i = 0; i < divisor.length; i++) {
      remainder[degree + i] = remainder[degree + i]!.sub(factor.mul(divisor[i]!))
    }
    remainder.pop()
    while (remainder.length > 0 && remainder[remainder.length - 1]!.abs() === 0) remainder.pop()
  }
  return { quotient: trimAscending(quotient), remainder: trimAscending(remainder) }
}

/** Strip trailing (high-power) zeros from an ascending array; empty stays empty. */
function trimAscending(ascending: Complex[]): Complex[] {
  let end = ascending.length
  while (end > 0 && ascending[end - 1]!.abs() === 0) end--
  return ascending.slice(0, end)
}

/** An ascending array is zero when every entry vanishes (empty counts). */
function isZeroAscending(ascending: Complex[]): boolean {
  return ascending.every((coefficient) => coefficient.abs() === 0)
}

/** Polynomial GCD by the Euclidean algorithm (ascending order), made monic. */
function polynomialGcd(left: Complex[], right: Complex[]): Complex[] {
  let a = trimPolynomial(left).reverse()
  let b = trimPolynomial(right).reverse()
  while (!isZeroAscending(b)) {
    const { remainder } = divideAscending(a, b)
    a = b
    b = remainder
  }
  const leading = a[a.length - 1]!
  return a.map((coefficient) => coefficient.div(leading)).reverse()
}

/** Align lengths, then add element-wise. */
function addPolynomials(left: Complex[], right: Complex[]): Complex[] {
  const length = Math.max(left.length, right.length)
  const result: Complex[] = []
  for (let i = 0; i < length; i++) {
    const l = left[left.length - 1 - i] ?? new Complex(0, 0)
    const r = right[right.length - 1 - i] ?? new Complex(0, 0)
    result.unshift(l.add(r))
  }
  return result
}

/** Multiplication as coefficient convolution. */
function convolvePolynomials(left: Complex[], right: Complex[]): Complex[] {
  const result: Complex[] = new Array(left.length + right.length - 1).fill(null).map(() => new Complex(0, 0))
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      result[i + j] = result[i + j]!.add(left[i]!.mul(right[j]!))
    }
  }
  return result
}

// ── Public entry ─────────────────────────────────────────────────────────

/** Evaluate a string expression; every value is complex (real = im 0). */
export function calculateExpression(source: string, variables: Record<string, Complex> = {}): Complex {
  if (source.trim() === '') throw new Error('expression is empty')
  const expression = new Parser(tokenize(source)).parse()
  return evaluate(expression, variables)
}
