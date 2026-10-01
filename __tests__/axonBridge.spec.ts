import { describe, it, expect } from 'vitest'
import { s, toAxonPort, isAssignable, getAxonDataType } from '../src'

describe('Axon Graph Engine Bridge', () => {
  it('generates port contracts and dataType identifiers', () => {
    const CharacterSchema = s.struct(
      {
        id: s.string(),
        hp: s.integer(),
      },
      { name: 'Character' },
    )

    expect(getAxonDataType(s.number())).toBe('number')
    expect(getAxonDataType(s.integer())).toBe('integer')
    expect(getAxonDataType(s.string().format('email'))).toBe('string:email')
    expect(getAxonDataType(s.array(s.number()))).toBe('array:number')
    expect(getAxonDataType(CharacterSchema)).toBe('struct:Character')

    const port = toAxonPort('characterIn', CharacterSchema)
    expect(port.name).toBe('characterIn')
    expect(port.dataType).toBe('struct:Character')
    expect(port.validate({ id: 'c1', hp: 100 })).toBe(true)
    expect(port.validate({ id: 'c1', hp: 'bad' })).toBe(false)
  })

  describe('isAssignable() Type Assignability & Socket Compatibility', () => {
    it('allows identical primitive types', () => {
      expect(isAssignable(s.number(), s.number())).toBe(true)
      expect(isAssignable(s.string(), s.string())).toBe(true)
      expect(isAssignable(s.boolean(), s.boolean())).toBe(true)
    })

    it('allows integer to flow into number, but not vice-versa', () => {
      expect(isAssignable(s.integer(), s.number())).toBe(true)
      expect(isAssignable(s.number(), s.integer())).toBe(false)
    })

    it('allows any target to accept everything', () => {
      expect(isAssignable(s.number(), s.any())).toBe(true)
      expect(isAssignable(s.struct({ a: s.string() }), s.any())).toBe(true)
    })

    it('checks structural assignability for structs', () => {
      const sourceStruct = s.struct({
        name: s.string(),
        age: s.integer(),
        extraInfo: s.string(),
      })

      const targetStruct = s.struct({
        name: s.string(),
        age: s.number(),
      })

      const strictTargetStruct = s.struct({
        name: s.string(),
        age: s.number(),
        secretCode: s.string(),
      })

      // Source has name and age (and age is integer -> number)
      expect(isAssignable(sourceStruct, targetStruct)).toBe(true)

      // Strict target requires secretCode which source does not have
      expect(isAssignable(sourceStruct, strictTargetStruct)).toBe(false)
    })

    it('checks array assignability', () => {
      expect(isAssignable(s.array(s.integer()), s.array(s.number()))).toBe(true)
      expect(isAssignable(s.array(s.string()), s.array(s.number()))).toBe(false)
    })

    it('checks union assignability', () => {
      const numOrStr = s.union([s.number(), s.string()])
      expect(isAssignable(s.number(), numOrStr)).toBe(true)
      expect(isAssignable(s.string(), numOrStr)).toBe(true)
      expect(isAssignable(s.boolean(), numOrStr)).toBe(false)
    })
  })
})
