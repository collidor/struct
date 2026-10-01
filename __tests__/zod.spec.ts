import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { s, toZod, fromZod } from '../src'

describe('Zod Bridge Interoperability', () => {
  it('converts struct schema to Zod schema', () => {
    const struct = s.struct({
      title: s.string().min(2),
      count: s.integer().min(1),
      isActive: s.boolean().default(true),
    })

    const zodSchema = toZod(struct.descriptor)
    expect(zodSchema).toBeDefined()

    const validData = { title: 'TTRPG', count: 5 }
    const res = zodSchema.safeParse(validData)
    expect(res.success).toBe(true)
    const successData = (res as { data: { title: string; isActive: boolean } }).data
    expect(successData.title).toBe('TTRPG')
    expect(successData.isActive).toBe(true)

    const invalidRes = zodSchema.safeParse({ title: 'A', count: 0 })
    expect(invalidRes.success).toBe(false)
  })

  it('converts Zod schema into struct schema with fromZod()', () => {
    const zodObj = z.object({
      name: z.string().describe('Item name'),
      price: z.number(),
    })

    const struct = fromZod(zodObj)
    expect(struct.descriptor.kind).toBe('struct')

    const res = struct.parse({ name: 'Potion', price: 50 })
    expect(res).toEqual({ name: 'Potion', price: 50 })
  })

  it('propagates custom error messages for string formats (email, url, uuid, datetime)', () => {
    const emailSchema = s.string().email('Custom email message')
    const zodEmail = toZod(emailSchema.descriptor)
    const emailRes = zodEmail.safeParse('not-an-email')
    expect(emailRes.success).toBe(false)
    if (!emailRes.success) {
      expect(emailRes.error.issues[0]?.message).toBe('Custom email message')
    }

    const urlSchema = s.string().url('Custom URL message')
    const zodUrl = toZod(urlSchema.descriptor)
    const urlRes = zodUrl.safeParse('not-a-url')
    expect(urlRes.success).toBe(false)
    if (!urlRes.success) {
      expect(urlRes.error.issues[0]?.message).toBe('Custom URL message')
    }

    const uuidSchema = s.string().uuid('Custom UUID message')
    const zodUuid = toZod(uuidSchema.descriptor)
    const uuidRes = zodUuid.safeParse('not-a-uuid')
    expect(uuidRes.success).toBe(false)
    if (!uuidRes.success) {
      expect(uuidRes.error.issues[0]?.message).toBe('Custom UUID message')
    }

    const datetimeSchema = s.string().datetime('Custom datetime message')
    const zodDatetime = toZod(datetimeSchema.descriptor)
    const datetimeRes = zodDatetime.safeParse('not-a-datetime')
    expect(datetimeRes.success).toBe(false)
    if (!datetimeRes.success) {
      expect(datetimeRes.error.issues[0]?.message).toBe('Custom datetime message')
    }
  })

  it('preserves refinements and transforms in fromZod(ZodEffects)', () => {
    const refinedZod = z.string().refine((val) => val.startsWith('prefix_'), {
      message: 'Must start with prefix_',
    })
    const structRefined = fromZod(refinedZod)
    expect(structRefined.safeParse('prefix_valid').success).toBe(true)
    const failRefine = structRefined.safeParse('invalid')
    expect(failRefine.success).toBe(false)
    expect(failRefine.issues?.[0]?.message).toBe('Must start with prefix_')

    const transformedZod = z.string().transform((val) => val.toUpperCase())
    const structTransformed = fromZod(transformedZod)
    expect(structTransformed.parse('hello')).toBe('HELLO')
  })

  it('handles exclusive bounds for z.bigint().positive() and z.date() in fromZod', () => {
    const positiveBigInt = z.bigint().positive()
    const structBigInt = fromZod(positiveBigInt)
    expect(structBigInt.safeParse(1n).success).toBe(true)
    expect(structBigInt.safeParse(0n).success).toBe(false)
    expect(structBigInt.safeParse(-1n).success).toBe(false)

    const minDate = new Date('2026-01-01T00:00:00.000Z')
    const exclusiveDate = z.date()
    ;(exclusiveDate as any)._def.checks = [
      { kind: 'min', value: minDate.getTime(), inclusive: false },
    ]
    const structDate = fromZod(exclusiveDate)
    expect(structDate.safeParse(new Date('2026-01-02T00:00:00.000Z')).success).toBe(true)
    expect(structDate.safeParse(minDate).success).toBe(false)
  })
})

