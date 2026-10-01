// oxlint-disable typescript/no-explicit-any
import { describe, it, expect } from 'vitest'
import { s, toJSONSchema, fromJSONSchema } from '../src'

describe('JSON Schema Bridge', () => {
  const schema = s.struct({
    username: s.string().min(3).max(20).label('User Name'),
    age: s.integer().min(0).max(120).default(18),
    email: s.string().email().optional(),
    tags: s.array(s.string()).min(1),
    status: s.enum(['active', 'pending', 'banned']),
  })

  it('converts struct schema to valid JSON Schema Draft-07/2020-12', () => {
    const jsonSchema = toJSONSchema(schema.descriptor)

    expect(jsonSchema.type).toBe('object')
    expect(jsonSchema.properties).toBeDefined()

    const props = jsonSchema.properties as Record<string, any>
    expect(props.username.type).toBe('string')
    expect(props.username.minLength).toBe(3)
    expect(props.username.maxLength).toBe(20)
    expect(props.username.title).toBe('User Name')

    expect(props.age.type).toBe('integer')
    expect(props.age.minimum).toBe(0)
    expect(props.age.maximum).toBe(120)
    expect(props.age.default).toBe(18)

    expect(props.email.type).toBe('string')
    expect(props.email.format).toBe('email')

    expect(props.tags.type).toBe('array')
    expect(props.tags.items.type).toBe('string')
    expect(props.tags.minItems).toBe(1)

    expect(props.status.enum).toEqual(['active', 'pending', 'banned'])

    const required = jsonSchema.required as string[]
    expect(required).toContain('username')
    expect(required).toContain('age')
    expect(required).toContain('tags')
    expect(required).toContain('status')
    expect(required).not.toContain('email')
  })

  it('re-hydrates a struct schema from standard JSON Schema', () => {
    const jsonSchema = toJSONSchema(schema.descriptor)
    const restored = fromJSONSchema(jsonSchema)

    const testData = {
      username: 'johndoe',
      age: 25,
      tags: ['hero', 'ranger'],
      status: 'active',
    }

    const validated = restored.parse(testData)
    expect(validated.username).toBe('johndoe')
    expect(validated.age).toBe(25)
    expect(validated.tags).toEqual(['hero', 'ranger'])
    expect(validated.status).toBe('active')
  })
})
