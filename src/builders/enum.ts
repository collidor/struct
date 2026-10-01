// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { EnumDescriptor, LiteralDescriptor } from '../types/ast'

export class EnumSchema<
  TValues extends readonly (string | number)[] = readonly (string | number)[],
> extends BaseSchema<TValues[number], TValues[number]> {
  declare descriptor: EnumDescriptor
  public readonly values: TValues

  constructor(values: TValues, descriptor: Partial<EnumDescriptor> = {}) {
    super({
      kind: 'enum',
      values: values as unknown as (string | number)[],
      metadata: {
        widget: 'select',
      },
      ...descriptor,
    } as EnumDescriptor)

    this.values = values
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<TValues[number]> {
    if (!this.values.includes(value as any)) {
      return {
        issues: [
          {
            path,
            message: `Invalid value "${String(value)}". Expected one of: ${this.values.map((v) => JSON.stringify(v)).join(', ')}`,
            code: 'invalid_enum_value',
            expected: this.values.join(' | '),
            received: String(value),
          },
        ],
      }
    }

    return { value: value as TValues[number] }
  }

  public labels(labels: Record<string, string>): this {
    const clone = this._clone()
    clone.descriptor.labels = labels
    clone.descriptor.metadata = {
      ...clone.descriptor.metadata,
      widgetProps: {
        ...clone.descriptor.metadata?.widgetProps,
        options: this.values.map((v) => ({
          value: v,
          label: labels[String(v)] || String(v),
        })),
      },
    }
    return clone as this
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new EnumSchema(this.values, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}

export class LiteralSchema<
  TValue extends string | number | boolean | null = string | number | boolean | null,
> extends BaseSchema<TValue, TValue> {
  declare descriptor: LiteralDescriptor
  public readonly value: TValue

  constructor(value: TValue, descriptor: Partial<LiteralDescriptor> = {}) {
    super({
      kind: 'literal',
      value,
      default: value,
      ...descriptor,
    } as LiteralDescriptor)

    this.value = value
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<TValue> {
    if (value !== this.value) {
      return {
        issues: [
          {
            path,
            message: `Expected literal ${JSON.stringify(this.value)}, received ${JSON.stringify(value)}`,
            code: 'invalid_literal',
            expected: JSON.stringify(this.value),
            received: JSON.stringify(value),
          },
        ],
      }
    }

    return { value: this.value }
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new LiteralSchema(this.value, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
