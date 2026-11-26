import { describe, it, expect } from 'vitest'
import { fieldsOf } from './support/fields'
import { z } from 'zod'
import { z as z4 } from 'zod/v4'
import { s, fromJSONSchema, toJSONSchema, fromZodV3 } from '../src'

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success

describe('fromJSONSchema: exclusive bounds', () => {
  it('should treat the numeric exclusiveMinimum and exclusiveMaximum of 2020-12 as strict', () => {
    const above = fromJSONSchema({ type: 'number', exclusiveMinimum: 0 })
    expect([-1, 0, 0.1].map((n) => ok(above, n))).toStrictEqual([false, false, true])
    const below = fromJSONSchema({ type: 'number', exclusiveMaximum: 10 })
    expect([9.9, 10, 11].map((n) => ok(below, n))).toStrictEqual([true, false, false])
  })

  it('should make an exclusive integer bound a bound a form can show', () => {
    const field = fieldsOf(fromJSONSchema({ type: 'object', properties: { n: { type: 'integer', exclusiveMinimum: 4, exclusiveMaximum: 9 } } }))[0]
    expect(field?.widgetProps).toMatchObject({ min: 5, max: 8 })
  })

  it('should read the boolean form of draft 4, where the flag modifies minimum / maximum', () => {
    const schema = fromJSONSchema({ type: 'number', minimum: 3, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: true })
    expect([3, 4, 9, 8].map((n) => ok(schema, n))).toStrictEqual([false, true, false, true])
  })

  it('should keep the strictest of minimum and exclusiveMinimum', () => {
    const schema = fromJSONSchema({ type: 'integer', minimum: 5, exclusiveMinimum: 1 })
    expect([3, 5, 6].map((n) => ok(schema, n))).toStrictEqual([false, true, true])
  })

  it('should read what Zod 4 writes for .positive()', () => {
    const json = z4.toJSONSchema(z4.object({ id: z4.number().int().positive() }), { io: 'input' }) as Record<string, unknown>
    expect(ok(fromJSONSchema(json), { id: 0 })).toBe(false)
    expect(ok(fromJSONSchema(json), { id: 1 })).toBe(true)
  })
})

describe('getFormFields: enum options', () => {
  it('should list the options of an enum that names its own widget, as every enum does', () => {
    const field = fieldsOf(s.struct({ kind: s.enum(['email', 'phone']) }))[0]
    expect(field?.widget).toBe('select')
    expect(field?.widgetProps['options']).toStrictEqual([
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
    ])
  })

  it('should keep options a field supplies itself', () => {
    const options = [{ value: 'e', label: 'Custom' }]
    const field = fieldsOf(s.struct({ kind: s.enum(['email']).meta({ widget: 'select', widgetProps: { options } }) }))[0]
    expect(field?.widgetProps['options']).toStrictEqual(options)
  })

  it('should list the options of an array of enums', () => {
    const field = fieldsOf(s.struct({ tags: s.array(s.enum(['a', 'b'])) }))[0]
    expect(field?.widget).toBe('multiselect')
    expect((field?.widgetProps['options'] as { value: string }[]).map(({ value }) => value)).toStrictEqual(['a', 'b'])
  })
})

describe('toJSONSchema: nullable enums, literals and unions', () => {
  it.each([
    ['enum', s.enum(['a', 'b']).nullable()],
    ['literal', s.literal('x').nullable()],
    ['union', s.oneOf([s.string(), s.number()]).nullable()],
  ])('should say a nullable %s may be null, and read that back', (_label, nullable) => {
    const json = toJSONSchema(nullable as never)
    expect(json['anyOf']).toContainEqual({ type: 'null' })
    expect(ok(fromJSONSchema(json), null)).toBe(true)
  })

  it('should leave a non-nullable enum as it was', () => {
    expect(toJSONSchema(s.enum(['a', 'b']))).not.toHaveProperty('anyOf')
  })
})

describe('fromZodV3: several bounds and an outer optional', () => {
  it('should keep the strictest of several .min() and .max() calls', () => {
    expect(ok(fromZodV3(z.string().min(5).min(1)), 'abc')).toBe(false)
    expect(ok(fromZodV3(z.string().max(2).max(9)), 'abcd')).toBe(false)
    expect(ok(fromZodV3(z.number().min(5).min(1)), 3)).toBe(false)
    expect(ok(fromZodV3(z.number().max(2).max(9)), 5)).toBe(false)
  })

  it('should let an outer .optional() win over an inner .default(), as Zod 3 does', () => {
    const struct = fromZodV3(z.object({ a: z.boolean().default(false).optional() }))
    expect(struct.parse({})['a']).toBeUndefined()
    // The other order is the one that fills the default in.
    expect(fromZodV3(z.object({ a: z.boolean().optional().default(false) })).parse({})).toMatchObject({ a: false })
  })
})
