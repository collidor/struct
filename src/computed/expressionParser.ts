import type { ASTExpression } from './astEvaluator'

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'PUNCTUATION'
  | 'EOF'

export interface Token {
  type: TokenType
  value: string | number | boolean | null
  pos: number
}

const enum Precedence {
  NONE = 0,
  TERNARY = 1, // ? :
  LOGICAL_OR = 2, // ||
  LOGICAL_AND = 3, // &&
  EQUALITY = 4, // ==, !=
  RELATIONAL = 5, // <, <=, >, >=
  ADDITIVE = 6, // +, -
  MULTIPLICATIVE = 7, // *, /, %
  EXPONENTIATION = 8, // **
  UNARY = 9, // - !
}

function getBinaryPrecedence(op: string): number {
  switch (op) {
    case '||':
      return Precedence.LOGICAL_OR
    case '&&':
      return Precedence.LOGICAL_AND
    case '==':
    case '!=':
      return Precedence.EQUALITY
    case '<':
    case '<=':
    case '>':
    case '>=':
      return Precedence.RELATIONAL
    case '+':
    case '-':
      return Precedence.ADDITIVE
    case '*':
    case '/':
    case '%':
      return Precedence.MULTIPLICATIVE
    case '**':
      return Precedence.EXPONENTIATION
    default:
      return Precedence.NONE
  }
}

/**
 * Zero-dependency lexical tokenizer for computed property expressions.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Skip single-line comments // ...
    if (ch === '/' && input[i + 1] === '/') {
      i += 2
      while (i < len && input[i] !== '\n') {
        i++
      }
      continue
    }

    // Skip multi-line comments /* ... */
    if (ch === '/' && input[i + 1] === '*') {
      i += 2
      while (i < len && !(input[i] === '*' && input[i + 1] === '/')) {
        i++
      }
      if (i >= len) {
        throw new Error(`Unterminated multi-line comment at position ${i}`)
      }
      i += 2
      continue
    }

    const startPos = i

    // Numbers: integer, float (e.g. 123, 3.14, .5), with optional scientific notation (1e5)
    if (
      (ch >= '0' && ch <= '9') ||
      (ch === '.' && i + 1 < len && input[i + 1] >= '0' && input[i + 1] <= '9')
    ) {
      let numStr = ''
      while (i < len && input[i] >= '0' && input[i] <= '9') {
        numStr += input[i++]
      }
      if (i < len && input[i] === '.') {
        numStr += input[i++]
        while (i < len && input[i] >= '0' && input[i] <= '9') {
          numStr += input[i++]
        }
      }
      if (i < len && (input[i] === 'e' || input[i] === 'E')) {
        numStr += input[i++]
        if (i < len && (input[i] === '+' || input[i] === '-')) {
          numStr += input[i++]
        }
        while (i < len && input[i] >= '0' && input[i] <= '9') {
          numStr += input[i++]
        }
      }
      const numVal = Number(numStr)
      if (Number.isNaN(numVal)) {
        throw new Error(`Invalid number '${numStr}' at position ${startPos}`)
      }
      tokens.push({ type: 'NUMBER', value: numVal, pos: startPos })
      continue
    }

    // Strings: single '...' or double "..." quotes
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      let strVal = ''
      while (i < len && input[i] !== quote) {
        if (input[i] === '\\') {
          i++
          if (i >= len) {
            throw new Error(`Unterminated string escape at position ${i}`)
          }
          const esc = input[i]
          switch (esc) {
            case 'n':
              strVal += '\n'
              break
            case 'r':
              strVal += '\r'
              break
            case 't':
              strVal += '\t'
              break
            case '\\':
              strVal += '\\'
              break
            case '"':
              strVal += '"'
              break
            case "'":
              strVal += "'"
              break
            default:
              strVal += esc
              break
          }
          i++
        } else {
          strVal += input[i++]
        }
      }
      if (i >= len) {
        throw new Error(`Unterminated string literal at position ${startPos}`)
      }
      i++ // consume closing quote
      tokens.push({ type: 'STRING', value: strVal, pos: startPos })
      continue
    }

    // Identifiers & Keywords: letters, _, $
    if (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch === '$'
    ) {
      let id = ''
      while (
        i < len &&
        ((input[i] >= 'a' && input[i] <= 'z') ||
          (input[i] >= 'A' && input[i] <= 'Z') ||
          (input[i] >= '0' && input[i] <= '9') ||
          input[i] === '_' ||
          input[i] === '$')
      ) {
        id += input[i++]
      }

      if (id === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, pos: startPos })
      } else if (id === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, pos: startPos })
      } else if (id === 'null') {
        tokens.push({ type: 'NULL', value: null, pos: startPos })
      } else {
        tokens.push({ type: 'IDENTIFIER', value: id, pos: startPos })
      }
      continue
    }

    // 3-character operators: ===, !==
    const threeChars = input.slice(i, i + 3)
    if (threeChars === '===' || threeChars === '!==') {
      tokens.push({
        type: 'OPERATOR',
        value: threeChars === '===' ? '==' : '!=',
        pos: startPos,
      })
      i += 3
      continue
    }

    // 2-character operators: ==, !=, <=, >=, &&, ||, **
    const twoChars = input.slice(i, i + 2)
    if (
      twoChars === '==' ||
      twoChars === '!=' ||
      twoChars === '<=' ||
      twoChars === '>=' ||
      twoChars === '&&' ||
      twoChars === '||' ||
      twoChars === '**'
    ) {
      tokens.push({ type: 'OPERATOR', value: twoChars, pos: startPos })
      i += 2
      continue
    }

    // 1-character operators: +, -, *, /, %, <, >, !
    if ('+-*/%<>!'.includes(ch)) {
      tokens.push({ type: 'OPERATOR', value: ch, pos: startPos })
      i++
      continue
    }

    // Punctuation: ?, :, (, ), ,, .
    if ('?:(),.'.includes(ch)) {
      tokens.push({ type: 'PUNCTUATION', value: ch, pos: startPos })
      i++
      continue
    }

    throw new Error(`Unexpected character '${ch}' at position ${startPos}`)
  }

  tokens.push({ type: 'EOF', value: null, pos: len })
  return tokens
}

