// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { RecordDescriptor } from '../types/ast'
import type { StructIssue } from '../core/errors'
import type { Infer, InferInput } from '../types/inference'

export class RecordSchema<
  TValue extends BaseSchema<any, any> = BaseSchema<any, any>,
  TKey extends BaseSchema<string, string> = BaseSchema<string, string>,
> extends BaseSchema<Record<string, InferInput<TValue>>, Record<string, Infer<TValue>>> {
  declare descriptor: RecordDescriptor
  public readonly valueSchema: TValue
  public readonly keySchema?: TKey

  constructor(valueSchema: TValue, keySchema?: TKey, descriptor: Partial<RecordDescriptor> = {}) {
    super({
      kind: 'record',
      values: valueSchema.descriptor,
      keys: keySchema?.descriptor,
      ...descriptor,
    } as RecordDescriptor)

    this.valueSchema = valueSchema
    this.keySchema = keySchema
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<Record<string, Infer<TValue>>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [
          {
            path,
            message: `Expected record object, received ${value === null ? 'null' : typeof value}`,
            code: 'invalid_type',
            expected: 'record',
            received: typeof value,
          },
        ],
      }
    }

    const valObj = value as Record<string, unknown>
    const result: Record<string, Infer<TValue>> = {}
    const issues: StructIssue[] = []

    for (const [key, rawVal] of Object.entries(valObj)) {
      const fieldPath = [...path, key]

      if (this.keySchema) {
        const keyValidation = this.keySchema._validateWithRefinements(key, fieldPath)
        if (keyValidation.issues && keyValidation.issues.length > 0) {
          issues.push(...keyValidation.issues)
          continue
        }
      }

      const valValidation = this.valueSchema._validateWithRefinements(rawVal, fieldPath)
      if (valValidation.issues && valValidation.issues.length > 0) {
        issues.push(...valValidation.issues)
      } else {
        result[key] = valValidation.value as Infer<TValue>
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
  ): ValidateAsyncResult<Record<string, Infer<TValue>>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [
          {
            path,
            message: `Expected record object, received ${value === null ? 'null' : typeof value}`,
            code: 'invalid_type',
            expected: 'record',
            received: typeof value,
          },
        ],
      }
    }

    const valObj = value as Record<string, unknown>
    const result: Record<string, Infer<TValue>> = {}
    const issues: StructIssue[] = []

    for (const [key, rawVal] of Object.entries(valObj)) {
      const fieldPath = [...path, key]

      if (this.keySchema) {
        const keyValidation = await this.keySchema._validateWithRefinementsAsync(key, fieldPath)
        if (keyValidation.issues && keyValidation.issues.length > 0) {
          issues.push(...keyValidation.issues)
          continue
        }
      }

      const valValidation = await this.valueSchema._validateWithRefinementsAsync(rawVal, fieldPath)
      if (valValidation.issues && valValidation.issues.length > 0) {
        issues.push(...valValidation.issues)
      } else {
        result[key] = valValidation.value as Infer<TValue>
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result }
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new RecordSchema(this.valueSchema, this.keySchema, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
