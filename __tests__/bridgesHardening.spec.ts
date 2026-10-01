import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  s,
  toZod,
  fromZod,
  isAssignable,
  getAxonDataType,
  type StructValidationError,
} from '../src'

describe('Interop Bridges Hardening & Subtyping', () => {
  describe('fromZod Constraint Extraction', () => {
    it('extracts string checks (min, max, length, email, url, uuid, datetime, regex, trim, casing)', () => {
      const zodString = z
        .string()
        .min(5, 'Must be at least 5 chars')
        .max(20, 'Must be at most 20 chars')
        .email('Invalid email')
        .regex(/^[a-z@.]+$/, 'Lower email only')
        .trim()
        .toLowerCase()

      const structSchema = fromZod(zodString)
      const desc = structSchema.descriptor

      expect(desc.kind).toBe('string')
      expect(desc.minLength).toBe(5)
      expect(desc.maxLength).toBe(20)
      expect(desc.format).toBe('email')
      expect(desc.pattern).toBe('^[a-z@.]+$')
      expect(desc.trim).toBe(true)
      expect(desc.toLowerCase).toBe(true)
      expect(desc.messages?.min).toBe('Must be at least 5 chars')
      expect(desc.messages?.max).toBe('Must be at most 20 chars')
      expect(desc.messages?.email).toBe('Invalid email')
      expect(desc.messages?.pattern).toBe('Lower email only')

      // Validation behavior
      expect(structSchema.safeParse('  admin@test.com  ').data).toBe('admin@test.com')
      expect(structSchema.safeParse('abc').success).toBe(false)
    })

    it('extracts number checks (min, max, gt, lt, int, multipleOf)', () => {
      const zodNum = z
        .number()
        .int('Must be integer')
        .min(10, 'Min 10')
        .max(100, 'Max 100')
        .multipleOf(5, 'Must be multiple of 5')

      const structSchema = fromZod(zodNum)
      const desc = structSchema.descriptor

      expect(desc.kind).toBe('integer')
      expect(desc.min).toBe(10)
      expect(desc.max).toBe(100)
      expect(desc.step).toBe(5)

      expect(structSchema.safeParse(25).success).toBe(true)
      expect(structSchema.safeParse(26).success).toBe(false) // not multiple of 5
      expect(structSchema.safeParse(5).success).toBe(false) // < 10
      expect(structSchema.safeParse(105).success).toBe(false) // > 100
    })

    it('extracts number gt and lt exclusive checks via refinements', () => {
      const zodExclusive = z.number().gt(0, 'Must be > 0').lt(10, 'Must be < 10')
      const structSchema = fromZod(zodExclusive)

      expect(structSchema.safeParse(5).success).toBe(true)
      expect(structSchema.safeParse(0).success).toBe(false)
      expect(structSchema.safeParse(10).success).toBe(false)
    })

    it('extracts ZodDate with min and max constraints', () => {
      const minDate = new Date('2020-01-01T00:00:00Z')
      const maxDate = new Date('2025-12-31T23:59:59Z')

      const zodDate = z.date().min(minDate, 'Too early').max(maxDate, 'Too late')
      const structSchema = fromZod(zodDate)

      expect(structSchema.descriptor.kind).toBe('date')
      expect(structSchema.safeParse(new Date('2023-06-15')).success).toBe(true)
      expect(structSchema.safeParse(new Date('2019-01-01')).success).toBe(false)
      expect(structSchema.safeParse(new Date('2026-01-01')).success).toBe(false)
    })

    it('extracts ZodBigInt with min, max, and multipleOf constraints', () => {
      const zodBigInt = z.bigint().min(10n, 'Min 10n').max(1000n, 'Max 1000n').multipleOf(10n)
      const structSchema = fromZod(zodBigInt)

      expect(structSchema.descriptor.kind).toBe('bigint')
      expect(structSchema.safeParse(50n).success).toBe(true)
      expect(structSchema.safeParse(5n).success).toBe(false)
      expect(structSchema.safeParse(1500n).success).toBe(false)
      expect(structSchema.safeParse(25n).success).toBe(false) // not multiple of 10n
    })

    it('extracts ZodTuple with heterogeneous item schemas', () => {
      const zodTuple = z.tuple([z.string().min(2), z.number().int(), z.boolean()])
      const structSchema = fromZod(zodTuple)

      expect(structSchema.descriptor.kind).toBe('tuple')
      expect(structSchema.safeParse(['ab', 42, true]).success).toBe(true)
      expect(structSchema.safeParse(['a', 42, true]).success).toBe(false) // string too short
      expect(structSchema.safeParse(['ab', 42.5, true]).success).toBe(false) // not int
      expect(structSchema.safeParse(['ab', 42]).success).toBe(false) // wrong length
    })

    it('extracts ZodArray length constraints and unwraps ZodEffects', () => {
      const zodArr = z.array(z.string()).min(2, 'Min 2 items').max(5, 'Max 5 items')
      const structArr = fromZod(zodArr)

      expect(structArr.descriptor.minItems).toBe(2)
      expect(structArr.descriptor.maxItems).toBe(5)
      expect(structArr.safeParse(['a', 'b']).success).toBe(true)
      expect(structArr.safeParse(['a']).success).toBe(false)

      // ZodEffects (.refine)
      const zodRefined = z.string().refine((val) => val.startsWith('prefix_'))
      const structRefined = fromZod(zodRefined)
      expect(structRefined.descriptor.kind).toBe('string')
    })

    it('preserves coercion flags from z.coerce.*', () => {
      expect(fromZod(z.coerce.string()).descriptor.coerce).toBe(true)
      expect(fromZod(z.coerce.number()).descriptor.coerce).toBe(true)
      expect(fromZod(z.coerce.boolean()).descriptor.coerce).toBe(true)
      expect(fromZod(z.coerce.date()).descriptor.coerce).toBe(true)
      expect(fromZod(z.coerce.bigint()).descriptor.coerce).toBe(true)
    })
  })

  describe('toZod Bridge Enhancements', () => {
    it('converts DateSchema and BigIntSchema with constraints to Zod', () => {
      const dateSchema = s.date().min(new Date('2020-01-01'))
      const zodDate = toZod(dateSchema.descriptor)
      expect(zodDate.safeParse(new Date('2022-01-01')).success).toBe(true)
      expect(zodDate.safeParse(new Date('2018-01-01')).success).toBe(false)

      const bigintSchema = s.bigint().min(10n).max(100n)
      const zodBigInt = toZod(bigintSchema.descriptor)
      expect(zodBigInt.safeParse(50n).success).toBe(true)
      expect(zodBigInt.safeParse(5n).success).toBe(false)
      expect(zodBigInt.safeParse(500n).success).toBe(false)
    })

    it('converts TupleSchema to Zod tuple', () => {
      const tupleSchema = s.tuple([s.string(), s.number(), s.boolean()])
      const zodTuple = toZod(tupleSchema.descriptor)
      expect(zodTuple.safeParse(['hello', 123, true]).success).toBe(true)
      expect(zodTuple.safeParse(['hello', 'world', true]).success).toBe(false)
    })
  })

  describe('Axon Bridge isAssignable & Soundness', () => {
    it('enforces strict nullability soundness (nullable source cannot flow into non-nullable target)', () => {
      const nullableStr = s.string().nullable()
      const nonNullableStr = s.string()

      // Nullable source cannot flow into non-nullable target!
      expect(isAssignable(nullableStr, nonNullableStr)).toBe(false)

      // Nullable source CAN flow into nullable target
      expect(isAssignable(nullableStr, s.string().nullable())).toBe(true)

      // Nullable source CAN flow into union containing null
      expect(isAssignable(nullableStr, s.union([s.string(), s.null()]))).toBe(true)

      // Non-nullable source CAN flow into nullable target
      expect(isAssignable(nonNullableStr, nullableStr)).toBe(true)
    })

    it('enforces strict optionality soundness', () => {
      const optionalStr = s.string().optional()
      const requiredStr = s.string()

      // Optional source cannot flow into required target!
      expect(isAssignable(optionalStr, requiredStr)).toBe(false)

      // Optional source CAN flow into optional target
      expect(isAssignable(optionalStr, s.string().optional())).toBe(true)

      // Required source CAN flow into optional target
      expect(isAssignable(requiredStr, optionalStr)).toBe(true)
    })

    it('supports tuple subtyping', () => {
      const literalNumTuple = s.tuple([s.literal(42), s.string()])
      const generalNumTuple = s.tuple([s.number(), s.string()])
      const wrongTypeTuple = s.tuple([s.string(), s.string()])
      const wrongLengthTuple = s.tuple([s.number()])

      // Literal tuple can flow into general tuple
      expect(isAssignable(literalNumTuple, generalNumTuple)).toBe(true)

      // Incompatible element type
      expect(isAssignable(generalNumTuple, wrongTypeTuple)).toBe(false)

      // Length mismatch
      expect(isAssignable(literalNumTuple, wrongLengthTuple)).toBe(false)
    })

    it('supports tuple-to-array subtyping', () => {
      const pointTuple = s.tuple([s.number(), s.number()])
      const numberArray = s.array(s.number())
      const stringArray = s.array(s.string())

      // Fixed [number, number] tuple can safely flow into number[]
      expect(isAssignable(pointTuple, numberArray)).toBe(true)

      // Cannot flow into incompatible item array
      expect(isAssignable(pointTuple, stringArray)).toBe(false)

      // Array cannot flow into tuple (length not guaranteed)
      expect(isAssignable(numberArray, pointTuple)).toBe(false)
    })

    it('supports Date and BigInt subtyping and literals', () => {
      expect(isAssignable(s.date(), s.date())).toBe(true)
      expect(isAssignable(s.bigint(), s.bigint())).toBe(true)
      expect(isAssignable(s.literal(100n), s.bigint())).toBe(true)
      expect(isAssignable(s.literal(new Date()), s.date())).toBe(true)
      expect(isAssignable(s.bigint(), s.number())).toBe(false)
    })

    it('generates accurate Axon dataType identifiers for tuples, date, and bigint', () => {
      expect(getAxonDataType(s.tuple([s.string(), s.number()]))).toBe('tuple:[string,number]')
      expect(getAxonDataType(s.date())).toBe('date')
      expect(getAxonDataType(s.bigint())).toBe('bigint')
    })
  })
})
