// oxlint-disable typescript/no-explicit-any
import { describe, it, expect } from 'vitest'
import { fieldsOf } from './support/fields'
import { z } from 'zod/v4'
import { z as z3 } from 'zod'
import { fromZod, fromZodV3 } from '../src'

const ok = (schema: any, value: unknown) => schema.safeParse(value).success
const messageOf = (schema: any, value: unknown): string | undefined => schema.safeParse(value).issues?.[0]?.message

describe('fromZod (Zod 4)', () => {
  describe('the schema that broke the old reader', () => {
    // What a Compliance Cockpit module's command input looks like.
    const OpenThing = z.object({
      caseId: z.number().int().positive(),
      note: z.string().max(10).optional(),
      kind: z.enum(['a', 'b']),
      urgent: z.boolean().default(false),
    })
    const struct = fromZod(OpenThing)

    it('should convert a schema with .default() instead of throwing', () => {
      expect(() => fromZod(z.boolean().default(false))).not.toThrow()
      expect(struct.parse({ caseId: 3, kind: 'a' })).toMatchObject({ caseId: 3, kind: 'a', urgent: false })
    })

    it('should keep the constraints the old reader dropped', () => {
      expect(ok(struct, { caseId: 3, kind: 'a' })).toBe(true)
      expect(ok(struct, { caseId: -3, kind: 'a' })).toBe(false)
      expect(ok(struct, { caseId: 1.5, kind: 'a' })).toBe(false)
      expect(ok(struct, { caseId: 3, kind: 'a', note: 'far too long for this' })).toBe(false)
    })

    it('should keep the values of an enum instead of an empty list', () => {
      expect(ok(struct, { caseId: 3, kind: 'b' })).toBe(true)
      expect(ok(struct, { caseId: 3, kind: 'z' })).toBe(false)
      const kind = fieldsOf(struct).find((field) => field.key === 'kind')
      expect(kind?.widgetProps['options']).toStrictEqual([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ])
    })
  })

  describe('strings', () => {
    it('should carry custom messages', () => {
      expect(messageOf(fromZod(z.string().min(2, 'Too short')), 'a')).toBe('Too short')
      expect(messageOf(fromZod(z.string().max(2, 'Too long')), 'abc')).toBe('Too long')
      expect(messageOf(fromZod(z.string().length(2, 'Exactly two')), 'abc')).toBe('Exactly two')
    })

    it.each([
      ['z.string().email()', z.string().email('bad email'), 'a@b.co', 'nope'],
      ['z.email()', z.email(), 'a@b.co', 'nope'],
      ['z.string().url()', z.string().url(), 'https://a.co', 'nope'],
      ['z.string().uuid()', z.string().uuid(), '123e4567-e89b-42d3-a456-426614174000', 'nope'],
      ['z.string().regex()', z.string().regex(/^a+$/), 'aaa', 'abc'],
      ['z.string().startsWith()', z.string().startsWith('pre_'), 'pre_x', 'x_pre'],
    ])('should keep the format of %s', (_label, schema, good, bad) => {
      const struct = fromZod(schema as any)
      expect(ok(struct, good)).toBe(true)
      expect(ok(struct, bad)).toBe(false)
    })

    it('should apply trim, toLowerCase and toUpperCase', () => {
      expect(fromZod(z.string().trim()).parse('  a  ')).toBe('a')
      expect(fromZod(z.string().toLowerCase()).parse('AbC')).toBe('abc')
      expect(fromZod(z.string().toUpperCase()).parse('AbC')).toBe('ABC')
    })

    it('should coerce when asked to', () => {
      expect(fromZod(z.coerce.string()).descriptor).toMatchObject({ coerce: true })
      expect(fromZod(z.coerce.string()).parse(12)).toBe('12')
    })
  })

  describe('numbers', () => {
    it('should keep inclusive and exclusive bounds', () => {
      const between = fromZod(z.number().gt(1).lte(5))
      expect([1, 1.5, 5, 5.5].map((n) => ok(between, n))).toStrictEqual([false, true, true, false])
      expect([0, 1, -1].map((n) => ok(fromZod(z.number().positive()), n))).toStrictEqual([false, true, false])
      expect([0, 1, -1].map((n) => ok(fromZod(z.number().negative()), n))).toStrictEqual([false, false, true])
      expect([0, 1, -1].map((n) => ok(fromZod(z.number().nonnegative()), n))).toStrictEqual([true, true, false])
    })

    it('should turn an exclusive integer bound into a bound a form can show', () => {
      const field = fieldsOf(fromZod(z.object({ n: z.int().gt(4).lt(9) })))[0]
      expect(field?.widgetProps).toMatchObject({ min: 5, max: 8 })
    })

    it('should read integers from .int(), z.int(), z.int32() and z.uint32()', () => {
      for (const schema of [z.number().int(), z.int(), z.int32(), z.uint32()]) {
        expect(fromZod(schema).descriptor.kind).toBe('integer')
      }
      expect(ok(fromZod(z.uint32()), -1)).toBe(false)
      expect(ok(fromZod(z.int32()), 2 ** 31)).toBe(false)
    })

    it('should keep multipleOf', () => {
      const struct = fromZod(z.number().multipleOf(5))
      expect([10, 12].map((n) => ok(struct, n))).toStrictEqual([true, false])
    })

    it('should keep the strictest of several bounds', () => {
      expect(ok(fromZod(z.number().min(5).min(1)), 3)).toBe(false)
      expect(ok(fromZod(z.number().max(2).max(9)), 5)).toBe(false)
      expect(ok(fromZod(z.number().min(0.5).gt(-0.5).int()), 0)).toBe(false)
      expect(ok(fromZod(z.string().min(5).min(1)), 'abc')).toBe(false)
    })
  })

  describe('other primitives', () => {
    it('should read bigint bounds', () => {
      const struct = fromZod(z.bigint().positive())
      expect([1n, 0n, -1n].map((n) => ok(struct, n))).toStrictEqual([true, false, false])
      expect(ok(fromZod(z.bigint().min(5n).max(9n)), 7n)).toBe(true)
      expect(ok(fromZod(z.bigint().multipleOf(2n)), 3n)).toBe(false)
    })

    it('should read date bounds, inclusive and exclusive', () => {
      const from = new Date('2026-01-01T00:00:00.000Z')
      expect(ok(fromZod(z.date().min(from)), from)).toBe(true)
      // Zod 4 spells an exclusive date bound as a standalone check.
      expect(ok(fromZod(z.date().check(z.gt(from))), from)).toBe(false)
      expect(ok(fromZod(z.date().check(z.lt(from))), from)).toBe(false)
      expect(ok(fromZod(z.date().check(z.gt(from))), new Date(from.getTime() + 1))).toBe(true)
    })

    it('should read null, boolean and literals', () => {
      expect(ok(fromZod(z.null()), null)).toBe(true)
      expect(ok(fromZod(z.boolean()), 'yes')).toBe(false)
      expect(ok(fromZod(z.literal('a')), 'b')).toBe(false)
      const multi = fromZod(z.literal(['a', 'b']))
      expect([ok(multi, 'a'), ok(multi, 'b'), ok(multi, 'c')]).toStrictEqual([true, true, false])
    })

    it('should read enums from an object and from a numeric enum without its reverse mapping', () => {
      expect(fromZod(z.enum({ X: 'x', Y: 'y' })).descriptor).toMatchObject({ kind: 'enum', values: ['x', 'y'] })
      const Direction = { Up: 0, Down: 1, 0: 'Up', 1: 'Down' } as const
      expect(fromZod(z.nativeEnum(Direction)).descriptor).toMatchObject({ kind: 'enum', values: [0, 1] })
    })
  })

  describe('containers', () => {
    it('should read array length checks', () => {
      const struct = fromZod(z.array(z.string()).min(1).max(2))
      expect([[], ['a'], ['a', 'b', 'c']].map((v) => ok(struct, v))).toStrictEqual([false, true, false])
      expect(ok(fromZod(z.array(z.string()).length(2)), ['a'])).toBe(false)
    })

    it('should read tuples, records and unions', () => {
      expect(ok(fromZod(z.tuple([z.string(), z.number()])), ['a', 1])).toBe(true)
      expect(ok(fromZod(z.record(z.string(), z.number())), { a: 'x' })).toBe(false)
      const union = fromZod(z.union([z.string(), z.number()]))
      expect([ok(union, 'a'), ok(union, 1), ok(union, true)]).toStrictEqual([true, true, false])
      const tagged = fromZod(z.discriminatedUnion('k', [z.object({ k: z.literal('a') }), z.object({ k: z.literal('b') })]))
      expect([ok(tagged, { k: 'a' }), ok(tagged, { k: 'c' })]).toStrictEqual([true, false])
    })

    it('should tell strict, passthrough and plain objects apart', () => {
      const input = { a: 'x', extra: 1 }
      expect(ok(fromZod(z.strictObject({ a: z.string() })), input)).toBe(false)
      expect(fromZod(z.looseObject({ a: z.string() })).parse(input)).toStrictEqual(input)
      expect(fromZod(z.object({ a: z.string() })).parse(input)).toStrictEqual({ a: 'x' })
    })

    it('should merge the fields of an intersection of objects', () => {
      const struct = fromZod(z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })))
      expect([ok(struct, { a: 'x', b: 1 }), ok(struct, { a: 'x' }), ok(struct, { b: 1 })]).toStrictEqual([true, false, false])
    })
  })

  describe('wrappers', () => {
    it('should read optional, nullable and nullish', () => {
      expect([undefined, 'a', null].map((v) => ok(fromZod(z.object({ a: z.string().optional() })), { a: v }))).toStrictEqual([true, true, false])
      expect([undefined, 'a', null].map((v) => ok(fromZod(z.object({ a: z.string().nullable() })), { a: v }))).toStrictEqual([false, true, true])
      expect([undefined, 'a', null].map((v) => ok(fromZod(z.object({ a: z.string().nullish() })), { a: v }))).toStrictEqual([true, true, true])
    })

    it('should read default and prefault as the struct default', () => {
      expect(fromZod(z.string().default('x')).descriptor.default).toBe('x')
      expect(fromZod(z.string().prefault('y')).descriptor.default).toBe('y')
      expect(fromZod(z.date().default(() => new Date(0))).descriptor.default).toStrictEqual(new Date(0))
    })

    it('should unwrap catch, readonly, brand and nonoptional', () => {
      expect(ok(fromZod(z.string().readonly()), 1)).toBe(false)
      expect(ok(fromZod(z.string().brand('B')), 'a')).toBe(true)
      expect(ok(fromZod(z.string().optional().nonoptional()), undefined)).toBe(false)
      expect(ok(fromZod(z.string().catch('x')), 'a')).toBe(true)
    })

    it('should carry the description', () => {
      expect(fromZod(z.string().describe('Item name')).descriptor.description).toBe('Item name')
    })
  })

  describe('refinements and transforms', () => {
    it('should read a refine with its message', () => {
      const struct = fromZod(z.string().refine((v) => v.startsWith('p'), { message: 'Must start with p' }))
      expect(ok(struct, 'pa')).toBe(true)
      expect(messageOf(struct, 'a')).toBe('Must start with p')
    })

    it('should read the path of a refine on an object', () => {
      const struct = fromZod(
        z.object({ a: z.string(), b: z.string() }).refine((v) => v.a === v.b, { message: 'Must match', path: ['b'] }),
      )
      expect(struct.safeParse({ a: 'x', b: 'y' }).issues?.[0]).toMatchObject({ message: 'Must match', path: ['b'] })
    })

    it('should run a superRefine and report the issues it adds', () => {
      const struct = fromZod(
        z.object({ a: z.string() }).superRefine((v, ctx) => {
          if (v.a !== 'ok') ctx.addIssue({ code: 'custom', message: 'not ok', path: ['a'] })
        }),
      )
      expect(ok(struct, { a: 'ok' })).toBe(true)
      expect(struct.safeParse({ a: 'bad' }).issues?.[0]).toMatchObject({ message: 'not ok', path: ['a'] })
    })

    it('should await an async refine', async () => {
      const struct = fromZod(z.string().refine(async (v) => v === 'ok', 'async no'))
      expect((await struct.safeParseAsync('ok')).success).toBe(true)
      expect((await struct.safeParseAsync('bad')).success).toBe(false)
    })

    it('should read transform, preprocess and pipe', () => {
      expect(fromZod(z.string().transform((v) => v.toUpperCase())).parse('hi')).toBe('HI')
      expect(fromZod(z.preprocess((v) => String(v), z.string().min(2))).parse(12)).toBe('12')
      expect(ok(fromZod(z.preprocess((v) => String(v), z.string().min(2))), 1)).toBe(false)
      expect(ok(fromZod(z.string().pipe(z.string().min(2))), 'a')).toBe(false)
    })
  })

  describe('recursion', () => {
    it('should stop at a schema that refers to itself instead of looping', () => {
      type Node = { name: string; children: Node[] }
      const Tree: z.ZodType<Node> = z.object({ name: z.string(), children: z.lazy(() => z.array(Tree)) })
      const struct = fromZod(Tree)

      expect(ok(struct, { name: 'root', children: [{ name: 'leaf', children: [] }] })).toBe(true)
      expect(ok(struct, { name: 1, children: [] })).toBe(false)
    })
  })

  describe('the two readers', () => {
    it('should send a Zod 3 schema to fromZodV3 instead of reading it wrongly', () => {
      expect(() => fromZod(z3.string() as any)).toThrow(/fromZodV3/)
      expect(ok(fromZodV3(z3.string().min(2)), 'a')).toBe(false)
    })

    it('should send a Zod 4 schema to fromZod instead of reading it wrongly', () => {
      expect(() => fromZodV3(z.string() as any)).toThrow(/fromZod\(\)/)
    })

    it('should refuse something that is no schema at all', () => {
      expect(() => fromZod({} as any)).toThrow(TypeError)
      expect(() => fromZod(null as any)).toThrow(TypeError)
    })
  })
})
