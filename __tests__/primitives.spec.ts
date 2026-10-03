import { describe, it, expect } from 'vitest'
import { s, StructValidationError } from '../src'

describe('Primitive Schemas', () => {
  describe('s.string()', () => {
    it('validates string values', () => {
      const schema = s.string()
      expect(schema.parse('hello')).toBe('hello')
      expect(schema.safeParse('hello')).toEqual({ success: true, data: 'hello' })
      expect(() => schema.parse(123)).toThrow(StructValidationError)
    })

    it('enforces min and max lengths', () => {
      const schema = s.string().min(3).max(6)
      expect(schema.parse('abc')).toBe('abc')
      expect(schema.parse('abcdef')).toBe('abcdef')
      expect(() => schema.parse('ab')).toThrow('at least 3 character(s)')
      expect(() => schema.parse('abcdefg')).toThrow('at most 6 character(s)')
    })

    it('enforces regex patterns', () => {
      const schema = s.string().regex(/^[A-Z]+$/)
      expect(schema.parse('ABC')).toBe('ABC')
      expect(() => schema.parse('abc')).toThrow('pattern')
    })

    it('validates email format', () => {
      const schema = s.string().email()
      expect(schema.parse('test@example.com')).toBe('test@example.com')
      expect(() => schema.parse('not-an-email')).toThrow('Invalid email')
    })

    it('validates URL format', () => {
      const schema = s.string().url()
      expect(schema.parse('https://example.com')).toBe('https://example.com')
      expect(() => schema.parse('not-a-url')).toThrow('Invalid URL')
    })

    it('handles optional and default', () => {
      const optSchema = s.string().optional()
      expect(optSchema.parse(undefined)).toBeUndefined()

      const defSchema = s.string().default('fallback')
      expect(defSchema.parse(undefined)).toBe('fallback')
      expect(defSchema.parse('custom')).toBe('custom')
    })

    it('handles nullable', () => {
      const nullSchema = s.string().nullable()
      expect(nullSchema.parse(null)).toBeNull()
      expect(nullSchema.parse('test')).toBe('test')
    })
  })

  describe('s.number() and s.integer()', () => {
    it('validates numbers', () => {
      const schema = s.number()
      expect(schema.parse(42.5)).toBe(42.5)
      expect(() => schema.parse('42')).toThrow(StructValidationError)
      expect(() => schema.parse(NaN)).toThrow(StructValidationError)
    })

    it('enforces min, max and step', () => {
      const schema = s.number().min(0).max(10).step(2)
      expect(schema.parse(0)).toBe(0)
      expect(schema.parse(4)).toBe(4)
      expect(schema.parse(10)).toBe(10)
      expect(() => schema.parse(-1)).toThrow('greater than or equal to 0')
      expect(() => schema.parse(11)).toThrow('less than or equal to 10')
      expect(() => schema.parse(3)).toThrow('multiple of 2')
    })

    it('enforces integers with s.integer()', () => {
      const schema = s.integer()
      expect(schema.parse(10)).toBe(10)
      expect(() => schema.parse(10.5)).toThrow('Expected integer, received float')
    })

    it('enforces positive and negative helpers', () => {
      const pos = s.number().positive()
      expect(pos.parse(1)).toBe(1)
      expect(() => pos.parse(0)).toThrow('Number must be positive')

      const neg = s.number().negative()
      expect(neg.parse(-1)).toBe(-1)
      expect(() => neg.parse(0)).toThrow('Number must be negative')
    })
  })

  describe('s.boolean()', () => {
    it('validates boolean values', () => {
      const schema = s.boolean()
      expect(schema.parse(true)).toBe(true)
      expect(schema.parse(false)).toBe(false)
      expect(() => schema.parse(1)).toThrow(StructValidationError)
    })
  })

  describe('s.null() and s.any()', () => {
    it('validates null', () => {
      const schema = s.null()
      expect(schema.parse(null)).toBeNull()
      expect(() => schema.parse(undefined)).toThrow('Expected null')
      expect(() => schema.parse(0)).toThrow('Expected null')
    })

    it('allows any value with s.any()', () => {
      const schema = s.any()
      expect(schema.parse('str')).toBe('str')
      expect(schema.parse(123)).toBe(123)
      expect(schema.parse({ a: 1 })).toEqual({ a: 1 })
    })
  })

  describe('Custom Refinements', () => {
    it('supports custom synchronous refinement functions', () => {
      const schema = s.number().refine((v) => v % 2 === 0, 'Must be even')
      expect(schema.parse(4)).toBe(4)
      expect(() => schema.parse(5)).toThrow('Must be even')
    })

    it('supports custom async refinement functions', async () => {
      const schema = s.string().refine(async (v) => v === 'valid-token', 'Invalid token')
      await expect(schema.parseAsync('valid-token')).resolves.toBe('valid-token')
      await expect(schema.parseAsync('invalid')).rejects.toThrow('Invalid token')
    })
  })

  describe('Metadata Annotation', () => {
    it('sets description via .description() and .describe() alias', () => {
      const s1 = s.string().description('User email address')
      expect(s1.descriptor.description).toBe('User email address')
      expect(s1.descriptor.metadata?.description).toBe('User email address')

      const s2 = s.string().trim().toLowerCase().min(3).max(20).describe('Account handle')
      expect(s2.descriptor.description).toBe('Account handle')
      expect(s2.descriptor.metadata?.description).toBe('Account handle')
    })
  })

  describe('s.optional, s.nullable, s.nullish, s.unknown helper functions', () => {
    it('wraps schemas with optionality, nullability, and unknown', () => {
      const optStr = s.optional(s.string())
      expect(optStr.parse(undefined)).toBeUndefined()
      expect(optStr.parse('hello')).toBe('hello')

      const optWithDefault = s.optional(s.string(), 'fallback')
      expect(optWithDefault.parse(undefined)).toBe('fallback')

      const nullNum = s.nullable(s.number())
      expect(nullNum.parse(null)).toBeNull()
      expect(nullNum.parse(42)).toBe(42)

      const nullishBool = s.nullish(s.boolean())
      expect(nullishBool.parse(null)).toBeNull()
      expect(nullishBool.parse(undefined)).toBeUndefined()
      expect(nullishBool.parse(true)).toBe(true)

      const unk = s.unknown()
      expect(unk.parse({ any: 'value' })).toEqual({ any: 'value' })
    })
  })
})

