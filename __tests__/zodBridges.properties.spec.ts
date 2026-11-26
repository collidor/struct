// oxlint-disable typescript/no-explicit-any
import { describe, it, vi } from 'vitest'
import { fieldsOf } from './support/fields'
import fc from 'fast-check'
import { z as z3 } from 'zod'
import { z as z4 } from 'zod/v4'
import { fromZod, fromZodV3, fromJSONSchema, toJSONSchema, toZod, s } from '../src'
import {
  buildStruct,
  buildZod,
  expectSameVerdict,
  objectSpecArb,
  show,
  specArb,
  withInputs,
} from './support/schemaSpecs'

/**
 * Differential properties: a converter is correct when the schema it returns accepts and rejects the same values as the schema it
 * read, and produces the same output for the values it accepts. Specs and inputs are generated; a failure names both.
 */
/** `FC_RUNS=5000 npx vitest run __tests__/zodBridges.properties.spec.ts` for a long soak. */
const runs = { numRuns: Number(process.env['FC_RUNS'] ?? 400) }
// A long soak is slower than vitest's default 5s per test.
vi.setConfig({ testTimeout: Math.max(5_000, runs.numRuns * 40) })

describe('fromZod (Zod 4) agrees with Zod 4', () => {
  it('should accept and reject the same values, with the same output', () => {
    fc.assert(
      fc.property(withInputs(specArb()), ({ spec, inputs }) => {
        const zod = buildZod(z4, spec)
        const struct = fromZod(zod)

        for (const input of inputs) {
          expectSameVerdict('fromZod', spec, input, zod.safeParse(input), struct.safeParse(input))
        }
      }),
      runs,
    )
  })

  it('should refuse a Zod 3 schema instead of silently dropping its constraints', () => {
    fc.assert(
      fc.property(specArb(), (spec) => {
        const zod3 = buildZod(z3, spec)
        let threw = false
        try {
          fromZod(zod3)
        } catch (error) {
          threw = error instanceof TypeError && String(error.message).includes('fromZodV3')
        }
        if (!threw) throw new Error(`fromZod accepted a Zod 3 schema for ${show(spec)}`)
      }),
      runs,
    )
  })
})

describe('fromZodV3 (Zod 3) agrees with Zod 3', () => {
  it('should accept and reject the same values, with the same output', () => {
    fc.assert(
      // Zod 3 accepts +-Infinity as a number and the struct does not, so those are left out here.
      fc.property(withInputs(specArb(), { finiteOnly: true }), ({ spec, inputs }) => {
        const zod = buildZod(z3, spec)
        const struct = fromZodV3(zod)

        for (const input of inputs) {
          expectSameVerdict('fromZodV3', spec, input, zod.safeParse(input), struct.safeParse(input))
        }
      }),
      runs,
    )
  })

  it('should refuse a Zod 4 schema instead of silently dropping its constraints', () => {
    fc.assert(
      fc.property(specArb(), (spec) => {
        const zod4 = buildZod(z4, spec)
        let threw = false
        try {
          fromZodV3(zod4)
        } catch (error) {
          threw = error instanceof TypeError && String(error.message).includes('fromZod()')
        }
        if (!threw) throw new Error(`fromZodV3 accepted a Zod 4 schema for ${show(spec)}`)
      }),
      runs,
    )
  })
})

