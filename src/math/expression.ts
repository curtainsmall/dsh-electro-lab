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
 * Constants: pi, e. Functions: sin cos tan asin acos atan atan2 exp ln log10
 * sqrt abs arg conjugate real imag (atan2(y, x) = angle of x + j·y; real
 * inputs give the standard two-argument arctangent). Everything else is a
 * variable; unbound variables error on evaluation.
 */
import { Complex } from 'complex.js'
import {
  addPolynomials,
  convolvePolynomials,
  dividePolynomials,
  isZeroPolynomial,
  findPolyGcd,
  trimPolynomial,
  type Polynomial,
} from './polynomial.ts'

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
  | { kind: ExprKind.Call; functionName: string; arguments: Expr[] }

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
  numerator: Polynomial
  denominator: Polynomial
}

// ── Pure mappings ────────────────────────────────────────────────────────

const CONSTANTS: Record<string, Complex> = {
  pi: new Complex(Math.PI, 0),
  e: new Complex(Math.E, 0),
  j: new Complex(0, 1),
  i: new Complex(0, 1),
}

/** Functions callable in expressions; all complex-valued. Rest parameters
 *  keep the declared arity (fn.length) available for argument-count checks. */
const FUNCTIONS: Record<string, (...args: Complex[]) => Complex> = {
  sin: (z) => z.sin(),
  cos: (z) => z.cos(),
  tan: (z) => z.tan(),
  asin: (z) => z.asin(),
  acos: (z) => z.acos(),
  atan: (z) => z.atan(),
  // atan2(y, x) = arg(x + j·y); for real inputs this is Math.atan2(y, x)
  atan2: (y, x) => new Complex(x.add(y.mul(new Complex(0, 1))).arg(), 0),
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
        const callArguments: Expr[] = []
        if (this.peek().kind !== TokenKind.RightParen) {
          callArguments.push(this.parseAddSub())
          while (this.peek().kind === TokenKind.Comma) {
            this.next()
            callArguments.push(this.parseAddSub())
          }
        }
        if (this.peek().kind !== TokenKind.RightParen) {
          throw new Error(`expected ')' after arguments of ${token.value} in expression`)
        }
        this.next()
        return { kind: ExprKind.Call, functionName: token.value, arguments: callArguments }
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
      const values = expression.arguments.map((argument) => evaluate(argument, variables))
      if (values.length !== fn.length) {
        throw new Error(`function '${expression.functionName}' expects ${fn.length} argument(s), got ${values.length}`)
      }
      return fn(...values)
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
      return expression.arguments.some((argument) => containsVariable(argument, name))
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
export function reduceRational(
  source: string,
  variable = 'x',
  reduce = true,
  parameters: Record<string, Complex> = {},
): { numerator: Polynomial; denominator: Polynomial } {
  const expression = new Parser(tokenize(source)).parse()
  let rational = reduceRationalOf(expression, variable, parameters)
  if (isZeroPolynomial(rational.denominator)) {
    throw new Error('denominator is identically zero — division by the zero polynomial')
  }
  if (reduce) {
    const gcd = findPolyGcd(rational.numerator, rational.denominator)
    if (gcd.length > 1) {
      rational = {
        numerator: dividePolynomials(rational.numerator, gcd).quotient,
        denominator: dividePolynomials(rational.denominator, gcd).quotient,
      }
    }
  }
  return {
    numerator: trimPolynomial(rational.numerator),
    denominator: trimPolynomial(rational.denominator),
  }
}

/** Reduce a subtree to one rational function; parameters supply symbol values. */
function reduceRationalOf(expression: Expr, variable: string, parameters: Record<string, Complex>): Rational {
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
      const rational = reduceRationalOf(expression.operand, variable, parameters)
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
        let base = reduceRationalOf(expression.left, variable, parameters)
        const power = Math.abs(exponent.re)
        if (exponent.re < 0) base = { numerator: base.denominator, denominator: base.numerator }
        let result: Rational = { numerator: [ONE], denominator: [ONE] }
        for (let i = 0; i < power; i++) result = multiplyRationals(result, base)
        return result
      }
      const left = reduceRationalOf(expression.left, variable, parameters)
      const right = reduceRationalOf(expression.right, variable, parameters)
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
      if (expression.arguments.every((argument) => !containsVariable(argument, variable))) {
        return { numerator: [evaluate(expression, parameters)], denominator: [ONE] }
      }
      throw new Error(`'${expression.functionName}(…)' is not a rational function of ${variable}`)
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

// ── Public entry ─────────────────────────────────────────────────────────

/** Evaluate a string expression; every value is complex (real = im 0). */
export function calcExpression(source: string, variables: Record<string, Complex> = {}): Complex {
  if (source.trim() === '') throw new Error('expression is empty')
  const expression = new Parser(tokenize(source)).parse()
  return evaluate(expression, variables)
}
