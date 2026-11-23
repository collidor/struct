// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../core/base'
import { cloneDescriptor } from '../utils/clone'
import type { DiscriminatorValue, UnionDescriptor, TupleDescriptor } from '../types/ast'
import type { StructIssue } from '../core/errors'
import type { Infer, InferInput, Prettify } from '../types/inference'
import { StructSchema } from './struct'
import {
  EnumSchema,
  LiteralSchema,
  registerDiscriminatedUnionFactory,
  type EnumPrimitive,
} from './enum'

export type { DiscriminatorValue } from '../types/ast'

export type DiscriminatorFieldSchema = LiteralSchema<any> | EnumSchema<any>

export type DiscriminatedVariant<TDiscriminator extends string = string> = BaseSchema<any, any> & {
  readonly shape: Record<TDiscriminator, DiscriminatorFieldSchema>
}

export type VariantDiscriminatorValue<TDiscriminator extends string, TVariant> = TVariant extends {
  readonly shape: Record<TDiscriminator, infer TField>
}
  ? Infer<TField>
  : never

export type DiscriminatorValuesOf<
  TDiscriminator extends string,
  TVariants extends readonly DiscriminatedVariant<TDiscriminator>[],
> = VariantDiscriminatorValue<TDiscriminator, TVariants[number]>

type EnumVariantShape<TDiscriminator extends string, TKey extends EnumPrimitive> = Record<
  string,
  BaseSchema<any, any>
> & {
  [P in TDiscriminator]?: LiteralSchema<TKey> | EnumSchema<readonly [TKey]>
}

export type EnumVariantEntry<TDiscriminator extends string, TKey extends EnumPrimitive> =
  | (BaseSchema<any, any> & { readonly shape: EnumVariantShape<TDiscriminator, TKey> })
  | EnumVariantShape<TDiscriminator, TKey>

export type EnumVariantMap<
  TDiscriminator extends string,
  TValues extends readonly EnumPrimitive[],
> = {
  [K in TValues[number]]: EnumVariantEntry<TDiscriminator, K>
}

export type NormalizedEnumVariantShape<
  TDiscriminator extends string,
  TKey extends EnumPrimitive,
  TShape extends Record<string, BaseSchema<any, any>>,
> = Prettify<
  Omit<TShape, TDiscriminator> & {
    [P in TDiscriminator]: TDiscriminator extends keyof TShape
      ? TShape[TDiscriminator] extends DiscriminatorFieldSchema
        ? TShape[TDiscriminator]
        : LiteralSchema<TKey>
      : LiteralSchema<TKey>
  }
>

export type NormalizeEnumVariant<
  TDiscriminator extends string,
  TKey extends EnumPrimitive,
  TEntry,
> = TEntry extends BaseSchema<any, any> & {
  readonly shape: infer TShape extends Record<string, BaseSchema<any, any>>
}
  ? StructSchema<NormalizedEnumVariantShape<TDiscriminator, TKey, TShape>>
  : TEntry extends Record<string, BaseSchema<any, any>>
    ? StructSchema<NormalizedEnumVariantShape<TDiscriminator, TKey, TEntry>>
    : never

export type EnumVariantsTuple<
  TDiscriminator extends string,
  TValues extends readonly EnumPrimitive[],
  TMap extends EnumVariantMap<TDiscriminator, TValues>,
> = {
  readonly [K in keyof TValues]: TValues[K] extends TValues[number]
    ? NormalizeEnumVariant<TDiscriminator, TValues[K], TMap[TValues[K]]>
    : never
}

type VariantDiscriminatorLookup =
  | { ok: true; values: DiscriminatorValue[] }
  | { ok: false; reason: 'not_struct' | 'missing_field' | 'empty_enum' | 'invalid_field' }

function inspectVariantDiscriminator(
  discriminator: string,
  variant: unknown,
): VariantDiscriminatorLookup {
  if (!(variant instanceof StructSchema)) {
    return { ok: false, reason: 'not_struct' }
  }

  const field = variant.shape[discriminator]
  if (!field) {
    return { ok: false, reason: 'missing_field' }
  }

  if (field instanceof LiteralSchema) {
    return { ok: true, values: [field.value] }
  }

  if (field instanceof EnumSchema) {
    if (field.values.length === 0) {
      return { ok: false, reason: 'empty_enum' }
    }
    return { ok: true, values: [...field.values] }
  }

  return { ok: false, reason: 'invalid_field' }
}

