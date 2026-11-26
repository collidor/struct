import { describe, expect, expectTypeOf, it } from 'vitest'
import { s } from '../src'
import { f } from '../src/form'
import type { Infer, InferInput } from '../src/types/inference'

// This file is type-checked by `pnpm test:types` (tsconfig.types.json), which is where the
// compile-time half of these assertions is enforced; vitest only runs the runtime half.

describe('constraints after a modifier', () => {
  it('keeps the string methods and widens the type', () => {
    const name = s.string().optional().min(2).max(5)
    expectTypeOf<Infer<typeof name>>().toEqualTypeOf<string | undefined>()
    expectTypeOf<InferInput<typeof name>>().toEqualTypeOf<string | undefined>()
    expect(name.safeParse(undefined).success).toBe(true)
    expect(name.safeParse('ab').success).toBe(true)
    expect(name.safeParse('a').success).toBe(false) // the constraint still applies to a given value
    expect(name.safeParse('abcdef').success).toBe(false)
  })

  it('works after nullable, nullish and default, in any mix', () => {
    const a = s.string().nullable().email()
    const b = s.string().nullish().trim().min(1)
    const c = s.string().default('hi').min(2)
    const d = s.string().optional().nullable().max(3)
    expectTypeOf<Infer<typeof a>>().toEqualTypeOf<string | null>()
    expectTypeOf<Infer<typeof b>>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<Infer<typeof c>>().toEqualTypeOf<string>()
    expectTypeOf<InferInput<typeof c>>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Infer<typeof d>>().toEqualTypeOf<string | null | undefined>()
    expect(a.safeParse(null).success).toBe(true)
    expect(a.safeParse('nope').success).toBe(false)
    expect(b.safeParse(' x ').data).toBe('x')
    expect(c.parse(undefined)).toBe('hi')
    expect(d.safeParse(null).success && d.safeParse(undefined).success).toBe(true)
  })

  it('covers numbers, dates, bigints and arrays', () => {
    const n = s.number().optional().min(0).max(10)
    const dt = s.date().nullable().min(new Date(0))
    const bi = s.bigint().optional().min(1n)
    const arr = s.array(s.string()).optional().nonempty().max(3)
    const arrDefault = s.array(s.number()).default([]).min(0)
    expectTypeOf<Infer<typeof n>>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Infer<typeof dt>>().toEqualTypeOf<Date | null>()
    expectTypeOf<Infer<typeof bi>>().toEqualTypeOf<bigint | undefined>()
    expectTypeOf<Infer<typeof arr>>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<Infer<typeof arrDefault>>().toEqualTypeOf<number[]>()
    expect(n.safeParse(11).success).toBe(false)
    expect(n.safeParse(undefined).success).toBe(true)
    expect(arr.safeParse([]).success).toBe(false) // nonempty applies to a given array
    expect(arr.safeParse(undefined).success).toBe(true)
    expect(arrDefault.parse(undefined)).toEqual([])
  })

  it('keeps struct and form inference right when the constrained field is optional', () => {
    const shape = f.struct({ nick: s.string().optional().min(2), age: s.number().default(1).min(0) })
    type Out = Infer<typeof shape>
    type In = InferInput<typeof shape>
    expectTypeOf<Out>().toEqualTypeOf<{ nick?: string | undefined; age: number }>()
    expectTypeOf<In>().toEqualTypeOf<{ nick?: string | undefined; age?: number | undefined }>()
    expect(shape.safeParse({ age: 5 }).success).toBe(true)
    expect(shape.safeParse({ nick: 'x' }).success).toBe(false)
  })

  it('the modifier still sticks at runtime, whatever the order', () => {
    expect(s.string().min(2).optional().safeParse(undefined).success).toBe(true)
    expect(s.string().optional().min(2).safeParse(undefined).success).toBe(true)
    expect(s.string().min(2).optional().safeParse('a').success).toBe(false)
  })

  it('does not offer methods that would be unsound after a modifier', () => {
    const optionalStruct = s.struct({ a: s.string() }).optional()
    // `extend`/`pick`/`omit` build a new struct, which would silently drop the optional output type
    // @ts-expect-error not available on an optional struct
    optionalStruct.extend
    // @ts-expect-error not available on an optional struct
    optionalStruct.strict
    const plain = s.string()
    // @ts-expect-error a string has no array methods
    plain.optional().nonempty2
    expect(true).toBe(true)
  })
})
