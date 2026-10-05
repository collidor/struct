import { describe, it, expect } from 'vitest'
import { s } from '../src/builders/index'

describe('StructSchema.named', () => {
  it('stores the component name in the descriptor without mutating the original', () => {
    const base = s.struct({ x: s.number() })
    const Position = base.named('Position')
    expect(Position.descriptor.name).toBe('Position')
    expect(base.descriptor.name).toBeUndefined()
  })

  it('keeps the name through modifiers and still validates', () => {
    const Position = s.struct({ x: s.number() }).named('Position')
    const opt = Position.optional() as any
    expect(opt.descriptor.name).toBe('Position')
    expect(Position.parse({ x: 1 })).toEqual({ x: 1 })
  })
})
