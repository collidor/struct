import { describe, it, expect } from 'vitest'
import { s } from '../src/index'

describe('Ticket 004: Schema Transforms, Pipes, and String Sanitizers', () => {
  describe('StringSchema Sanitizers', () => {
    it('trims leading and trailing whitespace before constraint checks', () => {
      const schema = s.string().trim().min(3)

      expect(schema.parse('  hello  ')).toBe('hello')

      const shortRes = schema.safeParse('   hi   ')
      expect(shortRes.success).toBe(false)
      expect(shortRes.issues?.[0]?.code).toBe('too_small')
    })

    it('converts strings to lowercase and uppercase', () => {
      const lowerSchema = s.string().toLowerCase()
      expect(lowerSchema.parse('ALICE@EXAMPLE.COM')).toBe('alice@example.com')

      const upperSchema = s.string().toUpperCase()
      expect(upperSchema.parse('hello world')).toBe('HELLO WORLD')
    })

    it('chains trim, toLowerCase, and format/min constraints seamlessly', () => {
      const emailSchema = s.string().trim().toLowerCase().email().min(5)

      const result = emailSchema.parse('   ALICE@GMAIL.COM   ')
      expect(result).toBe('alice@gmail.com')

      const invalid = emailSchema.safeParse('   invalid   ')
      expect(invalid.success).toBe(false)
    })
  })

  describe('Generic .transform()', () => {
    it('transforms valid parsed input into a new type synchronously', () => {
      const strToNum = s.string().transform((val) => Number(val))

      expect(strToNum.parse('42')).toBe(42)

      const badType = strToNum.safeParse(123)
      expect(badType.success).toBe(false)
      expect(badType.issues?.[0]?.code).toBe('invalid_type')
    })

    it('chains multiple transforms sequentially', () => {
      const pipeline = s
        .string()
        .transform((str) => str.trim())
        .transform((trimmed) => trimmed.length)
        .transform((len) => len * 2)

      expect(pipeline.parse('   abc   ')).toBe(6)
    })

    it('evaluates refinements on transformed output', () => {
      const parsedNum = s
        .string()
        .transform((val) => Number(val))
        .refine((n) => n >= 10, 'Must be double digits')

      expect(parsedNum.parse('15')).toBe(15)

      const tooSmall = parsedNum.safeParse('5')
      expect(tooSmall.success).toBe(false)
      expect(tooSmall.issues?.[0]?.message).toBe('Must be double digits')
    })

    it('supports asynchronous transforms via safeParseAsync and parseAsync', () => {
      const asyncSchema = s.string().transform(async (val) => {
        return `async:${val}`
      })

      // Synchronous parse throws when encountering promise
      expect(() => asyncSchema.parse('test')).toThrowError(/asynchronous transform/)

      // Asynchronous parse succeeds
      return asyncSchema.parseAsync('test').then((res) => {
        expect(res).toBe('async:test')
      })
    })

    it('short-circuits async transform if input schema validation fails', async () => {
      let transformCalled = false
      const asyncSchema = s.number().transform(async (n) => {
        transformCalled = true
        return n * 2
      })

      const res = await asyncSchema.safeParseAsync('not-a-number')
      expect(res.success).toBe(false)
      expect(transformCalled).toBe(false)
    })
  })

  describe('.pipe() and s.pipe()', () => {
    it('pipes transformed string into a validated number schema', () => {
      const piped = s
        .string()
        .transform((str) => Number(str))
        .pipe(s.number().min(10, 'Minimum 10 required'))

      expect(piped.parse('25')).toBe(25)

      const tooLow = piped.safeParse('5')
      expect(tooLow.success).toBe(false)
      expect(tooLow.issues?.[0]?.message).toBe('Minimum 10 required')

      const badInput = piped.safeParse(true)
      expect(badInput.success).toBe(false)
      expect(badInput.issues?.[0]?.code).toBe('invalid_type')
    })

    it('pipes data with standalone s.pipe helper', () => {
      const csvToArray = s.pipe(
        s.string().transform((csv) => csv.split(',').map((item) => item.trim())),
        s.array(s.string().min(2, 'Item must be at least 2 chars')),
      )

      expect(csvToArray.parse('apple, banana, cherry')).toEqual(['apple', 'banana', 'cherry'])

      const failingItem = csvToArray.safeParse('apple, a, cherry')
      expect(failingItem.success).toBe(false)
      expect(failingItem.issues?.[0]?.message).toBe('Item must be at least 2 chars')
    })

    it('supports async pipelines with pipe', async () => {
      const asyncPiped = s
        .string()
        .transform(async (s) => s.trim().toUpperCase())
        .pipe(s.string().min(3))

      const result = await asyncPiped.parseAsync('   hello   ')
      expect(result).toBe('HELLO')

      const tooShort = await asyncPiped.safeParseAsync('  hi  ')
      expect(tooShort.success).toBe(false)
    })

    it('sets TransformSchema descriptor.kind to any to reflect transformed output', () => {
      const strToNum = s.string().transform((s) => Number(s))
      expect(strToNum.descriptor.kind).toBe('any')
    })
  })
})
