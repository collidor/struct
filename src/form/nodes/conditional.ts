// oxlint-disable typescript/no-explicit-any
import type { ConditionalMarker, ConditionalOptions, FormCondition, FormContext } from '../types'
import { evaluateExpression } from '../../computed/astEvaluator'

/**
 * Class representing a conditional branch in a Form Structure.
 * When the condition is met, its branch fields are active, rendered, and validated.
 * When false, branch fields are hidden and their validation is bypassed.
 */
export class ConditionalNode<
  TBranch = Record<string, any>,
  TElse = Record<string, any> | undefined,
> implements ConditionalMarker<TBranch, TElse>
{
  public readonly __formKind = 'conditional' as const
  public readonly condition: FormCondition
  public readonly branch: TBranch
  public readonly elseBranch?: TElse
  public readonly options?: ConditionalOptions

  constructor(
    condition: FormCondition,
    branch: TBranch,
    elseBranch?: TElse,
    options?: ConditionalOptions,
  ) {
    this.condition = condition
    this.branch = branch
    this.elseBranch = elseBranch
    this.options = options
  }
}

export function isConditionalNode(val: unknown): val is ConditionalNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).__formKind === 'conditional'
  )
}

/**
 * Evaluates whether a condition is currently satisfied.
 * Supports predicate functions and serializable AST math/logic expressions.
 */
export function evaluateCondition(
  condition: FormCondition,
  values: Record<string, unknown>,
  context?: FormContext,
): boolean {
  if (typeof condition === 'function') {
    try {
      return Boolean(condition(values, context))
    } catch {
      return false
    }
  }

  if (typeof condition === 'string') {
    try {
      const evalCtx: Record<string, unknown> = {
        ...values,
        $values: values,
        $root: context?.rootValues ?? values,
        $item: context?.parentValues,
        $index: context?.index,
      }
      const res = evaluateExpression(condition, evalCtx)
      return Boolean(res)
    } catch {
      return false
    }
  }

  if (typeof condition === 'object' && condition !== null) {
    const condObj = condition as Record<string, unknown>
    if ('field' in condObj && typeof condObj.field === 'string') {
      const val = values[condObj.field]
      const target = condObj.value
      const op = condObj.op || '=='
      switch (op) {
        case '>':
          return Number(val) > Number(target)
        case '>=':
          return Number(val) >= Number(target)
        case '<':
          return Number(val) < Number(target)
        case '<=':
          return Number(val) <= Number(target)
        case '==':
          return val === target || String(val) === String(target)
        case '!=':
          return val !== target && String(val) !== String(target)
        case 'contains':
          if (Array.isArray(val)) {
            return val.some((item) => item === target || String(item) === String(target))
          }
          return String(val ?? '').includes(String(target ?? ''))
        case 'not_contains':
          if (Array.isArray(val)) {
            return !val.some((item) => item === target || String(item) === String(target))
          }
          return !String(val ?? '').includes(String(target ?? ''))
        case 'in':
          if (Array.isArray(target)) {
            return target.some((item) => item === val || String(item) === String(val))
          }
          return false
        case 'not_in':
          if (Array.isArray(target)) {
            return !target.some((item) => item === val || String(item) === String(val))
          }
          return true
        case 'startsWith':
          return String(val ?? '').startsWith(String(target ?? ''))
        case 'endsWith':
          return String(val ?? '').endsWith(String(target ?? ''))
        case 'isEmpty':
          return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
        case 'isNotEmpty':
          return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0)
        default:
          return false
      }
    }
    if ('and' in condObj && Array.isArray(condObj.and)) {
      return condObj.and.every((c) => evaluateCondition(c as FormCondition, values, context))
    }
    if ('or' in condObj && Array.isArray(condObj.or)) {
      return condObj.or.some((c) => evaluateCondition(c as FormCondition, values, context))
    }
    if ('not' in condObj) {
      return !evaluateCondition(condObj.not as FormCondition, values, context)
    }
  }

  return Boolean(condition)
}

/**
 * Builder for conditional branches in form structures.
 */
export function when<
  TBranch extends Record<string, any>,
  TElse extends Record<string, any> = Record<string, any>,
>(
  condition: FormCondition,
  branchShape: TBranch,
  elseShape?: TElse,
  options?: ConditionalOptions,
): ConditionalNode<TBranch, TElse> {
  return new ConditionalNode(condition, branchShape, elseShape, options)
}

/**
 * Inverted conditional branch: fields are active and rendered when condition is FALSE.
 * When condition is TRUE, branch fields are hidden.
 */
export function unless<
  TBranch extends Record<string, any>,
  TElse extends Record<string, any> = Record<string, any>,
>(
  condition: FormCondition,
  branchShape: TBranch,
  elseShape?: TElse,
  options?: ConditionalOptions,
): ConditionalNode<TBranch, TElse> {
  let invertedCondition: FormCondition
  if (typeof condition === 'function') {
    invertedCondition = (values, ctx) => !condition(values, ctx)
  } else if (typeof condition === 'string') {
    invertedCondition = `!(${condition})`
  } else if (typeof condition === 'object' && condition !== null) {
    invertedCondition = { not: condition }
  } else {
    invertedCondition = !condition
  }
  return new ConditionalNode(invertedCondition, branchShape, elseShape, options)
}
