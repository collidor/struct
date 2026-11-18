// oxlint-disable typescript/no-explicit-any
import { z } from 'zod'
import type { BaseSchema } from '../core/base'
import {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  DateSchema,
  BigIntSchema,
  NullSchema,
  AnySchema,
} from '../builders/primitives'
import { StructSchema } from '../builders/struct'
import { ArraySchema } from '../builders/array'
import { RecordSchema } from '../builders/record'
import { EnumSchema, LiteralSchema } from '../builders/enum'
import { UnionSchema, TupleSchema } from '../builders/union'
import { applyNumberBounds, strictestLower, strictestUpper, type Bound } from './numberBounds'

/**
 * Dispatch map converting Zod 3 definitions (`_def`) into Struct schemas.
 */
const FROM_ZOD_V3_HANDLERS: Record<string, (def: any) => BaseSchema<any, any>> = {
  ZodString: (def: any) => {
    let schema = def.coerce
      ? new StringSchema<unknown>({ coerce: true })
      : new StringSchema()
    const lowers: Bound[] = []
    const uppers: Bound[] = []
    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        switch (c.kind) {
          case 'min':
            lowers.push({ value: c.value, message: c.message })
            break
          case 'max':
            uppers.push({ value: c.value, message: c.message })
            break
          case 'length':
            schema = schema.length(c.value, c.message)
            break
          case 'email':
            schema = schema.email(c.message)
            break
          case 'url':
            schema = schema.url(c.message)
            break
          case 'uuid':
            schema = schema.uuid(c.message)
            break
          case 'datetime':
            schema = schema.datetime(c.message)
            break
          case 'regex':
            schema = schema.regex(c.regex, c.message)
            break
          case 'trim':
            schema = schema.trim()
            break
          case 'toLowerCase':
            schema = schema.toLowerCase()
            break
          case 'toUpperCase':
            schema = schema.toUpperCase()
            break
        }
      }
    }
    // A struct has one `min` and one `max`; Zod keeps every one written, so the strictest is the one to pass on.
    const lower = strictestLower(lowers)
    const upper = strictestUpper(uppers)
    if (lower) schema = schema.min(lower.value, lower.message)
    if (upper) schema = schema.max(upper.value, upper.message)
    return schema
  },

  ZodNumber: (def: any) => {
    const isInt = def.checks?.some((c: any) => c.kind === 'int')
    let schema = def.coerce
      ? new NumberSchema<unknown>({
          coerce: true,
          integer: isInt,
          kind: isInt ? 'integer' : 'number',
        })
      : new NumberSchema({
          integer: isInt,
          kind: isInt ? 'integer' : 'number',
        })

    const lowers: Bound[] = []
    const uppers: Bound[] = []
    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        switch (c.kind) {
          case 'min':
            lowers.push({ value: c.value, inclusive: c.inclusive !== false, message: c.message })
            break
          case 'max':
            uppers.push({ value: c.value, inclusive: c.inclusive !== false, message: c.message })
            break
          case 'multipleOf':
            schema = schema.step(c.value, c.message)
            break
        }
      }
    }
    return applyNumberBounds(schema, lowers, uppers)
  },

  ZodBoolean: (def: any) =>
    def.coerce ? new BooleanSchema<unknown>({ coerce: true }) : new BooleanSchema(),

  ZodDate: (def: any) => {
    let schema = def.coerce
      ? new DateSchema<unknown>({ coerce: true })
      : new DateSchema()
    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        if (c.kind === 'min') {
          if (c.inclusive === false) {
            schema = schema.refine(
              (v: Date) => v.getTime() > new Date(c.value).getTime(),
              c.message ?? `Date must be greater than ${new Date(c.value).toISOString()}`
            )
          } else {
            schema = schema.min(new Date(c.value), c.message)
          }
        } else if (c.kind === 'max') {
          if (c.inclusive === false) {
            schema = schema.refine(
              (v: Date) => v.getTime() < new Date(c.value).getTime(),
              c.message ?? `Date must be less than ${new Date(c.value).toISOString()}`
            )
          } else {
            schema = schema.max(new Date(c.value), c.message)
          }
        }
      }
    }
    return schema
  },

  ZodBigInt: (def: any) => {
    let schema = def.coerce
      ? new BigIntSchema<unknown>({ coerce: true })
      : new BigIntSchema()
    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        if (c.kind === 'min') {
          const val = BigInt(c.value)
          if (val === 0n && c.inclusive === false) {
            schema = schema.positive(c.message)
          } else if (val === 0n && c.inclusive === true) {
            schema = schema.nonnegative(c.message)
          } else if (c.inclusive === false) {
            schema = schema.refine(
              (v: bigint) => v > val,
              c.message ?? `BigInt must be greater than ${c.value}n`
            )
          } else {
            schema = schema.min(val, c.message)
          }
        } else if (c.kind === 'max') {
          const val = BigInt(c.value)
          if (val === 0n && c.inclusive === false) {
            schema = schema.negative(c.message)
          } else if (c.inclusive === false) {
            schema = schema.refine(
              (v: bigint) => v < val,
              c.message ?? `BigInt must be less than ${c.value}n`
            )
          } else {
            schema = schema.max(val, c.message)
          }
        } else if (c.kind === 'multipleOf') {
          const step = BigInt(c.value)
          schema = schema.refine(
            (v: bigint) => v % step === 0n,
            c.message ?? `BigInt must be multiple of ${step}`
          )
        }
      }
    }
    return schema
  },

  ZodNull: () => new NullSchema(),

  ZodArray: (def: any) => {
    let schema = new ArraySchema(fromZodV3(def.type || z.any()))
    if (def.minLength !== null && def.minLength !== undefined) {
      schema = schema.min(def.minLength.value, def.minLength.message)
    }
    if (def.maxLength !== null && def.maxLength !== undefined) {
      schema = schema.max(def.maxLength.value, def.maxLength.message)
    }
    if (def.exactLength !== null && def.exactLength !== undefined) {
      schema = schema.length(def.exactLength.value, def.exactLength.message)
    }
    return schema
  },

  ZodTuple: (def: any) => {
    const items = (def.items || []).map((item: any) => fromZodV3(item))
    return new TupleSchema(items)
  },

  ZodObject: (def: any) => {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape || {}
    const structShape: Record<string, BaseSchema<any, any>> = {}
    for (const [k, v] of Object.entries(shape)) {
      structShape[k] = fromZodV3(v as z.ZodTypeAny)
    }
    let schema = new StructSchema(structShape)
    if (def.unknownKeys === 'strict') {
      schema = schema.strict()
    } else if (def.unknownKeys === 'passthrough') {
      schema = schema.passthrough()
    }
    return schema
  },

  ZodEnum: (def: any) => new EnumSchema(def.values || []),
  ZodNativeEnum: (def: any) => new EnumSchema(Object.values(def.values || {}) as any),
  ZodLiteral: (def: any) => new LiteralSchema(def.value),
  ZodRecord: (def: any) => new RecordSchema(fromZodV3(def.valueType || z.any())),
  ZodUnion: (def: any) => new UnionSchema((def.options || []).map((o: any) => fromZodV3(o))),
  ZodDiscriminatedUnion: (def: any) =>
    new UnionSchema((def.options || []).map((o: any) => fromZodV3(o))),
  // In Zod 3 an outer `.optional()` returns `undefined` before an inner `.default()` is asked, so the default never applies.
  // The struct keeps one flat default, which would win, so the inner default is left out here.
  ZodOptional: (def: any) => {
    const inner = def.innerType
    const withoutDefault = inner?._def?.typeName === 'ZodDefault' ? inner._def.innerType : inner
    return fromZodV3(withoutDefault).optional()
  },
  ZodNullable: (def: any) => fromZodV3(def.innerType).nullable(),
  ZodDefault: (def: any) => fromZodV3(def.innerType).default(def.defaultValue()),
  ZodEffects: (def: any) => {
    const schema = fromZodV3(def.schema)
    if (def.effect) {
      if (def.effect.type === 'refinement') {
        return schema.refine((v: any) => {
          const addedIssues: Array<{ message?: string; path?: (string | number)[] }> = []
          let hasError = false
          const ctx = {
            addIssue: (issue: any) => {
              hasError = true
              addedIssues.push({
                message: issue?.message,
                path: issue?.path,
              })
            },
            path: [],
          }
          const res = def.effect.refinement(v, ctx)
          if (res === false || hasError) {
            if (addedIssues.length > 0) {
              return addedIssues
            }
            return false
          }
          return true
        }, def.effect.message)
      } else if (def.effect.type === 'transform') {
        return schema.transform(def.effect.transform)
      } else if (def.effect.type === 'preprocess') {
        return new AnySchema().transform(def.effect.transform).pipe(schema)
      }
    }
    return schema
  },
  ZodCatch: (def: any) => fromZodV3(def.innerType),
  ZodBranded: (def: any) => fromZodV3(def.type),
  ZodPipeline: (def: any) => fromZodV3(def.out || def.in),
}

/**
 * Converts a **Zod 3** schema instance into a Struct BaseSchema.
 * Extracts constraints, custom messages, format validations, and wrapped types.
 *
 * It reads the Zod 3 `_def` shape (`typeName`, `checks[].kind`, `defaultValue()`), which Zod 4 replaced:
 * on a Zod 4 schema use {@link fromZod} instead.
 */
export function fromZodV3(zodSchema: z.ZodTypeAny): BaseSchema<any, any> {
  if (typeof zodSchema === 'object' && zodSchema !== null && '_zod' in zodSchema) {
    throw new TypeError(
      'fromZodV3() expects a Zod 3 schema, but this is a Zod 4 schema (it has `_zod`). Use fromZod() instead.',
    )
  }
  const typeName =
    (zodSchema as any)._def?.typeName ||
    (zodSchema as any).constructor?.name ||
    ''
  const def = (zodSchema as any)._def || {}

  const handler = FROM_ZOD_V3_HANDLERS[typeName]
  let schema: BaseSchema<any, any> = handler ? handler(def) : new AnySchema()

  if (def.description) {
    schema = schema.description(def.description)
  }

  return schema
}
