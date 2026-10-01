/**
 * Pure In-Memory AST Expression Evaluator for Computed Properties.
 * Zero persistence overhead in SQLite.
 */

export type ASTExpression =
  | { type: 'Literal'; value: number | string | boolean | null }
  | { type: 'Identifier'; name: string }
  | { type: 'UnaryOp'; operator: '-' | '!'; argument: ASTExpression }
  | {
      type: 'BinaryOp'
      operator:
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
        | '||'
      left: ASTExpression
      right: ASTExpression
    }
  | {
      type: 'Call'
      callee: string
      arguments: ASTExpression[]
    }
  | {
      type: 'Conditional'
      test: ASTExpression
      consequent: ASTExpression
      alternate: ASTExpression
    }

export type ASTEvaluationContext = Record<string, unknown>

import { parseExpression, extractDependencies } from './expressionParser'

const BUILTIN_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  sqrt: Math.sqrt,
  pow: Math.pow,
  trunc: Math.trunc,
  sign: Math.sign,
  clamp: (val: number, min: number, max: number) => Math.max(min, Math.min(max, val)),
}

/**
 * Resolves a nested property identifier like "stats.dexterity" or "hp" from a context object.
 */
function resolveIdentifier(name: string, context: ASTEvaluationContext): unknown {
  if (name in context) {
    return context[name]
  }

  const parts = name.split('.')
  let current: unknown = context
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Evaluates an AST expression in-memory against a given context.
 */
export function evaluateAST(expr: ASTExpression, context: ASTEvaluationContext): unknown {
  switch (expr.type) {
    case 'Literal':
      return expr.value

    case 'Identifier':
      return resolveIdentifier(expr.name, context)

    case 'UnaryOp': {
      const arg = evaluateAST(expr.argument, context)
      if (expr.operator === '-') {
        return -Number(arg)
      }
      if (expr.operator === '!') {
        return !arg
      }
      throw new Error(`Unsupported unary operator: ${String(expr.operator)}`)
    }

    case 'BinaryOp': {
      if (expr.operator === '&&') {
        const left = evaluateAST(expr.left, context)
        return left ? evaluateAST(expr.right, context) : left
      }
      if (expr.operator === '||') {
        const left = evaluateAST(expr.left, context)
        return left ? left : evaluateAST(expr.right, context)
      }

      const left = evaluateAST(expr.left, context)
      const right = evaluateAST(expr.right, context)

      switch (expr.operator) {
        case '+': {
          if (typeof left === 'string' || typeof right === 'string') {
            return String(left) + String(right)
          }
          return Number(left) + Number(right)
        }
        case '-':
          return Number(left) - Number(right)
        case '*':
          return Number(left) * Number(right)
        case '/':
          return Number(right) === 0 ? 0 : Number(left) / Number(right)
        case '%':
          return Number(left) % Number(right)
        case '**':
          return Number(left) ** Number(right)
        case '==':
          return left === right
        case '!=':
          return left !== right
        case '<':
          return Number(left) < Number(right)
        case '<=':
          return Number(left) <= Number(right)
        case '>':
          return Number(left) > Number(right)
        case '>=':
          return Number(left) >= Number(right)
        default: {
          const unreachableOp: string = (expr as { operator: string }).operator
          throw new Error(`Unsupported binary operator: ${unreachableOp}`)
        }
      }
    }

    case 'Call': {
      const customFn =
        typeof context[expr.callee] === 'function'
          ? (context[expr.callee] as (...args: unknown[]) => unknown)
          : undefined
      const fn = customFn ?? BUILTIN_FUNCTIONS[expr.callee]
      if (!fn) {
        throw new Error(`Unknown function: ${expr.callee}`)
      }
      const args = expr.arguments.map((arg) => {
        const val = evaluateAST(arg, context)
        return customFn ? val : Number(val)
      })
      return (fn as (...args: unknown[]) => unknown)(...args)
    }

    case 'Conditional': {
      const test = evaluateAST(expr.test, context)
      return test ? evaluateAST(expr.consequent, context) : evaluateAST(expr.alternate, context)
    }

    default: {
      const unreachableType: string = (expr as { type: string }).type
      throw new Error(`Unknown AST node type: ${unreachableType}`)
    }
  }
}

/**
 * Definition of a computed property attached to a Struct.
 */
export interface ComputedPropertyDef {
  name: string
  ast: ASTExpression
  dependencies: string[] // List of fields this computed property depends on
}

export function sortComputedDefsTopologically(
  defs: ComputedPropertyDef[],
): ComputedPropertyDef[] {
  const defMap = new Map<string, ComputedPropertyDef>()
  for (const def of defs) {
    defMap.set(def.name, def)
  }

  const visited = new Set<string>()
  const visiting = new Set<string>()
  const sorted: ComputedPropertyDef[] = []

  function visit(name: string) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new Error(`Cycle detected in computed properties dependency graph: "${name}"`)
    }
    const def = defMap.get(name)
    if (!def) return

    visiting.add(name)
    for (const dep of def.dependencies) {
      const rootDep = dep.split('.')[0]
      if (defMap.has(rootDep)) {
        visit(rootDep)
      }
    }
    visiting.delete(name)
    visited.add(name)
    sorted.push(def)
  }

  for (const def of defs) {
    visit(def.name)
  }

  return sorted
}

