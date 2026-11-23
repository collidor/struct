// oxlint-disable typescript/no-explicit-any
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
import {
  UnionSchema,
  TupleSchema,
  createUnionOrDiscriminated,
} from '../builders/union'
import { applyNumberBounds, strictestLower, strictestUpper, type Bound } from './numberBounds'

/**
 * What a Zod 4 schema looks like to this bridge. Declared structurally so the bridge needs no runtime or type import of `zod`,
 * and so it accepts schemas from `zod`, `zod/v4` and `zod/mini` alike.
 */
export interface ZodV4Schema {
  readonly _zod: { readonly def: Record<string, any> }
}

type Def = Record<string, any>
type Convert = (schema: ZodV4Schema) => BaseSchema<any, any>
type Handler = (def: Def, convert: Convert) => BaseSchema<any, any>

/** A Zod 4 check object: `schema._zod.def.checks[i]`. */
interface ZodV4Check {
  readonly _zod: {
    readonly def: Def
    readonly check?: (payload: { value: unknown; issues: any[] }) => unknown
  }
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function'

/**
 * The message a check was given (`z.string().min(2, 'Too short')`), which Zod 4 keeps as an error function.
 * A function that needs a real issue to answer is ignored, so the struct falls back to its own message.
 */
function messageOf(def: Def): string | undefined {
  const error = def.error
  if (typeof error === 'string') return error
  if (typeof error !== 'function') return undefined
  try {
    const result = error({})
    if (typeof result === 'string') return result
    if (typeof result?.message === 'string') return result.message
  } catch {
    // The message depends on the issue; use the struct's default.
  }
  return undefined
}

/**
 * Every check of a schema, as defs. A format schema such as `z.email()` or `z.int()` is its own check, so its def comes first.
 */
function checkDefsOf(def: Def): Def[] {
  const own = typeof def.check === 'string' ? [def] : []
  const added = ((def.checks ?? []) as ZodV4Check[]).map((check) => check._zod.def)
  return [...own, ...added]
}

const INTEGER_FORMATS: Record<string, { min?: number; max?: number }> = {
  safeint: {},
  int32: { min: -2147483648, max: 2147483647 },
  uint32: { min: 0, max: 4294967295 },
}

/** What `.trim()`, `.toLowerCase()` and `.toUpperCase()` become in Zod 4: an anonymous `overwrite` check holding the function. */
function applyOverwrite(schema: StringSchema<any>, tx: unknown): StringSchema<any> {
  if (typeof tx !== 'function') return schema
  const sample = ' aB '
  const out = tx(sample)
  if (out === sample.trim()) return schema.trim()
  if (out === sample.toLowerCase()) return schema.toLowerCase()
  if (out === sample.toUpperCase()) return schema.toUpperCase()
  return schema
}

function applyStringFormat(
  schema: StringSchema<any>,
  def: Def,
  message: string | undefined,
): StringSchema<any> {
  switch (def.format) {
    case 'email':
      return schema.email(message)
    case 'url':
      return schema.url(message)
    case 'uuid':
      return schema.uuid(message)
    case 'datetime':
      return schema.datetime(message)
    default:
      // regex, cuid, ulid, ipv4, base64, startsWith ... all carry the RegExp they test.
      return def.pattern instanceof RegExp ? schema.regex(def.pattern, message) : schema
  }
}

function applyStringChecks(schema: StringSchema<any>, def: Def): StringSchema<any> {
  const lowers: Bound[] = []
  const uppers: Bound[] = []

  for (const c of checkDefsOf(def)) {
    const message = messageOf(c)
    switch (c.check) {
      case 'min_length':
        lowers.push({ value: c.minimum, message })
        break
      case 'max_length':
        uppers.push({ value: c.maximum, message })
        break
      case 'length_equals':
        schema = schema.length(c.length, message)
        break
      case 'string_format':
        schema = applyStringFormat(schema, c, message)
        break
      case 'overwrite':
        schema = applyOverwrite(schema, c.tx)
        break
    }
  }

  const lower = strictestLower(lowers)
  const upper = strictestUpper(uppers)
  if (lower) schema = schema.min(lower.value, lower.message)
  if (upper) schema = schema.max(upper.value, upper.message)
  return schema
}

function applyNumberChecks(schema: NumberSchema<any>, def: Def): NumberSchema<any> {
  const lowers: Bound[] = []
  const uppers: Bound[] = []

  for (const c of checkDefsOf(def)) {
    const message = messageOf(c)
    switch (c.check) {
      case 'number_format': {
        const bounds = INTEGER_FORMATS[c.format]
        if (bounds?.min !== undefined) lowers.push({ value: bounds.min })
        if (bounds?.max !== undefined) uppers.push({ value: bounds.max })
        break
      }
      case 'greater_than':
        lowers.push({ value: c.value, inclusive: c.inclusive, message })
        break
      case 'less_than':
        uppers.push({ value: c.value, inclusive: c.inclusive, message })
        break
      case 'multiple_of':
        schema = schema.step(c.value, message)
        break
    }
  }

  return applyNumberBounds(schema, lowers, uppers)
}

function applyBigIntChecks(schema: BigIntSchema<any>, def: Def): BigIntSchema<any> {
  for (const c of checkDefsOf(def)) {
    const message = messageOf(c)
    if (c.check === 'greater_than') {
      const val = BigInt(c.value)
      if (c.inclusive && val === 0n) schema = schema.nonnegative(message)
      else if (!c.inclusive && val === 0n) schema = schema.positive(message)
      else if (c.inclusive) schema = schema.min(val, message)
      else
        schema = schema.refine(
          (v: bigint) => v > val,
          message ?? `BigInt must be greater than ${val}n`,
        )
    } else if (c.check === 'less_than') {
      const val = BigInt(c.value)
      if (!c.inclusive && val === 0n) schema = schema.negative(message)
      else if (c.inclusive) schema = schema.max(val, message)
      else
        schema = schema.refine(
          (v: bigint) => v < val,
          message ?? `BigInt must be less than ${val}n`,
        )
    } else if (c.check === 'multiple_of') {
      const step = BigInt(c.value)
      schema = schema.refine(
        (v: bigint) => v % step === 0n,
        message ?? `BigInt must be multiple of ${step}`,
      )
    }
  }
  return schema
}

function applyDateChecks(schema: DateSchema<any>, def: Def): DateSchema<any> {
  for (const c of checkDefsOf(def)) {
    const message = messageOf(c)
    const bound = new Date(c.value)
    if (c.check === 'greater_than') {
      schema = c.inclusive
        ? schema.min(bound, message)
        : schema.refine(
            (v: Date) => v.getTime() > bound.getTime(),
            message ?? `Date must be greater than ${bound.toISOString()}`,
          )
    } else if (c.check === 'less_than') {
      schema = c.inclusive
        ? schema.max(bound, message)
        : schema.refine(
            (v: Date) => v.getTime() < bound.getTime(),
            message ?? `Date must be less than ${bound.toISOString()}`,
          )
    }
  }
  return schema
}

/**
 * `.refine()`, `.superRefine()` and `.check()`, which Zod 4 keeps as `custom` checks on whatever they were called on.
 * A refine has `fn`; a superRefine or check only has a function that writes issues into a payload, so it is run on one.
 */
function applyCustomChecks(
  schema: BaseSchema<any, any>,
  def: Def,
): BaseSchema<any, any> {
  for (const check of (def.checks ?? []) as ZodV4Check[]) {
    const c = check._zod.def
    if (c.check !== 'custom') continue

    if (typeof c.fn === 'function') {
      schema = schema.refine(
        (value: unknown) => {
          const result = c.fn(value)
          return isThenable(result) ? Promise.resolve(result).then(Boolean) : Boolean(result)
        },
        { message: messageOf(c), path: c.path },
      )
      continue
    }

    const run = check._zod.check
    if (typeof run !== 'function') continue

    schema = schema.refine((value: unknown) => {
      const payload = { value, issues: [] as any[] }
      const settle = () =>
        payload.issues.length === 0
          ? true
          : payload.issues.map((issue) => ({
              message: typeof issue.message === 'string' ? issue.message : undefined,
              path: Array.isArray(issue.path) ? issue.path : undefined,
            }))
      const result = run(payload)
      return isThenable(result) ? Promise.resolve(result).then(settle) : settle()
    })
  }
  return schema
}

function lengthChecksOfArray(schema: ArraySchema<any>, def: Def): ArraySchema<any> {
  const lowers: Bound[] = []
  const uppers: Bound[] = []

  for (const c of checkDefsOf(def)) {
    const message = messageOf(c)
    if (c.check === 'min_length') lowers.push({ value: c.minimum, message })
    else if (c.check === 'max_length') uppers.push({ value: c.maximum, message })
    else if (c.check === 'length_equals') schema = schema.length(c.length, message)
  }

  const lower = strictestLower(lowers)
  const upper = strictestUpper(uppers)
  if (lower) schema = schema.min(lower.value, lower.message)
  if (upper) schema = schema.max(upper.value, upper.message)
  return schema
}

/** Zod's own rule for `z.enum(NativeEnum)`: a numeric enum also maps each value back to its name, which is not a value. */
function enumValuesOf(entries: Record<string, string | number>): (string | number)[] {
  return Object.keys(entries)
    .filter((key) => typeof entries[entries[key] as string] !== 'number')
    .map((key) => entries[key] as string | number)
}

/**
 * Dispatch map converting Zod 4 definitions (`schema._zod.def`) into Struct schemas, keyed by `def.type`.
 */
const FROM_ZOD_V4_HANDLERS: Record<string, Handler> = {
  string: (def) =>
    applyStringChecks(def.coerce ? new StringSchema<unknown>({ coerce: true }) : new StringSchema(), def),

  number: (def) => {
    const integerFormat = checkDefsOf(def).find(
      (c) => c.check === 'number_format' && c.format in INTEGER_FORMATS,
    )
    const integer = integerFormat !== undefined
    const options = { integer, kind: integer ? 'integer' : 'number' } as const
    return applyNumberChecks(
      def.coerce ? new NumberSchema<unknown>({ coerce: true, ...options }) : new NumberSchema(options),
      def,
    )
  },

  boolean: (def) =>
    def.coerce ? new BooleanSchema<unknown>({ coerce: true }) : new BooleanSchema(),

  bigint: (def) =>
    applyBigIntChecks(def.coerce ? new BigIntSchema<unknown>({ coerce: true }) : new BigIntSchema(), def),

  date: (def) =>
    applyDateChecks(def.coerce ? new DateSchema<unknown>({ coerce: true }) : new DateSchema(), def),

  null: () => new NullSchema(),

  array: (def, convert) => lengthChecksOfArray(new ArraySchema(convert(def.element)), def),

  tuple: (def, convert) => new TupleSchema((def.items ?? []).map(convert)),

  object: (def, convert) => {
    const shape = def.shape ?? {}
    const structShape: Record<string, BaseSchema<any, any>> = {}
    for (const [key, value] of Object.entries(shape)) {
      structShape[key] = convert(value as ZodV4Schema)
    }
    const schema = new StructSchema(structShape)
    // `.strict()` is a `never` catchall, `.passthrough()` / `looseObject` an `unknown` one, and a plain object has none.
    const catchall = def.catchall?._zod?.def?.type
    if (catchall === 'never') return schema.strict()
    if (catchall !== undefined) return schema.passthrough()
    return schema
  },

  enum: (def) => new EnumSchema(enumValuesOf(def.entries ?? {})),

  literal: (def) => {
    const values: unknown[] = def.values ?? []
    if (values.length === 1) return new LiteralSchema(values[0] as any)
    return new UnionSchema(values.map((value) => new LiteralSchema(value as any)))
  },

  union: (def, convert) =>
    createUnionOrDiscriminated((def.options ?? []).map(convert), def.discriminator),

  record: (def, convert) => new RecordSchema(convert(def.valueType)),

  optional: (def, convert) => convert(def.innerType).optional(),
  nullable: (def, convert) => convert(def.innerType).nullable(),
  // Zod 4 stores the default as a value (a function default is evaluated on each read); the struct keeps it as a serialisable value.
  default: (def, convert) => convert(def.innerType).default(def.defaultValue),
  prefault: (def, convert) => convert(def.innerType).default(def.defaultValue),
  nonoptional: (def, convert) => {
    const inner: ZodV4Schema = def.innerType
    return convert(inner._zod.def.type === 'optional' ? inner._zod.def.innerType : inner)
  },
  catch: (def, convert) => convert(def.innerType),
  readonly: (def, convert) => convert(def.innerType),

  pipe: (def, convert) => {
    const input: ZodV4Schema = def.in
    const output: ZodV4Schema = def.out
    // `.transform(fn)` is a pipe into a transform, which has no input type of its own.
    if (output._zod.def.type === 'transform') {
      const transform = output._zod.def.transform as (value: unknown, ctx: unknown) => unknown
      return convert(input).transform((value) =>
        transform(value, { value, issues: [], addIssue: () => {} }),
      )
    }
    // `z.preprocess(fn, schema)` is a pipe from a transform.
    if (input._zod.def.type === 'transform') {
      const transform = input._zod.def.transform as (value: unknown, ctx: unknown) => unknown
      return new AnySchema()
        .transform((value) => transform(value, { value, issues: [], addIssue: () => {} }))
        .pipe(convert(output))
    }
    return convert(input).pipe(convert(output))
  },

  intersection: (def, convert) => {
    const left: ZodV4Schema = def.left
    const right: ZodV4Schema = def.right
    // The struct has no intersection; two objects merge their fields, anything else keeps the left side.
    if (left._zod.def.type === 'object' && right._zod.def.type === 'object') {
      return FROM_ZOD_V4_HANDLERS['object']!(
        { ...left._zod.def, shape: { ...left._zod.def.shape, ...right._zod.def.shape } },
        convert,
      )
    }
    return convert(left)
  },
}

/** Converts one schema, guarding against `z.lazy()` schemas that refer back to themselves. */
function convertSchema(zodSchema: ZodV4Schema, resolving: Set<unknown>): BaseSchema<any, any> {
  if (typeof zodSchema !== 'object' || zodSchema === null || !('_zod' in zodSchema)) {
    throw new TypeError(
      'fromZod() expects a Zod 4 schema (one with `_zod`). For a Zod 3 schema use fromZodV3().',
    )
  }

  const def = zodSchema._zod.def
  const convert: Convert = (next) => convertSchema(next, resolving)

  let schema: BaseSchema<any, any>

  if (def.type === 'lazy') {
    // A lazy schema that reaches itself again has no finite struct: stop there and accept anything.
    if (resolving.has(zodSchema)) return new AnySchema()
    resolving.add(zodSchema)
    try {
      schema = convert(def.getter())
    } finally {
      resolving.delete(zodSchema)
    }
  } else {
    const handler = FROM_ZOD_V4_HANDLERS[def.type]
    schema = handler ? handler(def, convert) : new AnySchema()
  }

  schema = applyCustomChecks(schema, def)

  const description = (zodSchema as { description?: unknown }).description
  if (typeof description === 'string' && description !== '') {
    schema = schema.description(description)
  }

  return schema
}

/**
 * Converts a **Zod 4** schema instance into a Struct BaseSchema.
 * Extracts constraints, custom messages, format validations, refinements, transforms and wrapped types.
 *
 * It reads `schema._zod.def`, so it works on schemas from `zod` 4, `zod/v4` (inside zod 3.25) and `zod/mini`.
 * For a Zod 3 schema use {@link fromZodV3}.
 *
 * Differences from Zod that the struct cannot express: a tuple's rest element is dropped, a `z.intersection` of anything
 * other than two objects keeps its left side, a `catchall` of any type becomes `passthrough`, and a function default is
 * evaluated once, here.
 *
 * @throws TypeError when given something that is not a Zod 4 schema, such as a Zod 3 one.
 */
export function fromZod(zodSchema: ZodV4Schema): BaseSchema<any, any> {
  return convertSchema(zodSchema, new Set())
}
