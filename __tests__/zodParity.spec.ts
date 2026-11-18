import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { s, toJSONSchema, toZod, generateDefaultValue, fromZod } from '../src'

/** Where the struct deliberately behaves as Zod 4 does. */
describe('numbers are finite', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('should reject %s', (value) => {
    expect(s.number().safeParse(value).success).toBe(false)
    expect(s.integer().safeParse(value).success).toBe(false)
    expect(z.number().safeParse(value).success).toBe(false)
  })

  it('should say what it received', () => {
    expect(s.number().safeParse(Number.POSITIVE_INFINITY).issues?.[0]?.message).toBe('Expected number, received Infinity')
    expect(s.number().safeParse('1').issues?.[0]?.message).toBe('Expected number, received string')
  })

  it('should reject Infinity that a coercion produces', () => {
    expect(s.coerce.number().safeParse('Infinity').success).toBe(false)
    expect(s.coerce.number().safeParse('12').success).toBe(true)
  })

  it('should still accept the extremes that are finite', () => {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -0, 0]) {
      expect(s.number().safeParse(value).success).toBe(true)
    }
  })

  it('should stay finite through toZod', () => {
    expect(toZod(s.number()).safeParse(Number.POSITIVE_INFINITY).success).toBe(false)
    expect(toZod(s.integer()).safeParse(Number.NEGATIVE_INFINITY).success).toBe(false)
    expect(toZod(s.number().min(1)).safeParse(5).success).toBe(true)
  })
})

describe('an optional field that was not given is not in the output', () => {
  const schema = s.struct({ name: s.string(), nick: s.string().optional(), tags: s.array(s.string()).optional() })

  it('should leave the key out', () => {
    const result = schema.parse({ name: 'a' })
    expect(Object.keys(result)).toStrictEqual(['name'])
    expect(result).toStrictEqual({ name: 'a' })
  })

  it('should keep a key that was given as undefined, as Zod does', () => {
    const given = { name: 'a', nick: undefined }
    const result = schema.parse(given)
    expect('nick' in result).toBe(true)
    expect(z.object({ name: z.string(), nick: z.string().optional() }).parse(given)).toHaveProperty('nick', undefined)
    expect('nick' in z.object({ name: z.string(), nick: z.string().optional() }).parse({ name: 'a' })).toBe(false)
  })

  it('should keep a value that was given and fill a default', () => {
    expect(schema.parse({ name: 'a', nick: 'n' })).toStrictEqual({ name: 'a', nick: 'n' })
    expect(s.struct({ on: s.boolean().default(true) }).parse({})).toStrictEqual({ on: true })
  })

  it('should leave the key out when validating asynchronously too', async () => {
    const result = await schema.parseAsync({ name: 'a' })
    expect(Object.keys(result)).toStrictEqual(['name'])
  })

  it('should leave the key out in nested structs and arrays of structs', () => {
    const nested = s.struct({ inner: s.struct({ a: s.string().optional() }), list: s.array(s.struct({ b: s.string().optional() })) })
    expect(nested.parse({ inner: {}, list: [{}, { b: 'x' }] })).toStrictEqual({ inner: {}, list: [{}, { b: 'x' }] })
  })

  it('should give the same output as Zod for what a converter reads', () => {
    const zodSchema = z.object({ a: z.string(), b: z.number().optional(), c: z.string().nullable().optional() })
    const struct = fromZod(zodSchema)
    for (const input of [{ a: 'x' }, { a: 'x', b: 1 }, { a: 'x', c: null }, { a: 'x', b: undefined }]) {
      expect(struct.parse(input)).toStrictEqual(zodSchema.parse(input))
    }
  })
})

describe('a literal has no default of its own', () => {
  it('should reject a missing value, as z.literal does', () => {
    expect(s.literal('x').safeParse(undefined).success).toBe(false)
    expect(z.literal('x').safeParse(undefined).success).toBe(false)
  })

  it('should make a required literal field required', () => {
    const schema = s.struct({ kind: s.literal('user'), name: s.string() })
    expect(schema.safeParse({ name: 'a' }).issues?.[0]).toMatchObject({ path: ['kind'] })
    expect(schema.safeParse({ kind: 'user', name: 'a' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('should leave an optional literal out when it is absent, instead of filling it in', () => {
    const schema = s.struct({ kind: s.literal('user').optional() })
    expect(schema.parse({})).toStrictEqual({})
    expect(schema.parse({ kind: 'user' })).toStrictEqual({ kind: 'user' })
    expect(schema.safeParse({ kind: 'admin' }).success).toBe(false)
  })

  it('should fill the value in when it is asked for, with .default()', () => {
    expect(s.struct({ kind: s.literal('user').default('user') }).parse({})).toStrictEqual({ kind: 'user' })
  })

  it('should carry no default in its descriptor or its JSON Schema', () => {
    expect(s.literal('x').descriptor.default).toBeUndefined()
    expect(toJSONSchema(s.literal('x'))).toStrictEqual({ const: 'x' })
  })

  it('should still start a form on its value', () => {
    expect(generateDefaultValue(s.struct({ kind: s.literal('user'), n: s.number() }).descriptor)).toStrictEqual({ kind: 'user', n: 0 })
  })

  it('should return the value it was given, as Zod does: -0 is a valid 0 and stays -0', () => {
    expect(Object.is(s.literal(0).parse(-0), -0)).toBe(true)
    expect(Object.is(z.literal(0).parse(-0), -0)).toBe(true)
    expect(s.literal('x').parse('x')).toBe('x')
  })

  it('should agree with Zod through every reader', () => {
    const zodSchema = z.object({ kind: z.literal('user') })
    const struct = fromZod(zodSchema)
    expect(struct.safeParse({}).success).toBe(zodSchema.safeParse({}).success)
    expect(struct.safeParse({ kind: 'user' }).success).toBe(true)
  })
})