export class ComputedPropertiesEngine {
  private computedDefs = new Map<string, ComputedPropertyDef[]>() // struct_id -> defs

  public register(structId: string, def: ComputedPropertyDef): void {
    if (!this.computedDefs.has(structId)) {
      this.computedDefs.set(structId, [])
    }
    const defs = this.computedDefs.get(structId)!
    const existingIdx = defs.findIndex((d) => d.name === def.name)
    if (existingIdx >= 0) {
      defs[existingIdx] = def
    } else {
      defs.push(def)
    }
  }

  /**
   * Defines a computed property on the default scope or a specific struct using a formula string or AST.
   * If dependencies are omitted, they are automatically extracted from the AST.
   */
  public defineComputed(
    name: string,
    formula: string | ASTExpression,
    dependencies?: string[]
  ): void
  public defineComputed(
    structId: string,
    name: string,
    formula: string | ASTExpression,
    dependencies?: string[]
  ): void
  public defineComputed(
    structIdOrName: string,
    nameOrFormula: string | ASTExpression,
    formulaOrDeps?: string | ASTExpression | string[],
    explicitDeps?: string[]
  ): void {
    let structId: string
    let name: string
    let formula: string | ASTExpression
    let dependencies: string[] | undefined

    if (
      typeof formulaOrDeps === 'string' ||
      (formulaOrDeps && typeof formulaOrDeps === 'object' && 'type' in formulaOrDeps)
    ) {
      structId = structIdOrName
      name = nameOrFormula as string
      formula = formulaOrDeps as string | ASTExpression
      dependencies = explicitDeps
    } else {
      structId = 'default'
      name = structIdOrName
      formula = nameOrFormula as string | ASTExpression
      dependencies = formulaOrDeps as string[] | undefined
    }

    const ast = typeof formula === 'string' ? parseExpression(formula) : formula
    const deps = dependencies ?? extractDependencies(ast)

    this.register(structId, {
      name,
      ast,
      dependencies: deps,
    })
  }

  /**
   * Computes all derived properties for an entity data payload in-memory.
   */
  public computeAll(data: Record<string, unknown>): Record<string, unknown>
  public computeAll(structId: string, data: Record<string, unknown>): Record<string, unknown>
  public computeAll(
    structIdOrData: string | Record<string, unknown>,
    maybeData?: Record<string, unknown>
  ): Record<string, unknown> {
    let structId: string
    let data: Record<string, unknown>

    if (typeof structIdOrData === 'string') {
      structId = structIdOrData
      data = maybeData ?? {}
    } else {
      structId = 'default'
      data = (structIdOrData as Record<string, unknown>) ?? {}
    }

    const defs = this.computedDefs.get(structId)
    if (!defs || defs.length === 0) return {}

    const orderedDefs = sortComputedDefsTopologically(defs)
    const result: Record<string, unknown> = {}
    const fullContext = { ...data }

    for (const def of orderedDefs) {
      try {
        const val = evaluateAST(def.ast, fullContext)
        result[def.name] = val
        fullContext[def.name] = val // Allows chaining computed properties
      } catch (err) {
        console.warn(`Error evaluating computed property ${def.name}:`, err)
        result[def.name] = null
      }
    }

    return result
  }
}

/**
 * Evaluates a formula expression string directly against a context payload.
 */
export function evaluateExpression(
  source: string,
  context: ASTEvaluationContext = {}
): unknown {
  const ast = parseExpression(source)
  return evaluateAST(ast, context)
}
