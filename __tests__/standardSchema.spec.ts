import { describe, it, expect } from 'vitest'
import { s } from '../src'

describe('Standard Schema v1 Specification Compliance', () => {
  const schema = s.struct({
    name: s.string().min(2),
    score: s.integer().min(0),
  })

  it('exposes ~standard properties according to spec', () => {
    expect(schema['~standard']).toBeDefined()
    expect(schema['~standard'].version).toBe(1)
    expect(schema['~standard'].vendor).toBe('collidor-struct')
    expect(typeof schema['~standard'].validate).toBe('function')
  })

  it('returns success result for valid input', () => {
    const result = schema['~standard'].validate({
      name: 'Valid Name',
      score: 100,
    })
    expect('value' in result).toBe(true)
    const success = result as { value: { name: string; score: number } }
    expect(success.value).toEqual({ name: 'Valid Name', score: 100 })
  })

  it('returns failure result with structured issues for invalid input', () => {
    const result = schema['~standard'].validate({
      name: 'X',
      score: -5,
    })
    expect('issues' in result).toBe(true)
    const failure = result as { issues: Array<{ message: string; path?: unknown }> }
    expect(failure.issues.length).toBe(2)
    expect(failure.issues[0]?.message).toBeDefined()
    expect(failure.issues[0]?.path).toBeDefined()
  })
})