/**
 * Pratt parser converting a stream of tokens into an ASTExpression.
 */
class PrattParser {
  private index = 0

  constructor(private tokens: Token[]) {}

  public isAtEnd(): boolean {
    return this.peek().type === 'EOF'
  }

  public peek(): Token {
    return this.tokens[this.index] ?? { type: 'EOF', value: null, pos: 0 }
  }

  private advance(): Token {
    const token = this.peek()
    if (!this.isAtEnd()) {
      this.index++
    }
    return token
  }

  private expectPunctuation(expected: string): Token {
    const token = this.peek()
    if (token.type !== 'PUNCTUATION' || token.value !== expected) {
      throw new Error(
        `Expected '${expected}' at position ${token.pos}, found '${String(token.value)}'`
      )
    }
    return this.advance()
  }

  public parse(): ASTExpression {
    return this.parseExpression(Precedence.NONE)
  }

  public parseExpression(precedence: number): ASTExpression {
    const token = this.peek()

    let left: ASTExpression

    // Prefix expressions
    switch (token.type) {
      case 'NUMBER': {
        this.advance()
        left = { type: 'Literal', value: token.value as number }
        break
      }
      case 'STRING': {
        this.advance()
        left = { type: 'Literal', value: token.value as string }
        break
      }
      case 'BOOLEAN': {
        this.advance()
        left = { type: 'Literal', value: token.value as boolean }
        break
      }
      case 'NULL': {
        this.advance()
        left = { type: 'Literal', value: null }
        break
      }
      case 'OPERATOR': {
        const op = token.value as string
        if (op === '-' || op === '!') {
          this.advance()
          const argument = this.parseExpression(Precedence.UNARY)
          left = { type: 'UnaryOp', operator: op, argument }
          break
        }
        throw new Error(
          `Unexpected prefix operator '${op}' at position ${token.pos}`
        )
      }
      case 'PUNCTUATION': {
        if (token.value === '(') {
          this.advance() // consume '('
          left = this.parseExpression(Precedence.NONE)
          this.expectPunctuation(')')
          break
        }
        throw new Error(
          `Unexpected token '${String(token.value)}' at position ${token.pos}`
        )
      }
      case 'IDENTIFIER': {
        this.advance()
        let identifierName = token.value as string

        // Support dot notation: stats.dexterity, user.profile.name
        while (
          this.peek().type === 'PUNCTUATION' &&
          this.peek().value === '.'
        ) {
          this.advance() // consume '.'
          const nextTok = this.peek()
          if (nextTok.type !== 'IDENTIFIER') {
            throw new Error(
              `Expected identifier after '.' at position ${nextTok.pos}`
            )
          }
          this.advance()
          identifierName += `.${String(nextTok.value)}`
        }

        // Check if followed by '(' -> function call
        if (
          this.peek().type === 'PUNCTUATION' &&
          this.peek().value === '('
        ) {
          this.advance() // consume '('
          const args = this.parseArguments()
          left = { type: 'Call', callee: identifierName, arguments: args }
        } else {
          left = { type: 'Identifier', name: identifierName }
        }
        break
      }
      case 'EOF': {
        throw new Error(`Unexpected end of expression at position ${token.pos}`)
      }
      default: {
        throw new Error(
          `Unexpected token '${String(token.value)}' at position ${token.pos}`
        )
      }
    }

    // Infix expressions loop
    while (!this.isAtEnd()) {
      const next = this.peek()

      // 1. Ternary conditional: `test ? consequent : alternate`
      if (next.type === 'PUNCTUATION' && next.value === '?') {
        if (Precedence.TERNARY <= precedence) {
          break
        }
        this.advance() // consume '?'
        const consequent = this.parseExpression(Precedence.NONE)
        this.expectPunctuation(':')
        const alternate = this.parseExpression(Precedence.TERNARY - 1)
        left = {
          type: 'Conditional',
          test: left,
          consequent,
          alternate,
        }
        continue
      }

      // 2. Binary operators
      if (next.type === 'OPERATOR') {
        const op = next.value as string
        const opPrec = getBinaryPrecedence(op)
        if (opPrec <= precedence) {
          break
        }
        this.advance() // consume operator

        // Exponentiation (**) is right-associative: parse right with (opPrec - 1)
        const rightPrec = op === '**' ? opPrec - 1 : opPrec
        const right = this.parseExpression(rightPrec)

        left = {
          type: 'BinaryOp',
          operator: op as
            | '+'
            | '-'
            | '*'
            | '/'
            | '%'
            | '**'
            | '=='
            | '!='
            | '<'
            | '<='
            | '>'
            | '>='
            | '&&'
            | '||',
          left,
          right,
        }
        continue
      }

      break
    }

    return left
  }

