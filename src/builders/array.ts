// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { ArrayDescriptor } from '../types/ast'
import type { StructIssue } from '../core/errors'
import type { Infer, InferInput } from '../types/inference'

function checkArrayPrechecks(
  value: unknown,
  descriptor: ArrayDescriptor,
  path: ReadonlyArray<string | number>,
): { isArray: false; error: { issues: StructIssue[] } } | { isArray: true; issues: StructIssue[] } {
  if (!Array.isArray(value)) {
    return {
      isArray: false,
      error: {
        issues: [
          {
            path,
            message: `Expected array, received ${value === null ? 'null' : typeof value}`,
            code: 'invalid_type',
            expected: 'array',
            received: typeof value,
          },
        ],
      },
    }
  }

  const issues: StructIssue[] = []
  if (descriptor.minItems !== undefined && value.length < descriptor.minItems) {
    issues.push({
      path,
      message:
        descriptor.messages?.min ?? `Array must contain at least ${descriptor.minItems} item(s)`,
      code: 'too_small',
    })
  }

  if (descriptor.maxItems !== undefined && value.length > descriptor.maxItems) {
    issues.push({
      path,
      message:
        descriptor.messages?.max ?? `Array must contain at most ${descriptor.maxItems} item(s)`,
      code: 'too_big',
    })
  }

  return { isArray: true, issues }
}

export class ArraySchema<
  TItem extends BaseSchema<any, any> = BaseSchema<any, any>,
> extends BaseSchema<InferInput<TItem>[], Infer<TItem>[]> {
  declare descriptor: ArrayDescriptor
  public readonly itemSchema: TItem

  constructor(itemSchema: TItem, descriptor: Partial<ArrayDescriptor> = {}) {
    super({
      kind: 'array',
      items: itemSchema.descriptor,
      ...descriptor,
    } as ArrayDescriptor)

    this.itemSchema = itemSchema
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<Infer<TItem>[]> {
    const precheck = checkArrayPrechecks(value, this.descriptor, path)
    if (!precheck.isArray) {
      return precheck.error
    }

    const arr = value as unknown[]
    const issues = precheck.issues
    const result: Infer<TItem>[] = []

    for (let i = 0; i < arr.length; i++) {
      const itemValidation = this.itemSchema._validateWithRefinements(arr[i], [...path, i])
      if (itemValidation.issues && itemValidation.issues.length > 0) {
        issues.push(...itemValidation.issues)
      } else {
        result.push(itemValidation.value as Infer<TItem>)
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<Infer<TItem>[]> {
    const precheck = checkArrayPrechecks(value, this.descriptor, path)
    if (!precheck.isArray) {
      return precheck.error
    }

    const arr = value as unknown[]
    const issues = precheck.issues
    const result: Infer<TItem>[] = []

    for (let i = 0; i < arr.length; i++) {
      const itemValidation = await this.itemSchema._validateWithRefinementsAsync(arr[i], [...path, i])
      if (itemValidation.issues && itemValidation.issues.length > 0) {
        issues.push(...itemValidation.issues)
      } else {
        result.push(itemValidation.value as Infer<TItem>)
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result }
  }

  public min(length: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.minItems = length
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, min: message }
    }
    return clone as this
  }

  public max(length: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.maxItems = length
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, max: message }
    }
    return clone as this
  }

  public length(length: number, message?: string): this {
    const msg = message ?? `Array must contain exactly ${length} item(s)`
    return this.min(length, msg).max(length, msg)
  }

  public nonempty(message?: string): this {
    return this.min(1, message ?? 'Array must not be empty')
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new ArraySchema(this.itemSchema, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
