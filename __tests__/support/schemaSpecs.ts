// oxlint-disable typescript/no-explicit-any
/**
 * Shared generators for the property-based bridge tests.
 *
 * A `Spec` is a small, serialisable description of a schema. One spec is built into a Zod 3 schema, a Zod 4 schema and a
 * struct schema, so the converters can be checked against the library each one reads from, on the same generated inputs.
 */
import fc from 'fast-check'
import { s } from '../../src'

export const PATTERNS = { letters: /^[a-z]*$/, digits: /^[0-9]*$/ } as const
export type PatternName = keyof typeof PATTERNS

export type Spec =
  | { t: 'string'; min?: number; max?: number; pattern?: PatternName }
  | {
      t: 'number'
      int: boolean
      min?: number
      max?: number
      exMin?: number
      exMax?: number
      multipleOf?: number
    }
  | { t: 'boolean' }
  | { t: 'enum'; values: string[] }
  | { t: 'literal'; value: string | number | boolean }
  | { t: 'array'; item: Spec; min?: number; max?: number }
  | { t: 'object'; fields: Field[] }
  | { t: 'nullable'; inner: Spec }
  | { t: 'defaulted'; base: 'string' | 'number' | 'boolean'; value: string | number | boolean }

export type Field = { key: string; spec: Spec; optional: boolean }

// ---------------------------------------------------------------------------------------------------------------------
// Spec generators
// ---------------------------------------------------------------------------------------------------------------------

const maybe = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> => fc.option(arb, { nil: undefined })

/** Whole numbers and halves, so bounds fall both on and between the integers the inputs hit. */
const bound = fc.oneof(
  fc.integer({ min: -10, max: 10 }),
  fc.integer({ min: -10, max: 10 }).map((n) => n + 0.5),
)

const stringSpec: fc.Arbitrary<Spec> = fc
  .record({
    t: fc.constant('string' as const),
    min: maybe(fc.nat(6)),
    max: maybe(fc.nat(8)),
    pattern: maybe(fc.constantFrom<PatternName>('letters', 'digits')),
  })
  // Zod 4 itself throws on `.min(5).max(2)` (it builds the regex /^[\s\S]{5,2}$/), so such a schema cannot exist to be converted.
  .map((spec) =>
    spec.min !== undefined && spec.max !== undefined && spec.min > spec.max ? { ...spec, max: spec.min } : spec,
  )

/**
 * @param exclusive - Whether `>` and `<` bounds are generated. The struct has no builder for them, so the struct-side
 *   roundtrips leave them out; the converters from Zod and JSON Schema read them.
 */
const numberSpec = (exclusive: boolean): fc.Arbitrary<Spec> =>
  fc
    .record({
      t: fc.constant('number' as const),
      int: fc.boolean(),
      min: maybe(bound),
      max: maybe(bound),
      exMin: exclusive ? maybe(bound) : fc.constant(undefined),
      exMax: exclusive ? maybe(bound) : fc.constant(undefined),
      multipleOf: maybe(fc.constantFrom(2, 5)),
    })
    // A multiple is only compared on integers: Zod and the struct round a fractional remainder differently.
    .map((spec) => (spec.int ? spec : { ...spec, multipleOf: undefined }))

const enumSpec: fc.Arbitrary<Spec> = fc.record({
  t: fc.constant('enum' as const),
  values: fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { minLength: 1, maxLength: 4 }),
})

const literalSpec: fc.Arbitrary<Spec> = fc.record({
  t: fc.constant('literal' as const),
  value: fc.oneof(fc.constantFrom('x', 'y'), fc.integer({ min: -3, max: 3 }), fc.boolean()),
})

const leafSpec = (exclusive: boolean): fc.Arbitrary<Spec> =>
  fc.oneof(stringSpec, numberSpec(exclusive), fc.constant<Spec>({ t: 'boolean' }), enumSpec, literalSpec)

const defaultedSpec: fc.Arbitrary<Spec> = fc.oneof(
  fc.record({ t: fc.constant('defaulted' as const), base: fc.constant('string' as const), value: fc.constantFrom('x', 'hello') }),
  fc.record({ t: fc.constant('defaulted' as const), base: fc.constant('number' as const), value: fc.integer({ min: -5, max: 5 }) }),
  fc.record({ t: fc.constant('defaulted' as const), base: fc.constant('boolean' as const), value: fc.boolean() }),
)

const FIELD_KEYS = ['a', 'b', 'c', 'd'] as const

/**
 * A schema of up to a few levels: leaves, arrays, nullable wrappers and objects. `optional` and `defaulted` only appear as
 * an object field, because a JSON Schema cannot say "this schema may be absent" for the root.
 */
