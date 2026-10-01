import { describe, it, expect } from 'vitest'
import { s } from '../../builders/index'
import { CapabilityValidator, StandardCapabilities } from '../index'

describe('Structural Capability Validator (Odin-Inspired)', () => {
  it('validates struct descriptors against standard capabilities', () => {
    const TokenStruct = s.struct({
      label: s.string(),
      x: s.number(),
      y: s.number(),
    })

    const result = CapabilityValidator.validateDescriptor(
      TokenStruct.descriptor,
      StandardCapabilities.HasPosition,
    )
    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)

    const NonSpatialStruct = s.struct({
      name: s.string(),
      description: s.string(),
    })

    const failResult = CapabilityValidator.validateDescriptor(
      NonSpatialStruct.descriptor,
      StandardCapabilities.HasPosition,
    )
    expect(failResult.valid).toBe(false)
    expect(failResult.missingFields).toContain('x')
    expect(failResult.missingFields).toContain('y')
  })

  it('validates dynamic runtime entity records against structural capabilities', () => {
    const goblinEntity = {
      id: 'goblin_1',
      name: 'Goblin Scout',
      x: 100,
      y: 250,
      hp: 12,
      max_hp: 12,
    }

    expect(CapabilityValidator.satisfies(goblinEntity, StandardCapabilities.HasPosition)).toBe(true)
    expect(CapabilityValidator.satisfies(goblinEntity, StandardCapabilities.HasHealth)).toBe(true)
    expect(CapabilityValidator.satisfies(goblinEntity, StandardCapabilities.HasCombatant)).toBe(
      true,
    )
    expect(CapabilityValidator.satisfies(goblinEntity, StandardCapabilities.HasVelocity)).toBe(
      false,
    )
  })
})
