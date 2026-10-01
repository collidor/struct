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

export { toZod } from './toZod'

/**
 * Dispatch map converting Zod definitions (_def) into Struct schemas.
 */
const FROM_ZOD_HANDLERS: Record<string, (def: any) => BaseSchema<any, any>> = {
  ZodString: (def: any) => {
    let schema = def.coerce
      ? new StringSchema<unknown>({ coerce: true })
      : new StringSchema()
    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        switch (c.kind) {
          case 'min':
            schema = schema.min(c.value, c.message)
            break
          case 'max':
            schema = schema.max(c.value, c.message)
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

    if (Array.isArray(def.checks)) {
      for (const c of def.checks) {
        switch (c.kind) {
          case 'min': {
            if (c.inclusive === false) {
              schema = schema.refine(
                (v: number) => v > c.value,
                c.message ?? `Number must be greater than ${c.value}`
              )
            } else {
              schema = schema.min(c.value, c.message)
            }
            break
          }
          case 'max': {
            if (c.inclusive === false) {
              schema = schema.refine(
                (v: number) => v < c.value,
                c.message ?? `Number must be less than ${c.value}`
              )
            } else {
              schema = schema.max(c.value, c.message)
            }
            break
          }
          case 'multipleOf':
            schema = schema.step(c.value, c.message)
            break
        }
      }
    }
    return schema
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
    let schema = new ArraySchema(fromZod(def.type || z.any()))
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
    const items = (def.items || []).map((item: any) => fromZod(item))
    return new TupleSchema(items)
  },

  ZodObject: (def: any) => {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape || {}
    const structShape: Record<string, BaseSchema<any, any>> = {}
    for (const [k, v] of Object.entries(shape)) {
      structShape[k] = fromZod(v as z.ZodTypeAny)
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
  ZodRecord: (def: any) => new RecordSchema(fromZod(def.valueType || z.any())),
  ZodUnion: (def: any) => new UnionSchema((def.options || []).map((o: any) => fromZod(o))),
  ZodDiscriminatedUnion: (def: any) =>
    new UnionSchema((def.options || []).map((o: any) => fromZod(o))),
  ZodOptional: (def: any) => fromZod(def.innerType).optional(),
  ZodNullable: (def: any) => fromZod(def.innerType).nullable(),
  ZodDefault: (def: any) => fromZod(def.innerType).default(def.defaultValue()),
  ZodEffects: (def: any) => {
    const schema = fromZod(def.schema)
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
  ZodCatch: (def: any) => fromZod(def.innerType),
  ZodBranded: (def: any) => fromZod(def.type),
  ZodPipeline: (def: any) => fromZod(def.out || def.in),
}

/**
 * Converts a Zod schema instance into a Struct BaseSchema.
 * Extracts constraints, custom messages, format validations, and wrapped types.
 */
export function fromZod(zodSchema: z.ZodTypeAny): BaseSchema<any, any> {
  const typeName =
    (zodSchema as any)._def?.typeName ||
    (zodSchema as any).constructor?.name ||
    ''
  const def = (zodSchema as any)._def || {}

  const handler = FROM_ZOD_HANDLERS[typeName]
  let schema: BaseSchema<any, any> = handler ? handler(def) : new AnySchema()

  if (def.description) {
    schema = schema.description(def.description)
  }

  return schema
}
