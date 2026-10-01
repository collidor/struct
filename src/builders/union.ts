// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { UnionDescriptor, TupleDescriptor } from '../types/ast'
import type { StructIssue } from '../core/errors'
import type { Infer, InferInput } from '../types/inference'

export class UnionSchema<
  TVariants extends readonly BaseSchema<any, any>[] = readonly BaseSchema<any, any>[],
> extends BaseSchema<InferInput<TVariants[number]>, Infer<TVariants[number]>> {
  declare descriptor: UnionDescriptor
  public readonly variants: TVariants

  constructor(variants: TVariants, descriptor: Partial<UnionDescriptor> = {}) {
    super({
      kind: 'union',
      variants: variants.map((v) => v.descriptor),
      ...descriptor,
    } as UnionDescriptor)

    this.variants = variants
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<Infer<TVariants[number]>> {
    for (const variant of this.variants) {
      const res = variant._validateWithRefinements(value, path)
      if (!res.issues || res.issues.length === 0) {
        return { value: res.value as Infer<TVariants[number]> }
      }
    }

    return {
      issues: [
        {
          path,
          message: `Value does not match any union variant`,
          code: 'invalid_union',
        },
      ],
    }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<Infer<TVariants[number]>> {
    for (const variant of this.variants) {
      const res = await variant._validateWithRefinementsAsync(value, path)
      if (!res.issues || res.issues.length === 0) {
        return { value: res.value as Infer<TVariants[number]> }
      }
    }

    return {
      issues: [
        {
          path,
          message: `Value does not match any union variant`,
          code: 'invalid_union',
        },
      ],
    }
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new UnionSchema(this.variants, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}

function checkTuplePrechecks(
  value: unknown,
  expectedLength: number,
  path: ReadonlyArray<string | number>,
): { isTuple: false; error: { issues: StructIssue[] } } | { isTuple: true } {
  if (!Array.isArray(value)) {
    return {
      isTuple: false,
      error: {
        issues: [
          {
            path,
            message: `Expected tuple array, received ${value === null ? 'null' : typeof value}`,
            code: 'invalid_type',
            expected: 'tuple',
            received: typeof value,
          },
        ],
      },
    }
  }

  if (value.length !== expectedLength) {
    return {
      isTuple: false,
      error: {
        issues: [
          {
            path,
            message: `Expected tuple of length ${expectedLength}, received length ${value.length}`,
            code: 'invalid_length',
          },
        ],
      },
    }
  }

  return { isTuple: true }
}

export class TupleSchema<
  TItems extends readonly BaseSchema<any, any>[] = readonly BaseSchema<any, any>[],
> extends BaseSchema<
  { [K in keyof TItems]: InferInput<TItems[K]> },
  { [K in keyof TItems]: Infer<TItems[K]> }
> {
  declare descriptor: TupleDescriptor
  public readonly items: TItems

  constructor(items: TItems, descriptor: Partial<TupleDescriptor> = {}) {
    super({
      kind: 'tuple',
      items: items.map((i) => i.descriptor),
      ...descriptor,
    } as TupleDescriptor)

    this.items = items
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<{ [K in keyof TItems]: Infer<TItems[K]> }> {
    const precheck = checkTuplePrechecks(value, this.items.length, path)
    if (!precheck.isTuple) {
      return precheck.error
    }

    const arr = value as unknown[]
    const result: unknown[] = []
    const issues: StructIssue[] = []

    for (let i = 0; i < this.items.length; i++) {
      const itemValidation = this.items[i]._validateWithRefinements(arr[i], [...path, i])
      if (itemValidation.issues && itemValidation.issues.length > 0) {
        issues.push(...itemValidation.issues)
      } else {
        result.push(itemValidation.value)
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as unknown as { [K in keyof TItems]: Infer<TItems[K]> } }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<{ [K in keyof TItems]: Infer<TItems[K]> }> {
    const precheck = checkTuplePrechecks(value, this.items.length, path)
    if (!precheck.isTuple) {
      return precheck.error
    }

    const arr = value as unknown[]
    const result: unknown[] = []
    const issues: StructIssue[] = []

    for (let i = 0; i < this.items.length; i++) {
      const itemValidation = await this.items[i]._validateWithRefinementsAsync(arr[i], [...path, i])
      if (itemValidation.issues && itemValidation.issues.length > 0) {
        issues.push(...itemValidation.issues)
      } else {
        result.push(itemValidation.value)
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as unknown as { [K in keyof TItems]: Infer<TItems[K]> } }
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new TupleSchema(this.items, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
