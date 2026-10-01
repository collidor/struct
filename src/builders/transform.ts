import {
  BaseSchema,
  registerTransformCreators,
  type ValidateResult,
  type ValidateAsyncResult,
} from '../core/base'
import type { TypeDescriptor } from '../types/ast'
import { cloneDescriptor } from '../utils/clone'

export type TransformFn<TIn, TOut> = (value: TIn) => TOut | Promise<TOut>

const STRIPPED_TRANSFORM_KEYS = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'min',
  'max',
  'step',
  'integer',
  'positive',
  'nonnegative',
  'negative',
  'minItems',
  'maxItems',
  'uniqueItems',
  'trim',
  'toLowerCase',
  'toUpperCase',
  'items',
  'fields',
  'values',
  'keys',
  'variants',
])

export function stripTransformConstraints(desc: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(desc)) {
    if (!STRIPPED_TRANSFORM_KEYS.has(key)) {
      clean[key] = value
    }
  }
  return clean
}

export class TransformSchema<TInput = unknown, TOutput = unknown> extends BaseSchema<
  TInput,
  TOutput
> {
  public readonly innerSchema: BaseSchema<TInput, any>
  public readonly transformFn: TransformFn<any, TOutput>

  constructor(
    innerSchema: BaseSchema<TInput, any>,
    transformFn: TransformFn<any, TOutput>,
    descriptor?: Partial<TypeDescriptor>,
  ) {
    const baseDesc = cloneDescriptor(innerSchema.descriptor) as unknown as Record<string, unknown>
    const cleanBaseDesc = stripTransformConstraints(baseDesc)

    super({
      ...cleanBaseDesc,
      kind: 'any',
      ...descriptor,
    } as TypeDescriptor)

    this.innerSchema = innerSchema
    this.transformFn = transformFn
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<TOutput> {
    const innerRes = this.innerSchema._validateWithRefinements(value, path)
    if (innerRes.issues) {
      return { issues: innerRes.issues }
    }

    try {
      const transformed = this.transformFn(innerRes.value)
      if (
        transformed instanceof Promise ||
        (transformed && typeof (transformed as any).then === 'function')
      ) {
        return {
          issues: [
            {
              path,
              message:
                'Encountered asynchronous transform in synchronous parse(); use parseAsync() or safeParseAsync() instead',
              code: 'custom_refinement',
            },
          ],
        }
      }

      return { value: transformed as TOutput }
    } catch (err) {
      return {
        issues: [
          {
            path,
            message: err instanceof Error ? err.message : String(err),
            code: 'custom_refinement',
          },
        ],
      }
    }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<TOutput> {
    const innerRes = await this.innerSchema._validateWithRefinementsAsync(value, path)
    if (innerRes.issues) {
      return { issues: innerRes.issues }
    }

    try {
      const transformed = await this.transformFn(innerRes.value)
      return { value: transformed as TOutput }
    } catch (err) {
      return {
        issues: [
          {
            path,
            message: err instanceof Error ? err.message : String(err),
            code: 'custom_refinement',
          },
        ],
      }
    }
  }

  protected override _clone(): this {
    const clone = new TransformSchema(
      this.innerSchema,
      this.transformFn,
      cloneDescriptor(this.descriptor),
    ) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}

export class PipeSchema<TInput = unknown, TOutput = unknown> extends BaseSchema<TInput, TOutput> {
  public readonly schemaA: BaseSchema<TInput, any>
  public readonly schemaB: BaseSchema<any, TOutput>

  constructor(
    schemaA: BaseSchema<TInput, any>,
    schemaB: BaseSchema<any, TOutput>,
    descriptor?: Partial<TypeDescriptor>,
  ) {
    super({
      ...cloneDescriptor(schemaB.descriptor),
      ...descriptor,
    } as TypeDescriptor)

    this.schemaA = schemaA
    this.schemaB = schemaB
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<TOutput> {
    const resA = this.schemaA._validateWithRefinements(value, path)
    if (resA.issues) {
      return { issues: resA.issues }
    }

    const resB = this.schemaB._validateWithRefinements(resA.value, path)
    if (resB.issues) {
      return { issues: resB.issues }
    }

    return { value: resB.value as TOutput }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<TOutput> {
    const resA = await this.schemaA._validateWithRefinementsAsync(value, path)
    if (resA.issues) {
      return { issues: resA.issues }
    }

    const resB = await this.schemaB._validateWithRefinementsAsync(resA.value, path)
    if (resB.issues) {
      return { issues: resB.issues }
    }

    return { value: resB.value as TOutput }
  }

  protected override _clone(): this {
    const clone = new PipeSchema(
      this.schemaA,
      this.schemaB,
      cloneDescriptor(this.descriptor),
    ) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}

registerTransformCreators(
  (inner, fn) => new TransformSchema(inner, fn),
  (a, b) => new PipeSchema(a, b),
)