export const specArb = (options: { exclusive?: boolean } = {}): fc.Arbitrary<Spec> => {
  const exclusive = options.exclusive ?? true
  const { spec } = fc.letrec<{ spec: Spec; field: Field }>((tie) => ({
    spec: fc.oneof(
      { depthSize: 'small', maxDepth: 3, depthIdentifier: 'spec' },
      leafSpec(exclusive),
      fc.record({ t: fc.constant('array' as const), item: tie('spec'), min: maybe(fc.nat(2)), max: maybe(fc.nat(4)) }),
      fc.record({ t: fc.constant('nullable' as const), inner: tie('spec') }),
      fc.record({
        t: fc.constant('object' as const),
        fields: fc.uniqueArray(tie('field'), { selector: (field) => field.key, maxLength: 4 }),
      }),
    ),
    field: fc.record({
      key: fc.constantFrom(...FIELD_KEYS),
      spec: fc.oneof({ weight: 5, arbitrary: tie('spec') }, { weight: 1, arbitrary: defaultedSpec }),
      optional: fc.boolean(),
    }),
  }))
  return spec as fc.Arbitrary<Spec>
}

/** Only objects, which is what a command input is and what the JSON Schema bridge is used on. */
export const objectSpecArb = (options: { exclusive?: boolean } = {}): fc.Arbitrary<Spec> =>
  specArb(options).filter((spec) => spec.t === 'object')

// ---------------------------------------------------------------------------------------------------------------------
// Input generators
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Bounded, because `multipleOf` on a number past 1e21 is where Zod 3, Zod 4 and a plain remainder part ways (their remainders go through
 * `toFixed`, which switches to exponent notation there). NaN and the infinities are added explicitly.
 */
const numberNoise = (finiteOnly: boolean): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: -1e9, max: 1e9, noNaN: true }) },
    { weight: 2, arbitrary: fc.constantFrom(Number.NaN, -0, ...(finiteOnly ? [] : [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])) },
  )

const noiseArb = (finiteOnly: boolean): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.boolean(),
    numberNoise(finiteOnly),
    fc.string(),
    fc.array(fc.integer(), { maxLength: 3 }),
    fc.constant({}),
  )

const MISSING = Symbol('missing')

/**
 * Values that are usually near the schema (often valid, often just outside), mixed with a little noise of any type.
 *
 * @param finiteOnly - Leave out +-Infinity. The struct and Zod 4 reject them, Zod 3 accepts them, so a property against Zod 3 has
 *   nothing to agree on for those.
 */
export const valueArb = (spec: Spec, finiteOnly = false): fc.Arbitrary<unknown> => {
  const near = ((): fc.Arbitrary<unknown> => {
    switch (spec.t) {
      case 'string':
        return fc.oneof(
          fc.string({ maxLength: 10 }),
          fc.stringMatching(/^[a-z]{0,10}$/),
          fc.stringMatching(/^[0-9]{0,10}$/),
        )
      case 'number':
        return fc.oneof(
          fc.integer({ min: -15, max: 15 }),
          fc.integer({ min: -30, max: 30 }).map((n) => n / 2),
          // Zod 3's multipleOf reads `toFixed(0)`, which is exponent notation from 1e21 up, so stay below that.
          fc.double({ min: -1e9, max: 1e9, noNaN: true }),
          fc.constantFrom(Number.NaN, -0, ...(finiteOnly ? [] : [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])),
        )
      case 'boolean':
        return fc.boolean()
      case 'enum':
        return fc.oneof(fc.constantFrom(...spec.values), fc.constantFrom('a', 'b', 'c', 'd', 'e', 'z'))
      case 'literal':
        return fc.oneof(fc.constant(spec.value), fc.constantFrom('x', 'y', 0, 1, true, false))
      case 'array':
        return fc.array(valueArb(spec.item, finiteOnly), { maxLength: 6 })
      case 'nullable':
        return fc.oneof(fc.constant(null), valueArb(spec.inner, finiteOnly))
      case 'defaulted':
        return fc.oneof(
          fc.constant(undefined),
          spec.base === 'string' ? fc.string({ maxLength: 6 }) : spec.base === 'number' ? numberNoise(finiteOnly) : fc.boolean(),
        )
      case 'object':
        return fc
          .tuple(
            fc.tuple(
              ...spec.fields.map((field) =>
                fc.oneof(
                  { weight: field.optional ? 2 : 6, arbitrary: valueArb(field.spec, finiteOnly) },
                  { weight: field.optional ? 2 : 1, arbitrary: fc.constant(MISSING) },
                ),
              ),
            ),
            maybe(fc.constantFrom('zzz', 'extra')),
          )
          .map(([values, extra]) => {
            const out: Record<string, unknown> = {}
            spec.fields.forEach((field, index) => {
              if (values[index] !== MISSING) out[field.key] = values[index]
            })
            if (extra !== undefined) out[extra] = 1
            return out
          })
    }
  })()

  return fc.oneof({ weight: 5, arbitrary: near }, { weight: 1, arbitrary: noiseArb(finiteOnly) })
}