  private parseArguments(): ASTExpression[] {
    const args: ASTExpression[] = []
    if (this.peek().type === 'PUNCTUATION' && this.peek().value === ')') {
      this.advance() // consume ')'
      return args
    }

    while (true) {
      args.push(this.parseExpression(Precedence.NONE))

      const token = this.peek()
      if (token.type === 'PUNCTUATION' && token.value === ',') {
        this.advance() // consume ','
        // Allow optional trailing comma: foo(a, b,)
        if (
          this.peek().type === 'PUNCTUATION' &&
          this.peek().value === ')'
        ) {
          this.advance()
          break
        }
      } else if (
        token.type === 'PUNCTUATION' &&
        token.value === ')'
      ) {
        this.advance() // consume ')'
        break
      } else {
        throw new Error(
          `Expected ',' or ')' at position ${token.pos}, found '${String(token.value)}'`
        )
      }
    }

    return args
  }
}

/**
 * Parses a mathematical and logical expression string into an ASTExpression tree.
 *
 * @example
 * ```ts
 * const ast = parseExpression('clamp(base_hp + constitution * 2, 0, max_hp)')
 * ```
 */
export function parseExpression(input: string): ASTExpression {
  if (!input || input.trim() === '') {
    throw new Error('Unexpected end of expression: input is empty')
  }

  const tokens = tokenize(input)
  const parser = new PrattParser(tokens)
  const ast = parser.parse()

  if (!parser.isAtEnd()) {
    const cur = parser.peek()
    throw new Error(
      `Unexpected token '${String(cur.value)}' at position ${cur.pos}`
    )
  }

  return ast
}

/**
 * Extracts all unique identifier property names referenced in an AST expression.
 * Used for automatic dependency tracking in ComputedPropertiesEngine.
 */
export function extractDependencies(expr: ASTExpression): string[] {
  const deps = new Set<string>()

  function walk(node: ASTExpression): void {
    switch (node.type) {
      case 'Literal':
        break
      case 'Identifier':
        deps.add(node.name)
        break
      case 'UnaryOp':
        walk(node.argument)
        break
      case 'BinaryOp':
        walk(node.left)
        walk(node.right)
        break
      case 'Call':
        for (const arg of node.arguments) {
          walk(arg)
        }
        break
      case 'Conditional':
        walk(node.test)
        walk(node.consequent)
        walk(node.alternate)
        break
    }
  }

  walk(expr)
  return Array.from(deps)
}
