import { describe, it, expect } from 'vitest'
import { s, StructValidationError, cloneDescriptor } from '../src/index'

describe('Ticket 002: Safe Descriptor Cloning and Error Formatting', () => {
  describe('cloneDescriptor and Immutability', () => {
    it('preserves function dynamic defaults across modifier chaining', () => {
      let counter = 0
      const generator = () => `id-${++counter}`

      const base = s.string().default(generator)
      expect(typeof base.descriptor.default).toBe('function')

      // Chain multiple modifiers
      const chained = base.optional().label('User ID').placeholder('Enter ID')
      expect(typeof chained.descriptor.default).toBe('function')

      // Safe parse with undefined should invoke default generator
      const res1 = chained.safeParse(undefined)
      expect(res1.success).toBe(true)
      expect(res1.data).toBe('id-1')

      const res2 = chained.safeParse(undefined)
      expect(res2.success).toBe(true)
      expect(res2.data).toBe('id-2')
    })

    it('ensures immutability across fluent builder chains without mutating original descriptor', () => {
      const orig = s.string().min(5)
      const longer = orig.min(10)
      const withMax = longer.max(20)

      expect(orig.descriptor.minLength).toBe(5)
      expect(orig.descriptor.maxLength).toBeUndefined()

      expect(longer.descriptor.minLength).toBe(10)
      expect(longer.descriptor.maxLength).toBeUndefined()

      expect(withMax.descriptor.minLength).toBe(10)
      expect(withMax.descriptor.maxLength).toBe(20)
    })

    it('clones RegExp and Date objects without degradation', () => {
      const regex = /^[a-z]+$/i
      const date = new Date(1700000000000)
      const cloned = cloneDescriptor({ pattern: regex, createdAt: date, count: 42 })

      expect(cloned.pattern).toBeInstanceOf(RegExp)
      expect(cloned.pattern.source).toBe('^[a-z]+$')
      expect(cloned.pattern.flags).toBe('i')
      expect(cloned.createdAt).toBeInstanceOf(Date)
      expect(cloned.createdAt.getTime()).toBe(1700000000000)
    })

    it('preserves LiteralSchema value through chaining', () => {
      const lit = s.literal('active')
      const optLit = lit.optional().label('Status')

      expect(optLit.value).toBe('active')
      expect(optLit.descriptor.default).toBe('active')
      expect(optLit.safeParse('active').success).toBe(true)
      expect(optLit.safeParse('inactive').success).toBe(false)
      expect(optLit.safeParse(undefined).success).toBe(true)
    })

    it('clones StructSchema and preserves nested field definitions and defaults', () => {
      let counter = 0
      const userSchema = s.struct({
        id: s.string().default(() => `uid-${++counter}`),
        role: s.enum(['admin', 'user']),
      })

      const strictUser = userSchema.strict()
      expect(strictUser.descriptor.strict).toBe(true)
      expect(userSchema.descriptor.strict).toBeUndefined()

      const parsed1 = strictUser.parse({ role: 'admin' })
      expect(parsed1.id).toBe('uid-1')

      const parsed2 = strictUser.parse({ role: 'user' })
      expect(parsed2.id).toBe('uid-2')
    })
  })

  describe('StructValidationError.flatten()', () => {
    const userSchema = s
      .struct({
        username: s.string().min(3, 'Username too short'),
        email: s.string().email('Invalid email'),
        profile: s.struct({
          age: s.number().min(18, 'Must be at least 18'),
        }),
      })
      .refine((data) => data.username !== 'admin', 'Admin username is reserved')

    it('flattens root and field errors into standard shape', () => {
      // 1. Root level refinement error when fields pass
      const resRoot = userSchema.safeParse({
        username: 'admin',
        email: 'admin@example.com',
        profile: { age: 25 },
      })
      expect(resRoot.success).toBe(false)
      expect(resRoot.error!.flatten().formErrors).toEqual(['Admin username is reserved'])

      // 2. Field level validation errors
      const resFields = userSchema.safeParse({
        username: 'alice',
        email: 'invalid-email',
        profile: { age: 12 },
      })
      expect(resFields.success).toBe(false)
      const fieldFlat = resFields.error!.flatten()
      expect(fieldFlat.formErrors).toEqual([])
      expect(fieldFlat.fieldErrors['email']).toEqual(['Invalid email'])
      expect(fieldFlat.fieldErrors['profile']).toEqual(['Must be at least 18'])

      // 3. Combined StructValidationError containing both root and field issues
      const combinedErr = new StructValidationError([
        { path: [], message: 'Form has expired' },
        { path: ['username'], message: 'Username too short' },
        { path: ['profile', 'age'], message: 'Must be at least 18' },
      ])
      const combinedFlat = combinedErr.flatten()
      expect(combinedFlat.formErrors).toEqual(['Form has expired'])
      expect(combinedFlat.fieldErrors['username']).toEqual(['Username too short'])
      expect(combinedFlat.fieldErrors['profile']).toEqual(['Must be at least 18'])
    })

    it('supports custom mapper in flatten', () => {
      const res = userSchema.safeParse({
        username: 'a',
        email: 'invalid',
        profile: { age: 20 },
      })

      expect(res.success).toBe(false)
      const flat = res.error!.flatten((issue) => `[${issue.code}] ${issue.message}`)

      expect(flat.fieldErrors['username']?.[0]).toContain('[too_small] Username too short')
      expect(flat.fieldErrors['email']?.[0]).toContain('[invalid_format] Invalid email')
    })

    it('supports dot-path flattening style for forms', () => {
      const res = userSchema.safeParse({
        username: 'valid',
        email: 'invalid',
        profile: { age: 10 },
      })

      expect(res.success).toBe(false)
      const flat = res.error!.flatten(undefined, { pathStyle: 'dot' })

      expect(flat.fieldErrors['email']).toEqual(['Invalid email'])
      expect(flat.fieldErrors['profile.age']).toEqual(['Must be at least 18'])
    })
  })

  describe('StructValidationError.format()', () => {
    it('creates nested recursive error tree matching data structure', () => {
      const err = new StructValidationError([
        { path: [], message: 'Root level rejection' },
        { path: ['name'], message: 'Name too short' },
        { path: ['contact', 'email'], message: 'Invalid email' },
        { path: ['tags', 1], message: 'Tag too short' },
      ])

      const formatted = err.format()

      expect(formatted._errors).toEqual(['Root level rejection'])
      expect(formatted.name._errors).toEqual(['Name too short'])
      expect(formatted.contact.email._errors).toEqual(['Invalid email'])
      expect(formatted.tags['1']._errors).toEqual(['Tag too short'])
    })

    it('formats schema parse errors hierarchically', () => {
      const schema = s.struct({
        user: s.struct({
          name: s.string().min(2, 'Name too short'),
          addresses: s.array(
            s.struct({
              city: s.string().min(1, 'City required'),
            }),
          ),
        }),
      })

      const res = schema.safeParse({
        user: {
          name: 'x',
          addresses: [{ city: '' }],
        },
      })

      expect(res.success).toBe(false)
      const formatted = res.error!.format()

      expect(formatted._errors).toEqual([])
      expect(formatted.user._errors).toEqual([])
      expect(formatted.user.name._errors).toEqual(['Name too short'])
      expect(formatted.user.addresses['0'].city._errors).toEqual(['City required'])
    })
  })
})
