import { describe, it, expect } from 'vitest'
import {
  tokenize,
  parseExpression,
  extractDependencies,
} from '../expressionParser'
import {
  ComputedPropertiesEngine,
  evaluateAST,
  evaluateExpression,
  type ASTExpression,
} from '../astEvaluator'

describe('Expression Tokenizer', () => {
  it('tokenizes numbers, strings, booleans, and null', () => {
    const tokens = tokenize('42 3.14 1e3 "hello \\"world\\"" \'single\' true false null')
    expect(tokens.map((t) => t.type)).toEqual([
      'NUMBER',
      'NUMBER',
      'NUMBER',
      'STRING',
      'STRING',
      'BOOLEAN',
      'BOOLEAN',
      'NULL',
      'EOF',
    ])
    expect(tokens[0].value).toBe(42)
    expect(tokens[1].value).toBe(3.14)
    expect(tokens[2].value).toBe(1000)
    expect(tokens[3].value).toBe('hello "world"')
    expect(tokens[4].value).toBe('single')
    expect(tokens[5].value).toBe(true)
    expect(tokens[6].value).toBe(false)
    expect(tokens[7].value).toBeNull()
  })

  it('tokenizes single and multi-character operators', () => {
    const tokens = tokenize('+ - * / % ** == === != !== < <= > >= && || ! ? :')
    const opValues = tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.value)
    expect(opValues).toEqual([
      '+',
      '-',
      '*',
      '/',
      '%',
      '**',
      '==',
      '==',
      '!=',
      '!=',
      '<',
      '<=',
      '>',
      '>=',
      '&&',
      '||',
      '!',
    ])
  })

  it('ignores single-line and multi-line comments', () => {
    const tokens = tokenize(`
      // comment at top
      hp /* inlined comment */ + 10 // trailing comment
    `)
    expect(tokens.map((t) => t.value)).toEqual(['hp', '+', 10, null])
  })

  it('throws on unterminated strings or comments', () => {
    expect(() => tokenize('"unclosed string')).toThrow('Unterminated string literal')
    expect(() => tokenize('/* unclosed comment')).toThrow('Unterminated multi-line comment')
    expect(() => tokenize('@invalid')).toThrow("Unexpected character '@'")
  })
})

describe('Expression Parser (Pratt)', () => {
  it('parses basic arithmetic respecting standard operator precedence', () => {
    const ast = parseExpression('1 + 2 * 3')
    expect(ast).toEqual({
      type: 'BinaryOp',
      operator: '+',
      left: { type: 'Literal', value: 1 },
      right: {
        type: 'BinaryOp',
        operator: '*',
        left: { type: 'Literal', value: 2 },
        right: { type: 'Literal', value: 3 },
      },
    })
    expect(evaluateAST(ast, {})).toBe(7)
  })

  it('parses parenthesized sub-expressions', () => {
    const ast = parseExpression('(1 + 2) * 3')
    expect(ast).toEqual({
      type: 'BinaryOp',
      operator: '*',
      left: {
        type: 'BinaryOp',
        operator: '+',
        left: { type: 'Literal', value: 1 },
        right: { type: 'Literal', value: 2 },
      },
      right: { type: 'Literal', value: 3 },
    })
    expect(evaluateAST(ast, {})).toBe(9)
  })

  it('parses right-associative exponentiation (**)', () => {
    const ast = parseExpression('2 ** 3 ** 2')
    // 2 ** (3 ** 2) = 2 ** 9 = 512
    expect(evaluateAST(ast, {})).toBe(512)

    const groupedAst = parseExpression('(2 ** 3) ** 2')
    // (8) ** 2 = 64
    expect(evaluateAST(groupedAst, {})).toBe(64)
  })

  it('parses unary negation and logical NOT', () => {
    const ast1 = parseExpression('-hp')
    expect(ast1).toEqual({
      type: 'UnaryOp',
      operator: '-',
      argument: { type: 'Identifier', name: 'hp' },
    })
    expect(evaluateAST(ast1, { hp: 25 })).toBe(-25)

    const ast2 = parseExpression('!is_dead')
    expect(ast2).toEqual({
      type: 'UnaryOp',
      operator: '!',
      argument: { type: 'Identifier', name: 'is_dead' },
    })
    expect(evaluateAST(ast2, { is_dead: false })).toBe(true)

    const ast3 = parseExpression('-5 + 10')
    expect(evaluateAST(ast3, {})).toBe(5)
  })

  it('parses comparisons and logical operators', () => {
    expect(evaluateExpression('hp > 0 && stamina >= 10', { hp: 5, stamina: 10 })).toBe(true)
    expect(evaluateExpression('hp > 0 && stamina >= 10', { hp: 5, stamina: 9 })).toBe(false)
    expect(evaluateExpression('role == "admin" || is_super', { role: 'user', is_super: true })).toBe(true)
    expect(evaluateExpression('status != "banned"', { status: 'active' })).toBe(true)
  })

  it('parses ternary conditional expressions (a ? b : c)', () => {
    const ast = parseExpression('hp > 0 ? "alive" : "dead"')
    expect(evaluateAST(ast, { hp: 10 })).toBe('alive')
    expect(evaluateAST(ast, { hp: 0 })).toBe('dead')

    // Nested ternary
    const nested = parseExpression('score >= 90 ? "A" : score >= 80 ? "B" : "C"')
    expect(evaluateAST(nested, { score: 95 })).toBe('A')
    expect(evaluateAST(nested, { score: 85 })).toBe('B')
    expect(evaluateAST(nested, { score: 70 })).toBe('C')
  })

  it('parses function calls with multiple arguments and built-in functions', () => {
    expect(evaluateExpression('clamp(hp - damage, 0, max_hp)', { hp: 15, damage: 25, max_hp: 50 })).toBe(0)
    expect(evaluateExpression('clamp(hp - damage, 0, max_hp)', { hp: 15, damage: 5, max_hp: 50 })).toBe(10)
    expect(evaluateExpression('floor(10.75)')).toBe(10)
    expect(evaluateExpression('ceil(10.25)')).toBe(11)
    expect(evaluateExpression('round(10.5)')).toBe(11)
    expect(evaluateExpression('abs(-42)')).toBe(42)
    expect(evaluateExpression('min(10, 5, 20)')).toBe(5)
    expect(evaluateExpression('max(10, 5, 20)')).toBe(20)
    expect(evaluateExpression('sqrt(25)')).toBe(5)
    expect(evaluateExpression('pow(2, 4)')).toBe(16)
  })

  it('supports custom context functions in expressions', () => {
    const context = {
      name: 'Alice',
      greet: (n: string) => `Hello, ${n}!`,
    }
    expect(evaluateExpression('greet(name)', context)).toBe('Hello, Alice!')
  })

  it('supports dotted property access (stats.dexterity)', () => {
    const context = {
      stats: {
        dexterity: 14,
        strength: 18,
      },
    }
    expect(evaluateExpression('stats.dexterity * 2 + stats.strength', context)).toBe(46)
    expect(evaluateExpression('stats . dexterity + 1', context)).toBe(15)
  })

  it('throws descriptive errors on malformed syntax', () => {
    expect(() => parseExpression('')).toThrow('Unexpected end of expression')
    expect(() => parseExpression('   ')).toThrow('Unexpected end of expression')
    expect(() => parseExpression('1 + ')).toThrow('Unexpected end of expression')
    expect(() => parseExpression('(1 + 2')).toThrow("Expected ')'")
    expect(() => parseExpression('hp > 0 ? "alive"')).toThrow("Expected ':'")
    expect(() => parseExpression('1 + * 2')).toThrow("Unexpected prefix operator '*'")
    expect(() => parseExpression('1 + 2 3')).toThrow("Unexpected token '3'")
  })
})

