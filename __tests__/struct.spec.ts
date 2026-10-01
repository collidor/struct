import { describe, it, expect } from 'vitest'
import { s, generateDefaultValue } from '../src'

describe('Struct Schema', () => {
  const UserSchema = s.struct({
    name: s.string().min(1),
    age: s.integer().min(0),
    email: s.string().email().optional(),
    role: s.enum(['admin', 'user', 'guest']).default('user'),
  })

  it('validates a valid struct object', () => {
    const data = {
      name: 'Alice',
      age: 30,
      email: 'alice@example.com',
      role: 'admin',
    }
    const result = UserSchema.parse(data)
    expect(result).toEqual(data)
  })

  it('applies default values for missing optional/default fields', () => {
    const data = {
      name: 'Bob',
      age: 25,
    }
    const result = UserSchema.parse(data)
    expect(result.role).toBe('user')
    expect(result.email).toBeUndefined()
  })

  it('fails with detailed error messages on invalid fields', () => {
    const invalidData = {
      name: '',
      age: -5,
      email: 'bad-email',
      role: 'superadmin',
    }
    const res = UserSchema.safeParse(invalidData)
    expect(res.success).toBe(false)
    const failure = res as unknown as {
      success: false
      issues: Array<{ path?: (string | number)[] }>
    }
    expect(failure.issues.length).toBe(4)
    const paths = failure.issues.map((i) => (i.path || []).join('.'))
    expect(paths).toContain('name')
    expect(paths).toContain('age')
    expect(paths).toContain('email')
    expect(paths).toContain('role')
  })

  it('generates fully-populated default instances with createDefault()', () => {
    const defaults = UserSchema.createDefault()
    expect(defaults).toEqual({
      name: '',
      age: 0,
      role: 'user',
    })
  })

  it('supports .extend()', () => {
    const Extended = UserSchema.extend({
      guild: s.string().default('Novice'),
    })
    const res = Extended.parse({ name: 'Charlie', age: 20 })
    expect(res.guild).toBe('Novice')
  })

  it('supports .pick()', () => {
    const Picked = UserSchema.pick('name', 'email')
    expect(Object.keys(Picked.shape)).toEqual(['name', 'email'])
    expect(Picked.parse({ name: 'Dan' })).toEqual({ name: 'Dan' })
  })

  it('supports .omit()', () => {
    const Omitted = UserSchema.omit('age', 'role')
    expect(Object.keys(Omitted.shape)).toEqual(['name', 'email'])
  })

  it('supports .partial()', () => {
    const PartialSchema = UserSchema.partial()
    expect(PartialSchema.parse({})).toEqual({})
  })

  it('enforces strict mode when .strict() is enabled', () => {
    const StrictSchema = UserSchema.strict()
    expect(() =>
      StrictSchema.parse({
        name: 'Eve',
        age: 28,
        extraField: 'not allowed',
      }),
    ).toThrow('Unrecognized key "extraField"')
  })

  it('supports serialization and deserialization helpers', () => {
    const user = { name: 'Frank', age: 40, role: 'admin' as const }
    const json = UserSchema.serialize(user)
    expect(typeof json).toBe('string')
    const loaded = UserSchema.deserialize(json)
    expect(loaded).toEqual(user)
  })

  it('falls back to descriptor.default when structuredClone throws', () => {
    const symbolDefault = Symbol('uncloneable')
    const defaultValue = generateDefaultValue({ kind: 'any', default: symbolDefault })
    expect(defaultValue).toBe(symbolDefault)
  })
})
