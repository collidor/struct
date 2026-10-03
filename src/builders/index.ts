// oxlint-disable typescript/no-explicit-any
import {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  DateSchema,
  BigIntSchema,
  NullSchema,
  AnySchema,
  AnySchemaClass,
} from './primitives'
import { StructSchema } from './struct'
import { ArraySchema } from './array'
import { RecordSchema } from './record'
import { EnumSchema, LiteralSchema } from './enum'
import { UnionSchema, TupleSchema } from './union'
import { TransformSchema, PipeSchema } from './transform'
import type { BaseSchema } from '../core/base'
import type {
  StringDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
  DateDescriptor,
  BigIntDescriptor,
  NullDescriptor,
  AnyDescriptor,
  StructDescriptor,
  ArrayDescriptor,
  RecordDescriptor,
  EnumDescriptor,
  LiteralDescriptor,
  UnionDescriptor,
  TupleDescriptor,
  TypeDescriptor,
  TypeKind,
} from '../types/ast'

export const s = {
  string: (descriptor?: Partial<StringDescriptor>): StringSchema => new StringSchema(descriptor),
  number: (descriptor?: Partial<NumberDescriptor>): NumberSchema => new NumberSchema(descriptor),
  integer: (descriptor?: Partial<NumberDescriptor>): NumberSchema =>
    new NumberSchema({ integer: true, kind: 'integer', ...descriptor }),
  boolean: (descriptor?: Partial<BooleanDescriptor>): BooleanSchema => new BooleanSchema(descriptor),
  date: (descriptor?: Partial<DateDescriptor>): DateSchema => new DateSchema(descriptor),
  bigint: (descriptor?: Partial<BigIntDescriptor>): BigIntSchema => new BigIntSchema(descriptor),
  null: (descriptor?: Partial<NullDescriptor>): NullSchema => new NullSchema(descriptor),
  any: (descriptor?: Partial<AnyDescriptor>): AnySchema => new AnySchema(descriptor),
  unknown: (descriptor?: Partial<AnyDescriptor>): AnySchema => new AnySchema(descriptor),

  optional: <TInput, TOutput>(
    schema: BaseSchema<TInput, TOutput>,
    defaultValue?: TOutput | (() => TOutput),
  ): BaseSchema<TInput | undefined, TOutput | undefined> => {
    const opt = schema.optional()
    return defaultValue !== undefined ? (opt.default(defaultValue) as any) : opt
  },

  nullable: <TInput, TOutput>(
    schema: BaseSchema<TInput, TOutput>,
  ): BaseSchema<TInput | null, TOutput | null> => schema.nullable(),

  nullish: <TInput, TOutput>(
    schema: BaseSchema<TInput, TOutput>,
  ): BaseSchema<TInput | null | undefined, TOutput | null | undefined> => schema.nullish(),

  coerce: {
    string: (descriptor?: Partial<StringDescriptor>): StringSchema<unknown> =>
      new StringSchema<unknown>({ coerce: true, ...descriptor }),
    number: (descriptor?: Partial<NumberDescriptor>): NumberSchema<unknown> =>
      new NumberSchema<unknown>({ coerce: true, ...descriptor }),
    boolean: (descriptor?: Partial<BooleanDescriptor>): BooleanSchema<unknown> =>
      new BooleanSchema<unknown>({ coerce: true, ...descriptor }),
    date: (descriptor?: Partial<DateDescriptor>): DateSchema<unknown> =>
      new DateSchema<unknown>({ coerce: true, ...descriptor }),
    bigint: (descriptor?: Partial<BigIntDescriptor>): BigIntSchema<unknown> =>
      new BigIntSchema<unknown>({ coerce: true, ...descriptor }),
  },

  struct: <TShape extends Record<string, BaseSchema<any, any>>>(
    shape: TShape = {} as TShape,
    descriptor?: Partial<StructDescriptor>,
  ): StructSchema<TShape> => new StructSchema(shape, descriptor),

  object: <TShape extends Record<string, BaseSchema<any, any>>>(
    shape: TShape = {} as TShape,
    descriptor?: Partial<StructDescriptor>,
  ): StructSchema<TShape> => new StructSchema(shape, descriptor),

  array: <TItem extends BaseSchema<any, any>>(
    item: TItem,
    descriptor?: Partial<ArrayDescriptor>,
  ): ArraySchema<TItem> => new ArraySchema(item, descriptor),

  record: <
    TValue extends BaseSchema<any, any>,
    TKey extends BaseSchema<string, string> = BaseSchema<string, string>,
  >(
    values: TValue,
    keys?: TKey,
    descriptor?: Partial<RecordDescriptor>,
  ): RecordSchema<TValue, TKey> => new RecordSchema(values, keys, descriptor),

  enum: <TValues extends readonly (string | number)[]>(
    values: TValues,
    descriptor?: Partial<EnumDescriptor>,
  ): EnumSchema<TValues> => new EnumSchema(values, descriptor),

  literal: <TValue extends string | number | boolean | null>(
    value: TValue,
    descriptor?: Partial<LiteralDescriptor>,
  ): LiteralSchema<TValue> => new LiteralSchema(value, descriptor),

  union: <TVariants extends readonly BaseSchema<any, any>[]>(
    variants: TVariants,
    descriptor?: Partial<UnionDescriptor>,
  ): UnionSchema<TVariants> => new UnionSchema(variants, descriptor),

  tuple: <TItems extends readonly BaseSchema<any, any>[]>(
    items: TItems,
    descriptor?: Partial<TupleDescriptor>,
  ): TupleSchema<TItems> => new TupleSchema(items, descriptor),

  pipe: <TInput, TOutput, TNextOutput>(
    schemaA: BaseSchema<TInput, TOutput>,
    schemaB: BaseSchema<TOutput, TNextOutput>,
  ): PipeSchema<TInput, TNextOutput> => new PipeSchema(schemaA, schemaB),

  fromDescriptor: (desc: TypeDescriptor): BaseSchema<any, any> => {
    if (!desc || !desc.kind) {
      return new AnySchema({ ...(desc as unknown as Record<string, unknown>), kind: 'any' })
    }
    const handler = FROM_DESCRIPTOR_HANDLERS[desc.kind] as (
      d: TypeDescriptor,
    ) => BaseSchema<any, any>
    return handler ? handler(desc) : new AnySchema({ ...desc, kind: 'any' })
  },
}