function extractVariantDiscriminatorValues(
  discriminator: string,
  variant: unknown,
  index: number,
): DiscriminatorValue[] {
  const result = inspectVariantDiscriminator(discriminator, variant)
  if (result.ok) {
    return result.values
  }
  switch (result.reason) {
    case 'not_struct':
      throw new TypeError(
        `Discriminated union variant at index ${index} must be a StructSchema`,
      )
    case 'missing_field':
      throw new TypeError(
        `Discriminated union variant at index ${index} is missing discriminator property "${discriminator}"`,
      )
    case 'empty_enum':
      throw new Error(
        `Discriminated union variant at index ${index} has an empty enum for discriminator "${discriminator}"`,
      )
    case 'invalid_field':
      throw new TypeError(
        `Discriminator property "${discriminator}" on variant at index ${index} must be a LiteralSchema or EnumSchema`,
      )
  }
}

export function isDiscriminatedUnionCompatible(
  discriminator: string | undefined,
  variants: readonly BaseSchema<any, any>[],
): variants is readonly DiscriminatedVariant<string>[] {
  if (typeof discriminator !== 'string' || discriminator.length === 0 || variants.length === 0) {
    return false
  }
  const seen = new Set<DiscriminatorValue>()
  for (const variant of variants) {
    const result = inspectVariantDiscriminator(discriminator, variant)
    if (!result.ok) return false
    for (const v of result.values) {
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

export function createUnionOrDiscriminated(
  variants: readonly BaseSchema<any, any>[],
  discriminator?: string,
  descriptor?: Partial<UnionDescriptor>,
): UnionSchema<any> {
  if (isDiscriminatedUnionCompatible(discriminator, variants)) {
    return new DiscriminatedUnionSchema(discriminator!, variants, descriptor)
  }
  return new UnionSchema(variants, descriptor)
}

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

export class DiscriminatedUnionSchema<
  const TDiscriminator extends string = string,
  const TVariants extends readonly DiscriminatedVariant<TDiscriminator>[] =
    readonly DiscriminatedVariant<TDiscriminator>[],
> extends UnionSchema<TVariants> {
  public readonly discriminator: TDiscriminator
  public readonly optionsMap: ReadonlyMap<DiscriminatorValue, TVariants[number]>
  public readonly discriminatorValues: readonly DiscriminatorValuesOf<TDiscriminator, TVariants>[]

  constructor(
    discriminator: TDiscriminator,
    variants: TVariants,
    descriptor: Partial<UnionDescriptor> = {},
  ) {
    if (!variants || variants.length === 0) {
      throw new Error('Discriminated union must have at least one variant')
    }

    const map = new Map<DiscriminatorValue, TVariants[number]>()
    const allValues: DiscriminatorValue[] = []

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i]
      const values = extractVariantDiscriminatorValues(discriminator, variant, i)
      for (const val of values) {
        if (map.has(val)) {
          throw new Error(
            `Duplicate discriminator value ${JSON.stringify(val)} for "${discriminator}"`,
          )
        }
        map.set(val, variant)
        allValues.push(val)
      }
    }

    super(variants, {
      ...descriptor,
      discriminator,
    })

    this.discriminator = discriminator
    this.optionsMap = map
    this.discriminatorValues = Object.freeze(allValues) as readonly DiscriminatorValuesOf<
      TDiscriminator,
      TVariants
    >[]
  }

  public getVariant(
    value: DiscriminatorValuesOf<TDiscriminator, TVariants>,
  ): TVariants[number] | undefined {
    return this.optionsMap.get(value as DiscriminatorValue)
  }

  private _lookupVariant(
    value: unknown,
    path: ReadonlyArray<string | number>,
  ): { variant: TVariants[number]; error?: undefined } | { variant?: undefined; error: { issues: StructIssue[] } } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      const received = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
      return {
        error: {
          issues: [
            {
              path,
              message: `Expected object, received ${received}`,
              code: 'invalid_type',
              expected: 'object',
              received,
            },
          ],
        },
      }
    }

    const discVal = (value as Record<string, unknown>)[this.discriminator]
    const matched = this.optionsMap.get(discVal as DiscriminatorValue)
    if (!matched) {
      const expectedList = this.discriminatorValues.map((v) => JSON.stringify(v)).join(' | ')
      return {
        error: {
          issues: [
            {
              path: [...path, this.discriminator],
              message: `Invalid discriminator value ${JSON.stringify(discVal)} for "${this.discriminator}". Expected one of: ${expectedList}`,
              code: 'invalid_union_discriminator',
              expected: expectedList,
              received: JSON.stringify(discVal),
            },
          ],
        },
      }
    }

    return { variant: matched }
  }

  override _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<Infer<TVariants[number]>> {
    const lookup = this._lookupVariant(value, path)
    if (lookup.error) {
      return lookup.error
    }
    return lookup.variant._validateWithRefinements(value, path) as ValidateResult<
      Infer<TVariants[number]>
    >
  }

  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<Infer<TVariants[number]>> {
    const lookup = this._lookupVariant(value, path)
    if (lookup.error) {
      return lookup.error
    }
    return (await lookup.variant._validateWithRefinementsAsync(value, path)) as ValidateResult<
      Infer<TVariants[number]>
    >
  }

  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new DiscriminatedUnionSchema(this.discriminator, this.variants, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}

