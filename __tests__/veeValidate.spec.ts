import { describe, it, expect } from 'vitest'
import { s, toVeeValidateSchema } from '../src'

describe('Vee-Validate Bridge', () => {
  const LoginForm = s.struct({
    email: s.string().email('Please enter a valid email address'),
    password: s.string().min(8, 'Password must be at least 8 characters'),
  })

  it('provides a TypedSchema adapter for vee-validate', async () => {
    const typedSchema = toVeeValidateSchema(LoginForm)
    expect(typedSchema.__type).toBe('standard')

    // Valid data
    const validResult = await typedSchema.validate({
      email: 'alex@collidor.com',
      password: 'SuperSecret123',
    })
    expect(validResult.errors).toEqual([])
    expect(validResult.value).toEqual({
      email: 'alex@collidor.com',
      password: 'SuperSecret123',
    })

    // Invalid data
    const invalidResult = await typedSchema.validate({
      email: 'bad-email',
      password: 'short',
    })
    expect(invalidResult.errors.length).toBe(2)
    const errorPaths = invalidResult.errors.map((e) => e.path)
    expect(errorPaths).toContain('email')
    expect(errorPaths).toContain('password')
  })
})
