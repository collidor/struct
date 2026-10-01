import { describe, it, expect } from 'vitest'
import { evaluateAST, ComputedPropertiesEngine, type ASTExpression } from '../astEvaluator'

describe('AST In-Memory Computed Properties Evaluator', () => {
  it('evaluates arithmetic and binary operations in-memory', () => {
    // (base_speed + dex_mod) * 2
    const expr: ASTExpression = {
      type: 'BinaryOp',
      operator: '*',
      left: {
        type: 'BinaryOp',
        operator: '+',
        left: { type: 'Identifier', name: 'base_speed' },
        right: { type: 'Identifier', name: 'dex_mod' },
      },
      right: { type: 'Literal', value: 2 },
    }

    const context = { base_speed: 30, dex_mod: 5 }
    const result = evaluateAST(expr, context)
    expect(result).toBe(70)
  })

  it('evaluates built-in math functions and conditionals', () => {
    // clamp(hp - damage, 0, max_hp)
    const expr: ASTExpression = {
      type: 'Call',
      callee: 'clamp',
      arguments: [
        {
          type: 'BinaryOp',
          operator: '-',
          left: { type: 'Identifier', name: 'hp' },
          right: { type: 'Identifier', name: 'damage' },
        },
        { type: 'Literal', value: 0 },
        { type: 'Identifier', name: 'max_hp' },
      ],
    }

    const context = { hp: 15, damage: 25, max_hp: 50 }
    const result = evaluateAST(expr, context)
    expect(result).toBe(0)
  })

  it('chains computed property definitions in ComputedPropertiesEngine', () => {
    const engine = new ComputedPropertiesEngine()

    // modifier = floor((strength - 10) / 2)
    engine.register('char_struct', {
      name: 'str_mod',
      ast: {
        type: 'Call',
        callee: 'floor',
        arguments: [
          {
            type: 'BinaryOp',
            operator: '/',
            left: {
              type: 'BinaryOp',
              operator: '-',
              left: { type: 'Identifier', name: 'strength' },
              right: { type: 'Literal', value: 10 },
            },
            right: { type: 'Literal', value: 2 },
          },
        ],
      },
      dependencies: ['strength'],
    })

    // melee_attack = base_attack + str_mod
    engine.register('char_struct', {
      name: 'melee_attack',
      ast: {
        type: 'BinaryOp',
        operator: '+',
        left: { type: 'Identifier', name: 'base_attack' },
        right: { type: 'Identifier', name: 'str_mod' },
      },
      dependencies: ['base_attack', 'str_mod'],
    })

    const entityData = { strength: 16, base_attack: 2 }
    const computed = engine.computeAll('char_struct', entityData)

    expect(computed.str_mod).toBe(3)
    expect(computed.melee_attack).toBe(5)
  })

  it('short-circuits logical AND and OR operators without evaluating RHS', () => {
    // false && non_existent_function() -> false without throwing
    const andExpr: ASTExpression = {
      type: 'BinaryOp',
      operator: '&&',
      left: { type: 'Literal', value: false },
      right: {
        type: 'Call',
        callee: 'non_existent_function',
        arguments: [],
      },
    }
    expect(evaluateAST(andExpr, {})).toBe(false)

    // true || non_existent_function() -> true without throwing
    const orExpr: ASTExpression = {
      type: 'BinaryOp',
      operator: '||',
      left: { type: 'Literal', value: true },
      right: {
        type: 'Call',
        callee: 'non_existent_function',
        arguments: [],
      },
    }
    expect(evaluateAST(orExpr, {})).toBe(true)
  })

  it('preserves operand values in logical AND and OR operators', () => {
    // name || 'default'
    const defaultExpr: ASTExpression = {
      type: 'BinaryOp',
      operator: '||',
      left: { type: 'Identifier', name: 'name' },
      right: { type: 'Literal', value: 'default' },
    }
    expect(evaluateAST(defaultExpr, { name: 'Alice' })).toBe('Alice')
    expect(evaluateAST(defaultExpr, { name: '' })).toBe('default')
    expect(evaluateAST(defaultExpr, { name: null })).toBe('default')

    // a && b
    const andExpr: ASTExpression = {
      type: 'BinaryOp',
      operator: '&&',
      left: { type: 'Identifier', name: 'prefix' },
      right: { type: 'Identifier', name: 'suffix' },
    }
    expect(evaluateAST(andExpr, { prefix: 'hello', suffix: 'world' })).toBe('world')
    expect(evaluateAST(andExpr, { prefix: 0, suffix: 'world' })).toBe(0)
  })

  it('correctly orders out-of-order dependent computed properties topologically', () => {
    const engine = new ComputedPropertiesEngine()

    // Register total FIRST, which depends on subtotal and tax
    engine.defineComputed('total', 'subtotal + tax')
    // Register tax SECOND, which depends on subtotal
    engine.defineComputed('tax', 'subtotal * 0.1')
    // Register subtotal LAST, which depends on price and qty
    engine.defineComputed('subtotal', 'price * qty')

    const result = engine.computeAll({ price: 100, qty: 2 })
    expect(result.subtotal).toBe(200)
    expect(result.tax).toBe(20)
    expect(result.total).toBe(220)
  })
})

