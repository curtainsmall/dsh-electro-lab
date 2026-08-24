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

// ── Polynomial coefficient extraction ────────────────────────────────────

/**
 * Expand an expression about one variable and return its coefficients in
 * descending power order, [aₙ … a₁, a₀] (highest degree first). The result
 * is a polynomial in that variable alone; functions of the variable (e.g.
 * sin(x)) and non-integer powers are rejected.
 */
export function polynomialCoefficients(source: string, variable = 'x'): { degree: number; coefficients: Complex[] } {
  const expression = new Parser(tokenize(source)).parse()
  if (!containsVariable(expression, variable)) {
    return { degree: 0, coefficients: [evaluate(expression, {})] }
  }
  const coefficients = polynomialOf(expression, variable)
  while (coefficients.length > 1 && coefficients[0]!.abs() === 0) coefficients.shift()
  return { degree: coefficients.length - 1, coefficients }
}

/** Coeffs of a subtree about `variable`, descending order, without trimming. */
function polynomialOf(expression: Expr, variable: string): Complex[] {
  switch (expression.kind) {
    case ExprKind.Number:
      return [expression.value]
    case ExprKind.Variable: {
      // the polynomial variable is x¹ = [1, 0]; any other identifier is a constant (pi, e, j, i, …)
      return expression.name === variable ? [new Complex(1, 0), new Complex(0, 0)] : [evaluate(expression, {})]
    }
    case ExprKind.Negate:
      return polynomialOf(expression.operand, variable).map((coefficient) => coefficient.neg())
    case ExprKind.Binary: {
      if (expression.operator === BinaryOperator.Add || expression.operator === BinaryOperator.Subtract) {
        const left = polynomialOf(expression.left, variable)
        const right = polynomialOf(expression.right, variable)
        return addPolynomials(left, expression.operator === BinaryOperator.Add ? right : right.map((coefficient) => coefficient.neg()))
      }
      if (expression.operator === BinaryOperator.Multiply) {
        return convolvePolynomials(polynomialOf(expression.left, variable), polynomialOf(expression.right, variable))
      }
      if (expression.operator === BinaryOperator.Power) {
        const right = polynomialOf(expression.right, variable)
        const isConstant = right.length === 1 && right[0]!.im === 0
        if (!isConstant) throw new Error(`power base/degree must be a constant integer for polynomial expansion, got ${right.length === 1 ? right[0]!.toString() : 'an expression in ' + variable}`)
        const degree = right[0]!.re
        if (!Number.isInteger(degree) || degree < 0) {
          throw new Error(`polynomial expansion needs a non-negative integer power, got ${degree}`)
        }
        const base = polynomialOf(expression.left, variable)
        let result: Complex[] = [new Complex(1, 0)]
        for (let i = 0; i < degree; i++) result = convolvePolynomials(result, base)
        return result
      }
      throw new Error(`operator '${expression.operator}' is not supported in polynomial expansion`)
    }
    case ExprKind.Call: {
      if (!containsVariable(expression.argument, variable)) {
        return [evaluate(expression, {})]
      }
      throw new Error(`'${expression.functionName}(${variable})' is not a polynomial in ${variable}`)
    }
  }
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
