import { z } from 'zod'
import type { BaseSchema } from '../core/base'
import type {
  TypeDescriptor,
  TypeKind,
  StringDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
  DateDescriptor,
  BigIntDescriptor,
  StructDescriptor,
  ArrayDescriptor,
  TupleDescriptor,
  RecordDescriptor,
  EnumDescriptor,
  LiteralDescriptor,
  UnionDescriptor,
} from '../types/ast'

type DescriptorOfKind<K extends TypeKind> = TypeDescriptor extends infer T
  ? T extends { kind: TypeKind }
    ? K extends T['kind']
      ? T
      : never
    : never
  : never

type ToZodHandlers = {
  [K in TypeKind]: (desc: DescriptorOfKind<K>) => z.ZodTypeAny
}

/**
 * Dispatch map converting Struct TypeDescriptors to Zod schema instances.
 */
function applyNumberBounds(num: z.ZodNumber, descriptor: NumberDescriptor): z.ZodNumber {
  if (descriptor.min !== undefined) num = num.min(descriptor.min, descriptor.messages?.min)
  if (descriptor.max !== undefined) num = num.max(descriptor.max, descriptor.messages?.max)
  if (descriptor.step !== undefined) num = num.step(descriptor.step, descriptor.messages?.step)
  if (descriptor.positive) num = num.positive(descriptor.messages?.positive)
  if (descriptor.nonnegative) num = num.nonnegative(descriptor.messages?.nonnegative)
  if (descriptor.negative) num = num.negative(descriptor.messages?.negative)
  return num
}

const TO_ZOD_HANDLERS: ToZodHandlers = {
  string: (descriptor: StringDescriptor) => {
    let str = descriptor.coerce ? z.coerce.string() : z.string()
    if (descriptor.minLength !== undefined)
      str = str.min(descriptor.minLength, descriptor.messages?.min)
    if (descriptor.maxLength !== undefined)
      str = str.max(descriptor.maxLength, descriptor.messages?.max)
    if (descriptor.pattern !== undefined)
      str = str.regex(new RegExp(descriptor.pattern), descriptor.messages?.pattern)
    if (descriptor.format === 'email')
      str = str.email(descriptor.messages?.email ?? descriptor.messages?.format)
    if (descriptor.format === 'url')
      str = str.url(descriptor.messages?.url ?? descriptor.messages?.format)
    if (descriptor.format === 'uuid')
      str = str.uuid(descriptor.messages?.uuid ?? descriptor.messages?.format)
    if (descriptor.format === 'datetime') {
      const msg = descriptor.messages?.datetime ?? descriptor.messages?.format
      str = str.datetime(msg ? { message: msg } : undefined)
    }
    if (descriptor.trim) str = str.trim()
    if (descriptor.toLowerCase) str = str.toLowerCase()
    if (descriptor.toUpperCase) str = str.toUpperCase()
    return str
  },

  number: (descriptor: NumberDescriptor) => {
    const base = descriptor.coerce ? z.coerce.number() : z.number()
    return applyNumberBounds(base, descriptor)
  },

  integer: (descriptor: NumberDescriptor) => {
    const base = (descriptor.coerce ? z.coerce.number() : z.number()).int()
    return applyNumberBounds(base, descriptor)
  },

  boolean: (descriptor: BooleanDescriptor) =>
    descriptor.coerce ? z.coerce.boolean() : z.boolean(),

  date: (descriptor: DateDescriptor) => {
    let dateSchema = descriptor.coerce ? z.coerce.date() : z.date()
    if (descriptor.min !== undefined)
      dateSchema = dateSchema.min(new Date(descriptor.min), descriptor.messages?.min)
    if (descriptor.max !== undefined)
      dateSchema = dateSchema.max(new Date(descriptor.max), descriptor.messages?.max)
    return dateSchema
  },

  bigint: (descriptor: BigIntDescriptor) => {
    let bigintSchema = descriptor.coerce ? z.coerce.bigint() : z.bigint()
    if (descriptor.min !== undefined)
      bigintSchema = bigintSchema.min(BigInt(descriptor.min), descriptor.messages?.min)
    if (descriptor.max !== undefined)
      bigintSchema = bigintSchema.max(BigInt(descriptor.max), descriptor.messages?.max)
    if (descriptor.positive)
      bigintSchema = bigintSchema.positive(descriptor.messages?.positive)
    if (descriptor.nonnegative)
      bigintSchema = bigintSchema.nonnegative(descriptor.messages?.nonnegative)
    if (descriptor.negative)
      bigintSchema = bigintSchema.negative(descriptor.messages?.negative)
    return bigintSchema
  },

  null: () => z.null(),

  any: () => z.any(),

  struct: (descriptor: StructDescriptor) => {
    const shape: Record<string, z.ZodTypeAny> = {}
    if (descriptor.fields) {
      for (const [k, fieldDesc] of Object.entries(descriptor.fields)) {
        shape[k] = toZod(fieldDesc)
      }
    }
    let obj: z.ZodObject<Record<string, z.ZodTypeAny>> = z.object(shape)
    if (descriptor.strict) {
      obj = obj.strict()
    } else if (descriptor.passthrough) {
      obj = obj.passthrough()
    }
    return obj
  },

  array: (descriptor: ArrayDescriptor) => {
    let arr = z.array(toZod(descriptor.items))
    if (descriptor.minItems !== undefined)
      arr = arr.min(descriptor.minItems, descriptor.messages?.min)
    if (descriptor.maxItems !== undefined)
      arr = arr.max(descriptor.maxItems, descriptor.messages?.max)
    return arr
  },

  tuple: (descriptor: TupleDescriptor) => {
    const items = descriptor.items.map(toZod)
    return z.tuple(items as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]])
  },

  record: (descriptor: RecordDescriptor) => {
    return z.record(toZod(descriptor.values))
  },

  enum: (descriptor: EnumDescriptor) => {
    if (!descriptor.values || descriptor.values.length === 0) {
      return z.any()
    }
    const [first, ...rest] = descriptor.values.map(String)
    return z.enum([first, ...rest] as [string, ...string[]])
  },

  literal: (descriptor: LiteralDescriptor) => {
    return z.literal(descriptor.value as z.Primitive)
  },

  union: (descriptor: UnionDescriptor) => {
    const variants = descriptor.variants.map(toZod)
    return variants.length >= 2
      ? z.union(variants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
      : (variants[0] ?? z.any())
  },
}

/**
 * Converts a Struct TypeDescriptor or Schema into a Zod schema.
 */
export function toZod(schemaOrDescriptor: BaseSchema<any, any> | TypeDescriptor): z.ZodTypeAny {
  const descriptor: TypeDescriptor =
    typeof schemaOrDescriptor === 'object' &&
    schemaOrDescriptor !== null &&
    'descriptor' in schemaOrDescriptor
      ? (schemaOrDescriptor as BaseSchema<any, any>).descriptor
      : (schemaOrDescriptor as TypeDescriptor)

  const handler = TO_ZOD_HANDLERS[descriptor.kind] as (
    desc: TypeDescriptor,
  ) => z.ZodTypeAny
  let schema = handler ? handler(descriptor) : z.any()

  if (descriptor.optional) {
    schema = schema.optional()
  }

  if (descriptor.nullable) {
    schema = schema.nullable()
  }

  if (descriptor.default !== undefined) {
    schema = schema.default(descriptor.default)
  }

  if (descriptor.description) {
    schema = schema.describe(descriptor.description)
  }

  return schema
}
