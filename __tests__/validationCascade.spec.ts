import { describe, it, expect } from 'vitest'
import { s } from '../src'

describe('Validation Refinement Cascade & Custom Error Messages (Ticket 001)', () => {
  describe('Nested Struct Refinements', () => {
    it('executes .refine() on nested struct fields', () => {
      const userSchema = s.struct({
        username: s.string().refine((val) => val !== 'admin', {
          message: 'Username "admin" is reserved',
        }),
      })

      const validRes = userSchema.safeParse({ username: 'johndoe' })
      expect(validRes.success).toBe(true)

      const invalidRes = userSchema.safeParse({ username: 'admin' })
      expect(invalidRes.success).toBe(false)
      expect(invalidRes.issues).toBeDefined()
      expect(invalidRes.issues?.[0]?.path).toEqual(['username'])
      expect(invalidRes.issues?.[0]?.message).toBe('Username "admin" is reserved')
    })

    it('executes deeply nested struct refinements with proper path prefixing', () => {
      const nestedSchema = s.struct({
        profile: s.struct({
          settings: s.struct({
            age: s.number().refine((n) => n >= 18, 'Must be at least 18'),
          }),
        }),
      })

      const res = nestedSchema.safeParse({
        profile: {
          settings: {
            age: 16,
          },
        },
      })

      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.path).toEqual(['profile', 'settings', 'age'])
      expect(res.issues?.[0]?.message).toBe('Must be at least 18')
    })
  })

  describe('Nested Array, Record & Tuple Refinements', () => {
    it('executes refinements on array elements with index in path', () => {
      const listSchema = s.array(
        s.number().refine((n) => n % 2 === 0, 'Number must be even'),
      )

      const res = listSchema.safeParse([2, 4, 5, 8])
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.path).toEqual([2])
      expect(res.issues?.[0]?.message).toBe('Number must be even')
    })

    it('executes refinements on record values with key in path', () => {
      const dictSchema = s.record(
        s.string().refine((val) => val.startsWith('prefix_'), 'Must start with prefix_'),
      )

      const res = dictSchema.safeParse({ keyA: 'prefix_ok', keyB: 'invalid' })
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.path).toEqual(['keyB'])
      expect(res.issues?.[0]?.message).toBe('Must start with prefix_')
    })

    it('executes refinements on tuple elements with index in path', () => {
      const pairSchema = s.tuple([
        s.string().refine((s) => s.length > 2, 'Tuple item 0 too short'),
        s.number(),
      ])

      const res = pairSchema.safeParse(['ab', 42])
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.path).toEqual([0])
      expect(res.issues?.[0]?.message).toBe('Tuple item 0 too short')
    })
  })

  describe('Custom Error Messages in Primitives Constraints', () => {
    it('uses custom message for string.min()', () => {
      const schema = s.string().min(5, 'Custom minimum 5 chars required')
      const res = schema.safeParse('abc')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Custom minimum 5 chars required')
    })

    it('uses custom message for string.max()', () => {
      const schema = s.string().max(3, 'Custom maximum 3 chars allowed')
      const res = schema.safeParse('abcdef')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Custom maximum 3 chars allowed')
    })

    it('uses custom message for string.regex()', () => {
      const schema = s.string().regex(/^abc/, 'Custom regex: must begin with abc')
      const res = schema.safeParse('xyz')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Custom regex: must begin with abc')
    })

    it('uses custom message for string.email()', () => {
      const schema = s.string().email('Please enter a valid email address')
      const res = schema.safeParse('not-an-email')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Please enter a valid email address')
    })

    it('uses custom message for string.url()', () => {
      const schema = s.string().url('Invalid website link')
      const res = schema.safeParse('not-a-url')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Invalid website link')
    })

    it('uses custom message for string.uuid()', () => {
      const schema = s.string().uuid('UUID is malformed')
      const res = schema.safeParse('1234')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('UUID is malformed')
    })

    it('uses custom message for string.datetime()', () => {
      const schema = s.string().datetime('Must be valid ISO timestamp')
      const res = schema.safeParse('yesterday')
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.message).toBe('Must be valid ISO timestamp')
    })

    it('uses custom message for number.min() and number.max()', () => {
      const minSchema = s.number().min(10, 'Value is too small, minimum is 10')
      const minRes = minSchema.safeParse(5)
      expect(minRes.success).toBe(false)
      expect(minRes.issues?.[0]?.message).toBe('Value is too small, minimum is 10')

      const maxSchema = s.number().max(50, 'Value exceeds limit of 50')
      const maxRes = maxSchema.safeParse(100)
      expect(maxRes.success).toBe(false)
      expect(maxRes.issues?.[0]?.message).toBe('Value exceeds limit of 50')
    })

    it('uses custom message for number.integer() and number.positive()', () => {
      const intSchema = s.number().integer('Float not allowed, integer required')
      const intRes = intSchema.safeParse(3.14)
      expect(intRes.success).toBe(false)
      expect(intRes.issues?.[0]?.message).toBe('Float not allowed, integer required')

      const posSchema = s.number().positive('Must be strictly positive')
      const posRes = posSchema.safeParse(-5)
      expect(posRes.success).toBe(false)
      expect(posRes.issues?.[0]?.message).toBe('Must be strictly positive')
    })

    it('uses custom message for array.min() and array.max()', () => {
      const minArr = s.array(s.string()).min(2, 'At least 2 items needed')
      const minRes = minArr.safeParse(['one'])
      expect(minRes.success).toBe(false)
      expect(minRes.issues?.[0]?.message).toBe('At least 2 items needed')

      const maxArr = s.array(s.string()).max(1, 'No more than 1 item')
      const maxRes = maxArr.safeParse(['one', 'two'])
      expect(maxRes.success).toBe(false)
      expect(maxRes.issues?.[0]?.message).toBe('No more than 1 item')
    })

    it('uses custom message for length(), nonempty(), step(), and between()', () => {
      const strLen = s.string().length(5, 'Must be exactly 5 chars')
      expect(strLen.safeParse('abc').issues?.[0]?.message).toBe('Must be exactly 5 chars')
      expect(strLen.safeParse('abcdefgh').issues?.[0]?.message).toBe('Must be exactly 5 chars')

      const strNonEmpty = s.string().nonempty('Cannot be blank')
      expect(strNonEmpty.safeParse('').issues?.[0]?.message).toBe('Cannot be blank')

      const numStep = s.number().step(5, 'Must be a multiple of 5')
      expect(numStep.safeParse(12).issues?.[0]?.message).toBe('Must be a multiple of 5')

      const numBetween = s.number().between(10, 20, 'Score must be between 10 and 20')
      expect(numBetween.safeParse(5).issues?.[0]?.message).toBe('Score must be between 10 and 20')
      expect(numBetween.safeParse(25).issues?.[0]?.message).toBe('Score must be between 10 and 20')
    })
  })
})
