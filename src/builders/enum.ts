// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { EnumDescriptor, LiteralDescriptor, UnionDescriptor } from '../types/ast'
import type {
  DiscriminatedUnionSchema,
  EnumVariantMap,
  EnumVariantsTuple,
} from './union'

type DiscriminatedUnionFromEnumFactory = <
  const TDiscriminator extends string,
  const TValues extends readonly EnumPrimitive[],
  TMap extends EnumVariantMap<TDiscriminator, TValues> &
    Record<Exclude<keyof TMap, TValues[number]>, never>,
>(
  discriminator: TDiscriminator,
  enumSchema: EnumSchema<TValues>,
  variants: TMap,
  descriptor?: Partial<UnionDescriptor>,
) => DiscriminatedUnionSchema<TDiscriminator, EnumVariantsTuple<TDiscriminator, TValues, TMap>>

let _discriminatedUnionFromEnumFactory: DiscriminatedUnionFromEnumFactory | undefined

export function registerDiscriminatedUnionFactory(
  factory: DiscriminatedUnionFromEnumFactory,
): void {
  _discriminatedUnionFromEnumFactory = factory
}

export type EnumPrimitive = string | number

export type EnumLiteralInput = LiteralSchema<any> & { readonly value: EnumPrimitive }

export type EnumInputItem = EnumPrimitive | EnumLiteralInput

export type UnwrapEnumValue<T> = T extends LiteralSchema<infer V extends EnumPrimitive>
  ? V
  : T extends EnumPrimitive
    ? T
    : never

export type UnwrapEnumValues<T extends readonly EnumInputItem[]> = {
  readonly [K in keyof T]: UnwrapEnumValue<T[K]>
}

export type EnumLiteralsMap<TValues extends readonly EnumPrimitive[]> = {
  readonly [V in TValues[number]]: LiteralSchema<V>
}

export type EnumLiteralsTuple<TValues extends readonly EnumPrimitive[]> = {
  readonly [K in keyof TValues]: TValues[K] extends EnumPrimitive
    ? LiteralSchema<TValues[K]>
    : never
}

export function unwrapEnumValues<const TValues extends readonly EnumInputItem[]>(
  values: TValues,
): UnwrapEnumValues<TValues> {
  return values.map((v) => {
    if (v instanceof LiteralSchema) {
      if (typeof v.value !== 'string' && typeof v.value !== 'number') {
        throw new TypeError(
          `Enum values must be strings or numbers, received literal of type ${v.value === null ? 'null' : typeof v.value}`,
        )
      }
      return v.value
    }
    return v
  }) as unknown as UnwrapEnumValues<TValues>
}

export class EnumSchema<
  const TValues extends readonly EnumPrimitive[] = readonly EnumPrimitive[],
> extends BaseSchema<TValues[number], TValues[number]> {
  declare descriptor: EnumDescriptor
  public readonly values: TValues
  private _literalsCache?: EnumLiteralsMap<TValues>

  constructor(values: TValues, descriptor: Partial<EnumDescriptor> = {}) {
    super({
      kind: 'enum',
      values: [...values] as (string | number)[],
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

  public get literals(): EnumLiteralsMap<TValues> {
    if (!this._literalsCache) {
      const map: Record<string | number, LiteralSchema<any>> = {}
      for (const value of this.values) {
        Object.defineProperty(map, value, {
          value: new LiteralSchema(value),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      this._literalsCache = Object.freeze(map) as EnumLiteralsMap<TValues>
    }
    return this._literalsCache
  }

  public literal<const TValue extends TValues[number]>(
    value: TValue,
    descriptor?: Partial<LiteralDescriptor>,
  ): LiteralSchema<TValue> {
    if (!this.values.includes(value)) {
      throw new RangeError(
        `Value ${JSON.stringify(value)} is not a member of enum [${this.values.map((v) => JSON.stringify(v)).join(', ')}]`,
      )
    }
    return new LiteralSchema(value, descriptor)
  }

  public toLiterals(): EnumLiteralsTuple<TValues> {
    return this.values.map((v) => new LiteralSchema(v)) as unknown as EnumLiteralsTuple<TValues>
  }

  public discriminatedUnion<
    const TDiscriminator extends string,
    TMap extends EnumVariantMap<TDiscriminator, TValues> &
      Record<Exclude<keyof TMap, TValues[number]>, never>,
  >(
    discriminator: TDiscriminator,
    variants: TMap,
    descriptor?: Partial<UnionDescriptor>,
  ): DiscriminatedUnionSchema<TDiscriminator, EnumVariantsTuple<TDiscriminator, TValues, TMap>> {
    if (!_discriminatedUnionFromEnumFactory) {
      throw new Error('Discriminated union factory has not been registered.')
    }
    return _discriminatedUnionFromEnumFactory(discriminator, this, variants, descriptor)
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
  const TValue extends string | number | boolean | null = string | number | boolean | null,
> extends BaseSchema<TValue, TValue> {
  declare descriptor: LiteralDescriptor
  public readonly value: TValue

  constructor(value: TValue, descriptor: Partial<LiteralDescriptor> = {}) {
    super({
      kind: 'literal',
      value,
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

    // The value that was given, as Zod returns it: `-0` is a valid `0`, and stays `-0`.
    return { value: value as TValue }
  }

  public toEnum<T extends EnumPrimitive>(
    this: LiteralSchema<T>,
    descriptor?: Partial<EnumDescriptor>,
  ): EnumSchema<readonly [T]> {
    if (typeof this.value !== 'string' && typeof this.value !== 'number') {
      throw new TypeError(
        `Cannot convert literal of type ${this.value === null ? 'null' : typeof this.value} to an enum (only string and number literals are supported)`,
      )
    }
    return new EnumSchema([this.value] as readonly [T], descriptor)
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new LiteralSchema(this.value, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