function normalizeEnumBranch<TDiscriminator extends string, TKey extends EnumPrimitive>(
  discriminator: TDiscriminator,
  key: TKey,
  entry: EnumVariantEntry<TDiscriminator, TKey>,
): DiscriminatedVariant<TDiscriminator> {
  const structSchema =
    entry instanceof StructSchema
      ? entry
      : new StructSchema(entry as Record<string, BaseSchema<any, any>>)

  const existing = structSchema.shape[discriminator]
  if (existing !== undefined) {
    if (existing instanceof LiteralSchema) {
      if (existing.value !== key) {
        throw new RangeError(
          `Discriminator field "${discriminator}" for branch ${JSON.stringify(key)} has literal value ${JSON.stringify(existing.value)}, expected ${JSON.stringify(key)}`,
        )
      }
      return structSchema as DiscriminatedVariant<TDiscriminator>
    }
    if (existing instanceof EnumSchema) {
      if (existing.values.length !== 1 || existing.values[0] !== key) {
        throw new RangeError(
          `Discriminator field "${discriminator}" for branch ${JSON.stringify(key)} must only allow ${JSON.stringify(key)}, received enum [${existing.values.map((v: unknown) => JSON.stringify(v)).join(', ')}]`,
        )
      }
      return structSchema as DiscriminatedVariant<TDiscriminator>
    }
    throw new TypeError(
      `Discriminator field "${discriminator}" for branch ${JSON.stringify(key)} must be a LiteralSchema or EnumSchema`,
    )
  }

  return structSchema.extend({
    [discriminator]: new LiteralSchema(key),
  }) as unknown as DiscriminatedVariant<TDiscriminator>
}

export function createDiscriminatedUnionFromEnum<
  const TDiscriminator extends string,
  const TValues extends readonly EnumPrimitive[],
  TMap extends EnumVariantMap<TDiscriminator, TValues>,
>(
  discriminator: TDiscriminator,
  enumSchema: EnumSchema<TValues>,
  variants: TMap,
  descriptor?: Partial<UnionDescriptor>,
): DiscriminatedUnionSchema<TDiscriminator, EnumVariantsTuple<TDiscriminator, TValues, TMap>> {
  if (enumSchema.values.length === 0) {
    throw new Error('Cannot create a discriminated union from an empty EnumSchema')
  }

  const allowedKeys = new Set(enumSchema.values.map((v) => String(v)))
  for (const extraKey of Object.keys(variants)) {
    if (!allowedKeys.has(extraKey)) {
      throw new RangeError(
        `Unexpected variant key "${extraKey}" not present in enum [${enumSchema.values.map((v) => JSON.stringify(v)).join(', ')}]`,
      )
    }
  }

  const normalized: DiscriminatedVariant<TDiscriminator>[] = []
  for (const val of enumSchema.values) {
    if (!Object.prototype.hasOwnProperty.call(variants, val)) {
      throw new RangeError(
        `Missing variant for enum value ${JSON.stringify(val)} in discriminated union "${discriminator}"`,
      )
    }
    const entry = variants[val as TValues[number]]
    normalized.push(normalizeEnumBranch(discriminator, val, entry))
  }

  return new DiscriminatedUnionSchema(
    discriminator,
    normalized as unknown as EnumVariantsTuple<TDiscriminator, TValues, TMap>,
    descriptor,
  )
}

registerDiscriminatedUnionFactory(createDiscriminatedUnionFromEnum)

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
