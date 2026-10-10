import { describe, it, expect } from 'vitest'
import { s } from '../../builders/index'
import {
  getComponent,
  hasComponent,
  satisfies,
  extractComponents,
  StandardComponents,
  StandardCapabilities,
  CapabilityValidator,
  ComponentResolutionError,
} from '../index'

describe('Odin-Inspired Named Component Capabilities', () => {
  it('supports s.struct("Name", shape) and s.struct(shape).named("Name")', () => {
    const PosA = s.struct('Position', {
      x: s.number(),
      y: s.number(),
    })
    const PosB = s.struct({
      x: s.number(),
      y: s.number(),
    }).named('Position')

    expect(PosA.name).toBe('Position')
    expect(PosA.descriptor.name).toBe('Position')
    expect(PosB.name).toBe('Position')
    expect(PosB.descriptor.name).toBe('Position')
  })

  it('resolves component from lowercase or uppercase property names', () => {
    const Position = StandardComponents.Position

    const goblinLower = { id: 'g1', position: { x: 10, y: 20 } }
    const goblinUpper = { id: 'g2', Position: { x: 30, y: 40 } }

    expect(getComponent(goblinLower, Position)).toEqual({ x: 10, y: 20 })
    expect(getComponent(goblinUpper, Position)).toEqual({ x: 30, y: 40 })
  })

  it('throws ComponentResolutionError when component is missing or non-object', () => {
    const Position = StandardComponents.Position

    expect(() => getComponent(null, Position)).toThrow(ComponentResolutionError)
    expect(() => getComponent({ id: 'g1' }, Position)).toThrow(
      'Object has no "Position" component (looked for "position", "Position")',
    )
  })

  it('throws ComponentResolutionError when component is ambiguous (both cases present)', () => {
    const Position = StandardComponents.Position
    const ambiguous = {
      position: { x: 1, y: 2 },
      Position: { x: 3, y: 4 },
    }

    expect(() => getComponent(ambiguous, Position)).toThrow(
      'Ambiguous "Position" component: found under "position", "Position"',
    )
  })

  it('throws ComponentResolutionError when component data fails validation', () => {
    const Position = StandardComponents.Position
    const invalidGoblin = { position: { x: 'invalid', y: 20 } }

    expect(() => getComponent(invalidGoblin, Position)).toThrow(ComponentResolutionError)
    expect(() => getComponent(invalidGoblin, Position)).toThrow('Invalid "Position" component at "position"')
  })

  it('checks hasComponent for runtime entities, StructSchema, and AST descriptors', () => {
    const Position = StandardComponents.Position
    const Health = StandardComponents.Health

    const entity = { position: { x: 5, y: 10 } }
    expect(hasComponent(entity, Position)).toBe(true)
    expect(hasComponent(entity, Health)).toBe(false)

    const EntityStruct = s.struct({
      position: Position,
    })
    expect(hasComponent(EntityStruct, Position)).toBe(true)
    expect(hasComponent(EntityStruct, Health)).toBe(false)

    expect(hasComponent(EntityStruct.descriptor, Position)).toBe(true)
    expect(hasComponent(EntityStruct.descriptor, Health)).toBe(false)
  })

  it('evaluates satisfies with multiple components', () => {
    const goblin = {
      id: 'goblin_1',
      position: { x: 100, y: 250 },
      health: { hp: 12, max_hp: 12 },
      combatant: { name: 'Goblin Scout' },
    }

    expect(satisfies(goblin, StandardComponents.Position)).toBe(true)
    expect(satisfies(goblin, StandardComponents.Position, StandardComponents.Health)).toBe(true)
    expect(
      satisfies(
        goblin,
        StandardComponents.Position,
        StandardComponents.Health,
        StandardComponents.Combatant,
      ),
    ).toBe(true)
    expect(satisfies(goblin, StandardComponents.Velocity)).toBe(false)
    expect(satisfies(goblin, StandardComponents.Position, StandardComponents.Velocity)).toBe(false)
  })

  it('extracts components cleanly (single vs multiple)', () => {
    const goblin = {
      id: 'goblin_1',
      position: { x: 10, y: 20 },
      health: { hp: 50 },
    }

    const single = extractComponents(goblin, StandardComponents.Position)
    expect(single).toEqual({ x: 10, y: 20 })

    const multiple = extractComponents(
      goblin,
      StandardComponents.Position,
      StandardComponents.Health,
    )
    expect(multiple).toEqual({
      position: { x: 10, y: 20 },
      health: { hp: 50 },
    })
  })

  it('preserves backwards-compatibility with CapabilityValidator and StandardCapabilities', () => {
    const goblin = {
      position: { x: 10, y: 20 },
      health: { hp: 30 },
    }

    expect(StandardCapabilities.HasPosition).toBe(StandardComponents.Position)
    expect(StandardCapabilities.HasHealth).toBe(StandardComponents.Health)
    expect(StandardCapabilities.HasVelocity).toBe(StandardComponents.Velocity)
    expect(StandardCapabilities.HasCombatant).toBe(StandardComponents.Combatant)
    expect(CapabilityValidator.satisfies(goblin, StandardCapabilities.HasPosition)).toBe(true)
    expect(CapabilityValidator.satisfies(goblin, StandardCapabilities.HasVelocity)).toBe(false)

    const descResult = CapabilityValidator.validateDescriptor(
      s.struct({ position: StandardComponents.Position }).descriptor,
      StandardCapabilities.HasPosition,
    )
    expect(descResult.valid).toBe(true)
  })

  it('correctly handles vacuous truth and rejects mismatched field types on StructSchema', () => {
    const goblin = { id: 'goblin_1' }
    // Vacuous satisfaction over 0 constraints
    expect(satisfies(goblin)).toBe(true)

    // StructSchema with a field named position, but of wrong schema type (string instead of Position)
    const InvalidStruct = s.struct({
      position: s.string(),
    })
    expect(hasComponent(InvalidStruct, StandardComponents.Position)).toBe(false)
    expect(hasComponent(InvalidStruct.descriptor, StandardComponents.Position)).toBe(false)
  })
})