type DescriptorOfKind<K extends TypeKind> = TypeDescriptor extends infer T
  ? T extends { kind: TypeKind }
    ? K extends T['kind']
      ? T
      : never
    : never
  : never

type FromDescriptorHandlers = {
  [K in TypeKind]: (desc: DescriptorOfKind<K>) => BaseSchema<any, any>
}

const FROM_DESCRIPTOR_HANDLERS: FromDescriptorHandlers = {
  string: (desc) => new StringSchema(desc),
  number: (desc) => new NumberSchema(desc),
  integer: (desc) => new NumberSchema({ ...desc, integer: true }),
  boolean: (desc) => new BooleanSchema(desc),
  date: (desc) => new DateSchema(desc),
  bigint: (desc) => new BigIntSchema(desc),
  null: (desc) => new NullSchema(desc),
  any: (desc) => new AnySchema(desc),
  struct: (desc) => {
    const shape: Record<string, BaseSchema<any, any>> = {}
    if (desc.fields) {
      for (const [k, v] of Object.entries(desc.fields)) {
        shape[k] = s.fromDescriptor(v)
      }
    }
    return new StructSchema(shape, desc)
  },
  array: (desc) =>
    new ArraySchema(
      desc.items ? s.fromDescriptor(desc.items) : new AnySchema({ kind: 'any' }),
      desc,
    ),
  record: (desc) =>
    new RecordSchema(
      desc.values ? s.fromDescriptor(desc.values) : new AnySchema({ kind: 'any' }),
      desc.keys ? (s.fromDescriptor(desc.keys) as any) : undefined,
      desc,
    ),
  enum: (desc) => new EnumSchema(desc.values || [], desc),
  literal: (desc) => new LiteralSchema(desc.value, desc),
  union: (desc) => new UnionSchema((desc.variants || []).map(s.fromDescriptor), desc),
  tuple: (desc) => new TupleSchema((desc.items || []).map(s.fromDescriptor), desc),
}

export const struct = s

