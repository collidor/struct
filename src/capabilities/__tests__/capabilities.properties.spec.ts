import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getComponent,
  hasComponent,
  satisfies,
  extractComponents,
  StandardComponents,
  ComponentResolutionError,
} from '../index'

describe('Property-Based Invariants (fast-check)', () => {
  const Position = StandardComponents.Position
  const Health = StandardComponents.Health

  it('Property 1: Casing Invariance & Value Equivalence for valid coordinates', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -10000, max: 10000 }),
          y: fc.integer({ min: -10000, max: 10000 }),
          z: fc.option(fc.integer({ min: -10000, max: 10000 }), { nil: undefined }),
        }),
        fc.constantFrom('position', 'Position'),
        (coords, casing) => {
          const entity = { [casing]: coords }
          expect(hasComponent(entity, Position)).toBe(true)
          const extracted = getComponent(entity, Position)
          expect(extracted.x).toBe(coords.x)
          expect(extracted.y).toBe(coords.y)
          if (coords.z !== undefined) {
            expect(extracted.z).toBe(coords.z)
          }
        },
      ),
    )
  })

  it('Property 2: Deterministic Ambiguity Rejection', () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer(), y: fc.integer() }),
        fc.record({ x: fc.integer(), y: fc.integer() }),
        (pos1, pos2) => {
          const ambiguous = {
            position: pos1,
            Position: pos2,
          }
          expect(hasComponent(ambiguous, Position)).toBe(false)
          expect(() => getComponent(ambiguous, Position)).toThrow(ComponentResolutionError)
          expect(() => getComponent(ambiguous, Position)).toThrow('Ambiguous')
        },
      ),
    )
  })

  it('Property 3: Conjunction and Vacuous Truth Laws', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ x: fc.integer(), y: fc.integer() }), { nil: undefined }),
        fc.option(fc.record({ hp: fc.integer({ min: 1, max: 1000 }) }), { nil: undefined }),
        fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()),
        (pos, hp, noise) => {
          const entity: Record<string, unknown> = { ...noise }
          if (pos !== undefined) entity.position = pos
          if (hp !== undefined) entity.health = hp

          // Vacuous truth
          expect(satisfies(entity)).toBe(true)

          // Conjunction law: satisfies(H, A, B) === satisfies(H, A) && satisfies(H, B)
          const hasPos = hasComponent(entity, Position)
          const hasHp = hasComponent(entity, Health)
          expect(satisfies(entity, Position, Health)).toBe(hasPos && hasHp)
        },
      ),
    )
  })

  it('Property 4: Noise Resilience (Noise Isolation Invariant)', () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer(), y: fc.integer() }),
        fc.dictionary(
          fc.string({ minLength: 1 }).filter((k) => k !== 'position' && k !== 'Position'),
          fc.jsonValue(),
        ),
        (coords, noise) => {
          const entity = { ...noise, position: coords }
          expect(hasComponent(entity, Position)).toBe(true)
          const single = extractComponents(entity, Position)
          expect(single).toEqual(coords)
        },
      ),
    )
  })

  it('Property 5: Corruption Rejection (Mismatched Field Types)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.boolean(),
          fc.array(fc.integer()),
          fc.record({ invalidField: fc.string() }),
        ),
        (corrupted) => {
          const entity = { position: corrupted }
          expect(hasComponent(entity, Position)).toBe(false)
          expect(() => getComponent(entity, Position)).toThrow(ComponentResolutionError)
        },
      ),
    )
  })
})