/** A spec and several inputs to try it on. */
export const withInputs = (arb: fc.Arbitrary<Spec>, options: { finiteOnly?: boolean } = {}) =>
  arb.chain((spec) =>
    fc.array(valueArb(spec, options.finiteOnly), { minLength: 8, maxLength: 24 }).map((inputs) => ({ spec, inputs })),
  )

// ---------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Builds a Zod schema from a spec using the API Zod 3 and Zod 4 share, so `z` is either `import { z } from 'zod'` or `zod/v4`.
 */
export function buildZod(z: any, spec: Spec): any {
  switch (spec.t) {
    case 'string': {
      let schema = z.string()
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      if (spec.pattern) schema = schema.regex(PATTERNS[spec.pattern])
      return schema
    }
    case 'number': {
      let schema = z.number()
      if (spec.int) schema = schema.int()
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      if (spec.exMin !== undefined) schema = schema.gt(spec.exMin)
      if (spec.exMax !== undefined) schema = schema.lt(spec.exMax)
      if (spec.multipleOf !== undefined) schema = schema.multipleOf(spec.multipleOf)
      return schema
    }
    case 'boolean':
      return z.boolean()
    case 'enum':
      return z.enum(spec.values as [string, ...string[]])
    case 'literal':
      return z.literal(spec.value)
    case 'array': {
      let schema = z.array(buildZod(z, spec.item))
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      return schema
    }
    case 'object':
      return z.object(
        Object.fromEntries(
          spec.fields.map((field) => {
            const inner = buildZod(z, field.spec)
            return [field.key, field.optional ? inner.optional() : inner]
          }),
        ),
      )
    case 'nullable':
      return buildZod(z, spec.inner).nullable()
    case 'defaulted':
      return z[spec.base]().default(spec.value)
  }
}

/** The same spec as a struct schema. Exclusive bounds are not part of it: see {@link specArb}. */
export function buildStruct(spec: Spec): any {
  switch (spec.t) {
    case 'string': {
      let schema = s.string()
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      if (spec.pattern) schema = schema.regex(PATTERNS[spec.pattern])
      return schema
    }
    case 'number': {
      let schema: any = spec.int ? s.integer() : s.number()
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      if (spec.multipleOf !== undefined) schema = schema.step(spec.multipleOf)
      return schema
    }
    case 'boolean':
      return s.boolean()
    case 'enum':
      return s.enum(spec.values as [string, ...string[]])
    case 'literal':
      return s.literal(spec.value as any)
    case 'array': {
      let schema = s.array(buildStruct(spec.item))
      if (spec.min !== undefined) schema = schema.min(spec.min)
      if (spec.max !== undefined) schema = schema.max(spec.max)
      return schema
    }
    case 'object':
      return s.struct(
        Object.fromEntries(
          spec.fields.map((field) => {
            const inner = buildStruct(field.spec)
            return [field.key, field.optional ? inner.optional() : inner]
          }),
        ),
      )
    case 'nullable':
      return buildStruct(spec.inner).nullable()
    case 'defaulted':
      return s[spec.base]().default(spec.value)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------------------------------

export const show = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, v) =>
      typeof v === 'number' && !Number.isFinite(v)
        ? `<${v}>`
        : Object.is(v, -0)
          ? '<-0>'
          : v === undefined
            ? '<undefined>'
            : typeof v === 'bigint'
              ? `${v}n`
              : v,
  )

type Parsed = { success: boolean; data?: unknown }

/**
 * Throws, naming the spec and the input, when two schemas disagree on whether `input` is valid, or, if both accept it,
 * on what it parses to.
 */
export function expectSameVerdict(label: string, spec: Spec, input: unknown, expected: Parsed, actual: Parsed): void {
  if (expected.success !== actual.success) {
    throw new Error(
      `${label}: verdict differs\n  spec:     ${show(spec)}\n  input:    ${show(input)}\n  expected: ${expected.success ? 'valid' : 'invalid'}\n  actual:   ${actual.success ? 'valid' : 'invalid'}`,
    )
  }
  if (expected.success && show(expected.data) !== show(actual.data)) {
    throw new Error(
      `${label}: output differs\n  spec:     ${show(spec)}\n  input:    ${show(input)}\n  expected: ${show(expected.data)}\n  actual:   ${show(actual.data)}`,
    )
  }
}
