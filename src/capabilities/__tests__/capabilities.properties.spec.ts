import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { s } from '../../builders/index'
import {
  getComponent,
  hasComponent,
  satisfies,
  extractComponents,
  getComponentName,
  getComponentKeys,
  StandardComponents,
  ComponentResolutionError,
} from '../index'

describe('Expanded Property-Based Invariant Verification (fast-check)', () => {
  const { Position, Health, Velocity, Combatant } = StandardComponents

  // Arbitrary generator for valid Position data
  const arbPosition = fc.record({
    x: fc.integer({ min: -100_000, max: 100_000 }),
    y: fc.integer({ min: -100_000, max: 100_000 }),
    z: fc.option(fc.integer({ min: -100_000, max: 100_000 }), { nil: undefined }),
  })

  // Arbitrary generator for valid Health data
  const arbHealth = fc.record({
    hp: fc.integer({ min: 0, max: 10_000 }),
    max_hp: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: undefined }),
  })

  // Arbitrary generator for valid Velocity data
  const arbVelocity = fc.record({
    vx: fc.integer({ min: -10_000, max: 10_000 }),
    vy: fc.integer({ min: -10_000, max: 10_000 }),
  })

  // Arbitrary generator for valid Combatant data
  const arbCombatant = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    initiative: fc.option(fc.integer({ min: -10, max: 50 }), { nil: undefined }),
    is_active: fc.option(fc.boolean(), { nil: undefined }),
  })

  // Arbitrary generator for noise dictionary (disallowing standard component names)
  const arbNoise = fc.dictionary(
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((k) => !/^(position|health|velocity|combatant)$/i.test(k)),
    fc.jsonValue(),
  )

  // Arbitrary generator for hostile/adversarial non-valid values
  const arbHostileValue = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.integer(),
    fc.float(),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity),
    fc.string(),
    fc.boolean(),
    fc.array(fc.jsonValue()),
    fc.record({ bogusProp: fc.string() }),
  )

  // 1. Casing Invariance across ALL 4 standard components
  it('Property 1: Casing Invariance & Value Equivalence across all StandardComponents (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbPosition,
        arbHealth,
        arbVelocity,
        arbCombatant,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (pos, hp, vel, comb, upperPos, upperHp, upperVel, upperComb) => {
          const entity: Record<string, unknown> = {
            [upperPos ? 'Position' : 'position']: pos,
            [upperHp ? 'Health' : 'health']: hp,
            [upperVel ? 'Velocity' : 'velocity']: vel,
            [upperComb ? 'Combatant' : 'combatant']: comb,
          }

          expect(hasComponent(entity, Position)).toBe(true)
          expect(hasComponent(entity, Health)).toBe(true)
          expect(hasComponent(entity, Velocity)).toBe(true)
          expect(hasComponent(entity, Combatant)).toBe(true)

          expect(getComponent(entity, Position)).toEqual(pos)
          expect(getComponent(entity, Health)).toEqual(hp)
          expect(getComponent(entity, Velocity)).toEqual(vel)
          expect(getComponent(entity, Combatant)).toEqual(comb)
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 2. Dynamic Named Struct Generation with Random Names and Schemas
  it('Property 2: Arbitrary Dynamic Named Struct Synthesis (1,000 runs)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z][a-zA-Z0-9]{1,12}$/),
        fc.integer({ min: -5000, max: 5000 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.boolean(),
        fc.boolean(),
        (compName, intVal, strVal, boolVal, useUpper) => {
          const dynamicComponent = s.struct(compName, {
            num: s.number(),
            str: s.string(),
            flag: s.boolean(),
          })

          const data = { num: intVal, str: strVal, flag: boolVal }
          const propKey = useUpper
            ? compName.charAt(0).toUpperCase() + compName.slice(1)
            : compName.charAt(0).toLowerCase() + compName.slice(1)

          const entity = { [propKey]: data }

          expect(getComponentName(dynamicComponent)).toBe(compName)
          expect(hasComponent(entity, dynamicComponent)).toBe(true)
          expect(getComponent(entity, dynamicComponent)).toEqual(data)

          // Extraction matches single component output
          expect(extractComponents(entity, dynamicComponent)).toEqual(data)
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 3. Ambiguity Invariant: Both casings present ALWAYS rejected deterministically
  it('Property 3: Ambiguity Invariant across arbitrary payloads (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbPosition,
        arbPosition,
        arbNoise,
        (posLower, posUpper, noise) => {
          const entity = {
            ...noise,
            position: posLower,
            Position: posUpper,
          }

          expect(hasComponent(entity, Position)).toBe(false)
          expect(() => getComponent(entity, Position)).toThrow(ComponentResolutionError)
          expect(() => getComponent(entity, Position)).toThrow('Ambiguous "Position" component')
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 4. Noise Resilience Invariant: Arbitrary surrounding state never pollutes extracted component data
  it('Property 4: Noise Isolation Invariant (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbPosition,
        arbHealth,
        arbNoise,
        (pos, hp, noise) => {
          const entity = {
            ...noise,
            position: pos,
            health: hp,
          }

          expect(hasComponent(entity, Position)).toBe(true)
          expect(hasComponent(entity, Health)).toBe(true)

          // Single extraction returns raw component payload without any noise
          const extractedSingle = extractComponents(entity, Position)
          expect(extractedSingle).toEqual(pos)

          // Multiple extraction returns keyed dictionary with strictly the requested components
          const extractedMulti = extractComponents(entity, Position, Health)
          expect(extractedMulti).toEqual({
            position: pos,
            health: hp,
          })
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 5. Conjunction and Vacuous Truth Laws across all 4 components
  it('Property 5: Boolean Lattice & Conjunction Laws for arbitrary component combinations (1,000 runs)', () => {
    fc.assert(
      fc.property(
        fc.option(arbPosition, { nil: undefined }),
        fc.option(arbHealth, { nil: undefined }),
        fc.option(arbVelocity, { nil: undefined }),
        fc.option(arbCombatant, { nil: undefined }),
        arbNoise,
        (pos, hp, vel, comb, noise) => {
          const entity: Record<string, unknown> = { ...noise }
          if (pos !== undefined) entity.position = pos
          if (hp !== undefined) entity.health = hp
          if (vel !== undefined) entity.velocity = vel
          if (comb !== undefined) entity.combatant = comb

          // Law 1: Vacuous truth on empty constraint list
          expect(satisfies(entity)).toBe(true)

          const bPos = hasComponent(entity, Position)
          const bHp = hasComponent(entity, Health)
          const bVel = hasComponent(entity, Velocity)
          const bComb = hasComponent(entity, Combatant)

          // Law 2: satisfies(E, C1, C2) === hasComponent(E, C1) && hasComponent(E, C2)
          expect(satisfies(entity, Position, Health)).toBe(bPos && bHp)
          expect(satisfies(entity, Velocity, Combatant)).toBe(bVel && bComb)
          expect(satisfies(entity, Position, Health, Velocity, Combatant)).toBe(
            bPos && bHp && bVel && bComb,
          )
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 6. Adversarial Input Fuzzing: Non-objects, null, undefined, primitives never throw unhandled errors
  it('Property 6: Adversarial Robustness against hostile inputs (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbHostileValue,
        (hostile) => {
          // hasComponent must return false and NEVER crash or throw
          expect(hasComponent(hostile, Position)).toBe(false)
          expect(hasComponent(hostile, Health)).toBe(false)

          // satisfies must return false for hostile input with at least one component
          expect(satisfies(hostile, Position)).toBe(false)

          // getComponent must throw ComponentResolutionError and never unhandled TypeError
          expect(() => getComponent(hostile, Position)).toThrow(ComponentResolutionError)
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 7. Multi-Layer Symmetry: Runtime Object vs StructSchema vs AST Descriptor
  it('Property 7: Tri-layer Symmetry (Entity, StructSchema, AST Descriptor) (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbPosition,
        fc.boolean(),
        (coords, matchCorrectType) => {
          const fieldSchema = matchCorrectType ? Position : s.string()
          const entity = { position: coords }
          const schema = s.struct({ position: fieldSchema })
          const descriptor = schema.descriptor

          if (matchCorrectType) {
            expect(hasComponent(entity, Position)).toBe(true)
            expect(hasComponent(schema, Position)).toBe(true)
            expect(hasComponent(descriptor, Position)).toBe(true)
          } else {
            // Poisoned type (string instead of Position) must NEVER satisfy Position on schema or descriptor
            expect(hasComponent(schema, Position)).toBe(false)
            expect(hasComponent(descriptor, Position)).toBe(false)
          }
        },
      ),
      { numRuns: 1000 },
    )
  })

  // 8. Key Derivation Property: lowerFirst and upperFirst consistency
  it('Property 8: ComponentKey Derivation Bijective Consistency (1,000 runs)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/),
        (rawName) => {
          const keys = getComponentKeys(rawName)
          expect(keys.length).toBeGreaterThanOrEqual(1)
          expect(keys.length).toBeLessThanOrEqual(2)

          const firstChar = rawName.charAt(0)
          const lowerKey = firstChar.toLowerCase() + rawName.slice(1)
          const upperKey = firstChar.toUpperCase() + rawName.slice(1)

          expect(keys).toContain(lowerKey)
          expect(keys).toContain(upperKey)
        },
      ),
      { numRuns: 1000 },
    )
  })
})