describe('extractDependencies', () => {
  it('extracts all referenced identifiers without duplicates', () => {
    const ast = parseExpression('clamp(base_hp + constitution * 2, 0, max_hp)')
    const deps = extractDependencies(ast)
    expect(deps).toEqual(['base_hp', 'constitution', 'max_hp'])
  })

  it('extracts dotted property paths as dependencies', () => {
    const ast = parseExpression('stats.strength * 2 + bonus')
    const deps = extractDependencies(ast)
    expect(deps).toEqual(['stats.strength', 'bonus'])
  })

  it('deduplicates repeatedly accessed properties', () => {
    const ast = parseExpression('hp + hp * 2 + hp / 3')
    const deps = extractDependencies(ast)
    expect(deps).toEqual(['hp'])
  })

  it('returns empty array when expression has no identifiers', () => {
    const ast = parseExpression('10 * 20 + 30')
    const deps = extractDependencies(ast)
    expect(deps).toEqual([])
  })
})

describe('ComputedPropertiesEngine with String Formulas', () => {
  it('registers and evaluates formula strings with auto-extracted dependencies', () => {
    const engine = new ComputedPropertiesEngine()

    engine.defineComputed(
      'char_struct',
      'str_mod',
      'floor((strength - 10) / 2)'
    )

    engine.defineComputed(
      'char_struct',
      'melee_attack',
      'base_attack + str_mod'
    )

    const result = engine.computeAll('char_struct', {
      strength: 16,
      base_attack: 2,
    })

    expect(result.str_mod).toBe(3)
    expect(result.melee_attack).toBe(5)
  })

  it('supports default scope without explicit structId', () => {
    const engine = new ComputedPropertiesEngine()

    engine.defineComputed('effective_hp', 'clamp(base_hp + constitution * 2, 0, max_hp)')

    const result = engine.computeAll({
      base_hp: 20,
      constitution: 5,
      max_hp: 50,
    })

    expect(result.effective_hp).toBe(30)
  })

  it('allows explicit AST definitions alongside formula strings', () => {
    const engine = new ComputedPropertiesEngine()

    const rawAst: ASTExpression = {
      type: 'BinaryOp',
      operator: '+',
      left: { type: 'Identifier', name: 'gold' },
      right: { type: 'Literal', value: 100 },
    }

    engine.defineComputed('total_gold', rawAst)
    engine.defineComputed('is_rich', 'total_gold >= 500')

    const result = engine.computeAll({ gold: 450 })
    expect(result.total_gold).toBe(550)
    expect(result.is_rich).toBe(true)
  })
})