describe('fromJSONSchema agrees with the Zod 4 schema the JSON Schema was written from', () => {
  it('should accept and reject the same values, with the same output', () => {
    fc.assert(
      fc.property(withInputs(objectSpecArb()), ({ spec, inputs }) => {
        const zod = buildZod(z4, spec)
        // What a module hands over: the schema as the input of a command, without `$schema`.
        const json = z4.toJSONSchema(zod, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>
        delete json['$schema']
        const struct = fromJSONSchema(json)

        for (const input of inputs) {
          expectSameVerdict(
            `fromJSONSchema(${show(json)})`,
            spec,
            input,
            zod.safeParse(input),
            struct.safeParse(input),
          )
        }
      }),
      runs,
    )
  })
})

describe('struct schemas survive the trip out and back', () => {
  it('should validate the same through toZod', () => {
    fc.assert(
      fc.property(withInputs(specArb({ exclusive: false })), ({ spec, inputs }) => {
        const struct = buildStruct(spec)
        const zod = toZod(struct)

        for (const input of inputs) {
          expectSameVerdict('toZod', spec, input, struct.safeParse(input), zod.safeParse(input))
        }
      }),
      runs,
    )
  })

  it('should validate the same through toJSONSchema and fromJSONSchema', () => {
    fc.assert(
      fc.property(withInputs(objectSpecArb({ exclusive: false })), ({ spec, inputs }) => {
        const struct = buildStruct(spec)
        const back = fromJSONSchema(toJSONSchema(struct) as Record<string, unknown>)

        for (const input of inputs) {
          expectSameVerdict('JSON Schema roundtrip', spec, input, struct.safeParse(input), back.safeParse(input))
        }
      }),
      runs,
    )
  })
})

describe('several bounds on one schema', () => {
  const op = fc.constantFrom('min', 'max', 'gt', 'lt')
  const numberBounds = fc.array(fc.record({ op, value: fc.integer({ min: -10, max: 10 }) }), { minLength: 2, maxLength: 5 })
  const numbers = fc.array(fc.oneof(fc.integer({ min: -15, max: 15 }), fc.integer({ min: -30, max: 30 }).map((n) => n / 2)), { minLength: 6, maxLength: 20 })
  const lengths = fc.array(fc.nat(12), { minLength: 6, maxLength: 20 })

  const chain = (z: any, bounds: { op: string; value: number }[], base: any) =>
    bounds.reduce((schema, bound) => schema[bound.op](bound.value), base)

  it('should keep every bound written, in any order, as Zod does', () => {
    fc.assert(
      fc.property(numberBounds, numbers, (bounds, inputs) => {
        const spec = { t: 'number', bounds } as any
        const zod4 = chain(z4, bounds, z4.number())
        const zod3 = chain(z3, bounds, z3.number())
        const json = z4.toJSONSchema(zod4, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>
        const readers = [
          ['fromZod', fromZod(zod4), zod4],
          ['fromZodV3', fromZodV3(zod3), zod3],
          ['fromJSONSchema', fromJSONSchema(json), zod4],
        ] as const

        for (const [label, struct, zod] of readers) {
          for (const input of inputs) expectSameVerdict(label, spec, input, zod.safeParse(input), struct.safeParse(input))
        }
      }),
      runs,
    )
  })

  it('should keep the strictest string length, however many .min() or .max() calls there are', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(8), { minLength: 2, maxLength: 4 }), fc.constantFrom('min', 'max'), lengths, (values, which, sizes) => {
        const bounds = values.map((value) => ({ op: which, value }))
        const spec = { t: 'string', bounds } as any
        const zod4 = chain(z4, bounds, z4.string())
        const zod3 = chain(z3, bounds, z3.string())

        for (const [label, struct, zod] of [['fromZod', fromZod(zod4), zod4], ['fromZodV3', fromZodV3(zod3), zod3]] as const) {
          for (const size of sizes) {
            const input = 'x'.repeat(size)
            expectSameVerdict(label, spec, input, zod.safeParse(input), struct.safeParse(input))
          }
        }
      }),
      runs,
    )
  })
})

describe('the struct bugs, as properties', () => {
  const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 })

  it('should treat exclusiveMinimum and exclusiveMaximum as strict bounds in fromJSONSchema', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: -50, max: 50 }), finite),
        fc.oneof(fc.integer({ min: -60, max: 60 }), finite),
        fc.constantFrom('number', 'integer'),
        (bound, x, type) => {
          const above = fromJSONSchema({ type, exclusiveMinimum: bound })
          const below = fromJSONSchema({ type, exclusiveMaximum: bound })
          const isInteger = Number.isInteger(x)
          const typeOk = type === 'number' || isInteger

          if (above.safeParse(x).success !== (typeOk && x > bound)) {
            throw new Error(`exclusiveMinimum ${bound} on ${type}: ${x} should be ${typeOk && x > bound ? 'valid' : 'invalid'}`)
          }
          if (below.safeParse(x).success !== (typeOk && x < bound)) {
            throw new Error(`exclusiveMaximum ${bound} on ${type}: ${x} should be ${typeOk && x < bound ? 'valid' : 'invalid'}`)
          }
        },
      ),
      runs,
    )
  })

  it('should list every value of an enum as a form option, in order, however the enum was made', () => {
    const values = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 8 })

    fc.assert(
      fc.property(values, (enumValues) => {
        const fromStruct = s.struct({ pick: s.enum(enumValues as [string, ...string[]]) })
        const fromJson = fromJSONSchema({
          type: 'object',
          properties: { pick: { type: 'string', enum: enumValues } },
          required: ['pick'],
        })

        for (const [label, schema] of [['s.enum', fromStruct], ['fromJSONSchema', fromJson]] as const) {
          const options = (fieldsOf(schema)[0]?.widgetProps['options'] ?? []) as { value: string }[]
          if (show(options.map(({ value }) => value)) !== show(enumValues)) {
            throw new Error(`${label}: options ${show(options)} do not list ${show(enumValues)}`)
          }
        }
      }),
      runs,
    )
  })
})
