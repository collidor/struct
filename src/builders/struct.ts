// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { StructDescriptor, TypeDescriptor } from '../types/ast'
import type { StructIssue } from '../core/errors'
import type {
  Infer,
  InferInput,
  InferShapeInput,
  InferShapeOutput,
  Prettify,
} from '../types/inference'

import type { StructBuilder } from '../dynamic/structBuilder'

type StructBuilderFactory = (schema: StructSchema<any>, name?: string) => StructBuilder
let _structBuilderFactory: StructBuilderFactory | undefined

export function registerStructBuilderFactory(factory: StructBuilderFactory): void {
  _structBuilderFactory = factory
}

function checkStructObject(
  value: unknown,
  path: ReadonlyArray<string | number>,
): { issues: StructIssue[] } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      issues: [
        {
          path,
          message: `Expected object, received ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
          code: 'invalid_type',
          expected: 'object',
          received: typeof value,
        },
      ],
    }
  }
  return null
}

function checkExtraProperties(
  valObj: Record<string, unknown>,
  shapeKeys: Set<string>,
  descriptor: StructDescriptor,
  path: ReadonlyArray<string | number>,
  result: Record<string, unknown>,
  issues: StructIssue[],
): void {
  for (const key of Object.keys(valObj)) {
    if (!shapeKeys.has(key)) {
      if (descriptor.strict) {
        issues.push({
          path: [...path, key],
          message: `Unrecognized key "${key}" in strict struct`,
          code: 'unrecognized_keys',
        })
      } else if (descriptor.passthrough) {
        result[key] = valObj[key]
      }
    }
  }
}

export class StructSchema<
  TShape extends Record<string, BaseSchema<any, any>> = Record<string, BaseSchema<any, any>>,
> extends BaseSchema<InferShapeInput<TShape>, InferShapeOutput<TShape>> {
  declare descriptor: StructDescriptor
  public readonly shape: TShape

  constructor(shape: TShape = {} as TShape, descriptor: Partial<StructDescriptor> = {}) {
    const fieldsDesc: Record<string, TypeDescriptor> = {}
    for (const [key, schema] of Object.entries(shape)) {
      fieldsDesc[key] = schema.descriptor
    }

    super({
      kind: 'struct',
      fields: fieldsDesc,
      ...descriptor,
    } as StructDescriptor)

    this.shape = shape
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<InferShapeOutput<TShape>> {
    const objIssue = checkStructObject(value, path)
    if (objIssue) return objIssue

    const valObj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    const issues: StructIssue[] = []

    // 1. Validate defined fields
    for (const [key, fieldSchema] of Object.entries(this.shape)) {
      const fieldPath = [...path, key]
      const fieldValidation = fieldSchema._validateWithRefinements(valObj[key], fieldPath)
      if (fieldValidation.issues && fieldValidation.issues.length > 0) {
        issues.push(...fieldValidation.issues)
      } else {
        result[key] = fieldValidation.value
      }
    }

    // 2. Handle extra properties
    const shapeKeys = new Set(Object.keys(this.shape))
    checkExtraProperties(valObj, shapeKeys, this.descriptor, path, result, issues)

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as InferShapeOutput<TShape> }
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<InferShapeOutput<TShape>> {
    const objIssue = checkStructObject(value, path)
    if (objIssue) return objIssue

    const valObj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    const issues: StructIssue[] = []

    // 1. Validate defined fields asynchronously
    for (const [key, fieldSchema] of Object.entries(this.shape)) {
      const fieldPath = [...path, key]
      const fieldValidation = await fieldSchema._validateWithRefinementsAsync(valObj[key], fieldPath)
      if (fieldValidation.issues && fieldValidation.issues.length > 0) {
        issues.push(...fieldValidation.issues)
      } else {
        result[key] = fieldValidation.value
      }
    }

    // 2. Handle extra properties
    const shapeKeys = new Set(Object.keys(this.shape))
    checkExtraProperties(valObj, shapeKeys, this.descriptor, path, result, issues)

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as InferShapeOutput<TShape> }
  }

  public extend<TExtra extends Record<string, BaseSchema<any, any>>>(
    newFields: TExtra,
  ): StructSchema<Prettify<TShape & TExtra>> {
    const combinedShape = { ...this.shape, ...newFields } as Prettify<TShape & TExtra>
    const extended = new StructSchema(combinedShape, {
      ...this.descriptor,
      fields: Object.fromEntries(Object.entries(combinedShape).map(([k, s]) => [k, s.descriptor])),
    })
    extended.refinements = [...this.refinements] as any
    return extended
  }

  public pick<K extends keyof TShape>(...keys: K[]): StructSchema<Pick<TShape, K>> {
    const pickedShape = {} as Pick<TShape, K>
    const keysSet = new Set(keys)
    for (const key of Object.keys(this.shape) as (keyof TShape)[]) {
      if (keysSet.has(key as K)) {
        pickedShape[key as K] = this.shape[key] as any
      }
    }
    return new StructSchema(pickedShape)
  }

  public omit<K extends keyof TShape>(...keys: K[]): StructSchema<Omit<TShape, K>> {
    const omittedShape = {} as Omit<TShape, K>
    const keysSet = new Set(keys)
    for (const key of Object.keys(this.shape) as (keyof TShape)[]) {
      if (!keysSet.has(key as K)) {
        ;(omittedShape as any)[key] = this.shape[key]
      }
    }
    return new StructSchema(omittedShape)
  }

  public partial(): StructSchema<{
    [K in keyof TShape]: BaseSchema<InferInput<TShape[K]> | undefined, Infer<TShape[K]> | undefined>
  }> {
    const partialShape: any = {}
    for (const [k, s] of Object.entries(this.shape)) {
      const cloned = s.optional()
      delete cloned.descriptor.default
      partialShape[k] = cloned
    }
    const partialStruct = new StructSchema(partialShape)
    partialStruct.refinements = [...this.refinements] as any
    return partialStruct
  }

  /**
   * Gives the struct a component name (stored in `descriptor.name`). Consumers such as
   * `@collidor/struct-command` use it to find this component on any object by property
   * name (`Position` matches `position` or `Position`).
   */
  public named<const N extends string>(name: N): this & { readonly __name: N } {
    const clone = this._clone()
    clone.descriptor.name = name
    return clone as this & { readonly __name: N }
  }

  public toBuilder(name?: string): StructBuilder {
    if (!_structBuilderFactory) {
      throw new Error('StructBuilder factory has not been registered.')
    }
    return _structBuilderFactory(this, name)
  }

  public strict(): this {
    const clone = this._clone()
    clone.descriptor.strict = true
    clone.descriptor.passthrough = false
    return clone as this
  }

  public passthrough(): this {
    const clone = this._clone()
    clone.descriptor.passthrough = true
    clone.descriptor.strict = false
    return clone as this
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new StructSchema(this.shape, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
