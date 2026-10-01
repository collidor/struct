import { describe, it, expect } from 'vitest'
import { s, StructValidationError } from '../src'

describe('Complex and Variant Schemas', () => {
  describe('s.array()', () => {
    it('validates array items', () => {
      const schema = s.array(s.number()).min(1).max(3)
      expect(schema.parse([1, 2])).toEqual([1, 2])
      expect(() => schema.parse([])).toThrow('at least 1 item(s)')
      expect(() => schema.parse([1, 2, 3, 4])).toThrow('at most 3 item(s)')
      expect(() => schema.parse(['a'])).toThrow(StructValidationError)
    })

    it('creates default array []', () => {
      const schema = s.array(s.string())
      expect(schema.createDefault()).toEqual([])
    })
  })

  describe('s.record()', () => {
    it('validates dictionary records', () => {
      const schema = s.record(s.number())
      expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
      expect(() => schema.parse({ a: 'not-a-number' })).toThrow('Expected number')
    })
  })

  describe('s.enum() and s.literal()', () => {
    it('validates enum values', () => {
      const schema = s.enum(['red', 'green', 'blue'] as const)
      expect(schema.parse('red')).toBe('red')
      expect(() => schema.parse('yellow')).toThrow('Expected one of')
    })

    it('attaches labels to enum metadata', () => {
      const schema = s.enum(['sm', 'md', 'lg'] as const).labels({
        sm: 'Small',
        md: 'Medium',
        lg: 'Large',
      })
      expect(schema.descriptor.labels).toEqual({
        sm: 'Small',
        md: 'Medium',
        lg: 'Large',
      })
    })

    it('validates literal values', () => {
      const schema = s.literal('COLLIDOR')
      expect(schema.parse('COLLIDOR')).toBe('COLLIDOR')
      expect(() => schema.parse('OTHER')).toThrow('Expected literal')
    })
  })

  describe('s.union() and s.tuple()', () => {
    it('validates unions', () => {
      const schema = s.union([s.string(), s.number()])
      expect(schema.parse('hello')).toBe('hello')
      expect(schema.parse(42)).toBe(42)
      expect(() => schema.parse(true)).toThrow('does not match any union variant')
    })

    it('validates tuples', () => {
      const schema = s.tuple([s.string(), s.number(), s.boolean()])
      expect(schema.parse(['score', 100, true])).toEqual(['score', 100, true])
      expect(() => schema.parse(['score', 100])).toThrow('Expected tuple of length 3')
      expect(() => schema.parse(['score', 'bad', true])).toThrow('Expected number')
    })
  })
})
