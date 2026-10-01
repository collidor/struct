import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { s, toJSONSchema, toZod, fromZod } from '../src/index'

describe('Ticket 003: Primitives Date, BigInt, and Coercion', () => {
  describe('s.date()', () => {
    it('validates genuine Date instances and rejects invalid dates', () => {
      const schema = s.date()
      const now = new Date()

      const validRes = schema.safeParse(now)
      expect(validRes.success).toBe(true)
      expect(validRes.data).toBe(now)

      const invalidDateRes = schema.safeParse(new Date('invalid-date-string'))
      expect(invalidDateRes.success).toBe(false)
      expect(invalidDateRes.issues?.[0]?.code).toBe('invalid_date')

      const stringRes = schema.safeParse('2026-10-01')
      expect(stringRes.success).toBe(false)
      expect(stringRes.issues?.[0]?.code).toBe('invalid_date')
    })

    it('enforces min and max date constraints with custom messages', () => {
      const min = new Date('2026-01-01T00:00:00Z')
      const max = new Date('2026-12-31T23:59:59Z')
      const schema = s.date().min(min, 'Date is too early').max(max, 'Date is too late')

      const ok = schema.safeParse(new Date('2026-06-15T12:00:00Z'))
      expect(ok.success).toBe(true)

      const tooEarly = schema.safeParse(new Date('2025-12-31T23:59:59Z'))
      expect(tooEarly.success).toBe(false)
      expect(tooEarly.issues?.[0]?.message).toBe('Date is too early')

      const tooLate = schema.safeParse(new Date('2027-01-01T00:00:00Z'))
      expect(tooLate.success).toBe(false)
      expect(tooLate.issues?.[0]?.message).toBe('Date is too late')
    })
  })

  describe('s.bigint()', () => {
    it('validates bigint primitives and rejects non-bigints', () => {
      const schema = s.bigint()

      expect(schema.safeParse(42n).success).toBe(true)
      expect(schema.safeParse(0n).success).toBe(true)
      expect(schema.safeParse(-100n).success).toBe(true)

      const numRes = schema.safeParse(42)
      expect(numRes.success).toBe(false)
      expect(numRes.issues?.[0]?.code).toBe('invalid_type')

      const strRes = schema.safeParse('42')
      expect(strRes.success).toBe(false)
    })

    it('enforces min, max, positive, and negative on bigint', () => {
      const schema = s.bigint().min(10n, 'Must be at least 10n').max(100n, 'Must be at most 100n')

      expect(schema.safeParse(50n).success).toBe(true)
      expect(schema.safeParse(5n).issues?.[0]?.message).toBe('Must be at least 10n')
      expect(schema.safeParse(200n).issues?.[0]?.message).toBe('Must be at most 100n')

      const pos = s.bigint().positive('Positive only')
      expect(pos.safeParse(1n).success).toBe(true)
      expect(pos.safeParse(0n).issues?.[0]?.message).toBe('Positive only')
      expect(pos.safeParse(-5n).issues?.[0]?.message).toBe('Positive only')

      const neg = s.bigint().negative('Negative only')
      expect(neg.safeParse(-1n).success).toBe(true)
      expect(neg.safeParse(1n).issues?.[0]?.message).toBe('Negative only')
    })
  })

  describe('s.coerce.* namespace', () => {
    it('coerces values to string', () => {
      const schema = s.coerce.string().min(2)

      const numRes = schema.safeParse(42)
      expect(numRes.success).toBe(true)
      expect(numRes.data).toBe('42')

      const boolRes = schema.safeParse(true)
      expect(boolRes.success).toBe(true)
      expect(boolRes.data).toBe('true')

      const tooShort = schema.safeParse(5)
      expect(tooShort.success).toBe(false)
    })

    it('coerces values to number', () => {
      const schema = s.coerce.number().min(10)

      expect(schema.parse('50')).toBe(50)
      expect(schema.parse('13.14')).toBe(13.14)
      expect(s.coerce.number().parse(true)).toBe(1)
      expect(s.coerce.number().parse(false)).toBe(0)

      const tooSmall = schema.safeParse(true)
      expect(tooSmall.success).toBe(false)
      expect(tooSmall.issues?.[0]?.code).toBe('too_small')

      const nanRes = schema.safeParse('not-a-number')
      expect(nanRes.success).toBe(false)
      expect(nanRes.issues?.[0]?.code).toBe('invalid_type')
    })

    it('coerces values to boolean', () => {
      const schema = s.coerce.boolean()

      expect(schema.parse('true')).toBe(true)
      expect(schema.parse('false')).toBe(false)
      expect(schema.parse('1')).toBe(true)
      expect(schema.parse('0')).toBe(false)
      expect(schema.parse(1)).toBe(true)
      expect(schema.parse(0)).toBe(false)
      expect(schema.parse('')).toBe(false)
    })

    it('coerces ISO strings and timestamps to Date', () => {
      const min = new Date('2026-01-01T00:00:00Z')
      const schema = s.coerce.date().min(min)

      const parsedIso = schema.parse('2026-05-10T15:30:00.000Z')
      expect(parsedIso).toBeInstanceOf(Date)
      expect(parsedIso.toISOString()).toBe('2026-05-10T15:30:00.000Z')

      const parsedTimestamp = schema.parse(1778427000000)
      expect(parsedTimestamp).toBeInstanceOf(Date)

      const invalidRes = schema.safeParse('garbage-date')
      expect(invalidRes.success).toBe(false)
      expect(invalidRes.issues?.[0]?.code).toBe('invalid_date')

      const tooEarly = schema.safeParse('2025-01-01T00:00:00Z')
      expect(tooEarly.success).toBe(false)
      expect(tooEarly.issues?.[0]?.code).toBe('too_small')
    })

    it('coerces strings and numbers to BigInt', () => {
      const schema = s.coerce.bigint().min(100n)

      expect(schema.parse('999999999999999999')).toBe(999999999999999999n)
      expect(schema.parse(250)).toBe(250n)
      expect(s.coerce.bigint().parse(true)).toBe(1n)
      expect(s.coerce.bigint().parse(false)).toBe(0n)

      const tooSmall = schema.safeParse(true)
      expect(tooSmall.success).toBe(false)
      expect(tooSmall.issues?.[0]?.code).toBe('too_small')

      const invalid = schema.safeParse('hello')
      expect(invalid.success).toBe(false)
      expect(invalid.issues?.[0]?.code).toBe('invalid_type')
    })
  })

  describe('Interop Bridges with Date and BigInt', () => {
    it('converts Date and BigInt to JSON Schema correctly', () => {
      const dateSchema = toJSONSchema(s.date().descriptor)
      expect(dateSchema.type).toBe('string')
      expect(dateSchema.format).toBe('date-time')

      const bigintSchema = toJSONSchema(s.bigint().descriptor)
      expect(bigintSchema.type).toBe('integer')
      expect(bigintSchema.format).toBe('int64')
    })

    it('converts to and from Zod with Date and BigInt', () => {
      const zodDate = toZod(s.date().descriptor)
      expect(zodDate.safeParse(new Date()).success).toBe(true)

      const zodBigInt = toZod(s.bigint().descriptor)
      expect(zodBigInt.safeParse(123n).success).toBe(true)

      const structDate = fromZod(z.date())
      expect(structDate.descriptor.kind).toBe('date')
      expect(structDate.safeParse(new Date()).success).toBe(true)

      const structBigInt = fromZod(z.bigint())
      expect(structBigInt.descriptor.kind).toBe('bigint')
      expect(structBigInt.safeParse(123n).success).toBe(true)
    })

    it('reconstructs schemas from AST descriptors via s.fromDescriptor', () => {
      const dSchema = s.fromDescriptor({ kind: 'date', optional: true })
      expect(dSchema.safeParse(undefined).success).toBe(true)
      expect(dSchema.safeParse(new Date()).success).toBe(true)

      const bSchema = s.fromDescriptor({ kind: 'bigint' })
      expect(bSchema.safeParse(42n).success).toBe(true)
      expect(bSchema.safeParse('42').success).toBe(false)
    })
  })
})
