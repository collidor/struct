import { describe, it, expect, expectTypeOf } from 'vitest'
import { z } from 'zod'
import {
  s,
  DiscriminatedUnionSchema,
  UnionSchema,
  toJSONSchema,
  fromJSONSchema,
  toZod,
  fromZodV3,
  type Out,
  type In,
  type Infer,
} from '../src'
import { f } from '../src/form'

describe('Discriminated Unions', () => {
  describe('from struct variants with literal or enum discriminator properties', () => {
    it('discriminates variants sharing a literal property and narrows types', () => {
      const WeaponSchema = s.struct({
        type: s.literal('ItemWeapon'),
        damage: s.number().positive(),
      })
      const ArmorSchema = s.struct({
        type: s.literal('ItemArmor'),
        defense: s.number().nonnegative(),
      })

      const ItemPropertiesSchema = s.discriminatedUnion('type', [WeaponSchema, ArmorSchema])
      type ItemProperties = Out<typeof ItemPropertiesSchema>

      expect(ItemPropertiesSchema).toBeInstanceOf(DiscriminatedUnionSchema)
      expect(ItemPropertiesSchema).toBeInstanceOf(UnionSchema)
      expect(ItemPropertiesSchema.discriminator).toBe('type')
      expect(ItemPropertiesSchema.descriptor.discriminator).toBe('type')
      expect(ItemPropertiesSchema.discriminatorValues).toEqual(['ItemWeapon', 'ItemArmor'])

      expectTypeOf<ItemProperties>().toEqualTypeOf<
        { type: 'ItemWeapon'; damage: number } | { type: 'ItemArmor'; defense: number }
      >()
      expectTypeOf<In<typeof ItemPropertiesSchema>>().toEqualTypeOf<ItemProperties>()
      expectTypeOf<Infer<typeof ItemPropertiesSchema>>().toEqualTypeOf<ItemProperties>()

      const parsedWeapon = ItemPropertiesSchema.parse({ type: 'ItemWeapon', damage: 25 })
      expect(parsedWeapon).toEqual({ type: 'ItemWeapon', damage: 25 })
      if (parsedWeapon.type === 'ItemWeapon') {
        expectTypeOf(parsedWeapon.damage).toEqualTypeOf<number>()
        expect(parsedWeapon.damage).toBe(25)
      }

      const parsedArmor = ItemPropertiesSchema.parse({ type: 'ItemArmor', defense: 12 })
      expect(parsedArmor).toEqual({ type: 'ItemArmor', defense: 12 })

      expect(ItemPropertiesSchema.getVariant('ItemWeapon')).toBe(WeaponSchema)
      expect(ItemPropertiesSchema.getVariant('ItemArmor')).toBe(ArmorSchema)
    })

    it('supports variants whose discriminator field is an EnumSchema (single or multi-value)', () => {
      const MeleeSchema = s.struct({
        type: s.enum(['Sword', 'Axe']),
        reach: s.number(),
      })
      const RangedSchema = s.struct({
        type: s.literal('Bow'),
        range: s.number(),
      })

      const WeaponSchema = s.discriminatedUnion('type', [MeleeSchema, RangedSchema])
      type Weapon = Out<typeof WeaponSchema>

      expectTypeOf<Weapon>().toEqualTypeOf<
        { type: 'Sword' | 'Axe'; reach: number } | { type: 'Bow'; range: number }
      >()
      expect(WeaponSchema.discriminatorValues).toEqual(['Sword', 'Axe', 'Bow'])

      expect(WeaponSchema.parse({ type: 'Sword', reach: 2 })).toEqual({ type: 'Sword', reach: 2 })
      expect(WeaponSchema.parse({ type: 'Axe', reach: 1.5 })).toEqual({ type: 'Axe', reach: 1.5 })
      expect(WeaponSchema.parse({ type: 'Bow', range: 30 })).toEqual({ type: 'Bow', range: 30 })
      expect(WeaponSchema.safeParse({ type: 'Sword', range: 30 }).success).toBe(false)
    })

    it('supports numeric and boolean literal discriminators and single-variant unions', () => {
      const Single = s.discriminatedUnion('type', [
        s.struct({ type: s.literal('ItemWeapon'), damage: s.number() }),
      ])
      expectTypeOf<Out<typeof Single>>().toEqualTypeOf<{ type: 'ItemWeapon'; damage: number }>()
      expect(Single.parse({ type: 'ItemWeapon', damage: 10 })).toEqual({
        type: 'ItemWeapon',
        damage: 10,
      })

      const ResultSchema = s.discriminatedUnion('ok', [
        s.struct({ ok: s.literal(true), value: s.string() }),
        s.struct({ ok: s.literal(false), error: s.string() }),
      ])
      expectTypeOf<Out<typeof ResultSchema>>().toEqualTypeOf<
        { ok: true; value: string } | { ok: false; error: string }
      >()
      expect(ResultSchema.parse({ ok: true, value: 'hi' })).toEqual({ ok: true, value: 'hi' })
      expect(ResultSchema.parse({ ok: false, error: 'boom' })).toEqual({ ok: false, error: 'boom' })
    })

    it('reports precise errors for non-objects, invalid discriminators, and matched-variant field failures', () => {
      const ItemProps = s.discriminatedUnion('type', [
        s.struct({ type: s.literal('ItemWeapon'), damage: s.number() }),
        s.struct({ type: s.literal('ItemArmor'), defense: s.number() }),
      ])
      const ItemSchema = s.struct({
        id: s.string(),
        properties: ItemProps,
      })

      // 1. Non-object
      const nonObj = ItemProps.safeParse('nope')
      expect(nonObj.success).toBe(false)
      if (!nonObj.success) {
        expect(nonObj.issues[0].code).toBe('invalid_type')
        expect(nonObj.issues[0].path).toEqual([])
      }

      // 2. Invalid discriminator (nested path)
      const badDisc = ItemSchema.safeParse({ id: '1', properties: { type: 'ItemPotion' } })
      expect(badDisc.success).toBe(false)
      if (!badDisc.success) {
        expect(badDisc.issues[0].code).toBe('invalid_union_discriminator')
        expect(badDisc.issues[0].path).toEqual(['properties', 'type'])
        expect(badDisc.issues[0].message).toContain('"ItemWeapon"')
        expect(badDisc.issues[0].message).toContain('"ItemArmor"')
      }

      // 3. Matched variant with invalid field -> specific field path, NOT generic invalid_union
      const badField = ItemSchema.safeParse({
        id: '1',
        properties: { type: 'ItemWeapon', damage: 'high' },
      })
      expect(badField.success).toBe(false)
      if (!badField.success) {
        expect(badField.issues[0].code).toBe('invalid_type')
        expect(badField.issues[0].path).toEqual(['properties', 'damage'])
      }
    })

    it('rejects duplicate discriminator values and invalid variants at construction time', () => {
      const A = s.struct({ type: s.literal('dup'), a: s.string() })
      const B = s.struct({ type: s.literal('dup'), b: s.number() })
      expect(() => s.discriminatedUnion('type', [A, B])).toThrow(/Duplicate discriminator value/)

      const C = s.struct({ type: s.enum(['x', 'y']), a: s.string() })
      const D = s.struct({ type: s.literal('y'), b: s.number() })
      expect(() => s.discriminatedUnion('type', [C, D])).toThrow(/Duplicate discriminator value/)

      expect(() => {
        // @ts-expect-error empty variants tuple is not allowed
        s.discriminatedUnion('type', [])
      }).toThrow(/at least one variant/)

      const MissingDisc = s.struct({ kind: s.literal('a') })
      expect(() => {
        // @ts-expect-error variant is missing 'type' discriminator property
        s.discriminatedUnion('type', [MissingDisc])
      }).toThrow(TypeError)

      const DynamicDisc = s.struct({ type: s.string() })
      expect(() => {
        // @ts-expect-error discriminator property must be literal or enum, not string
        s.discriminatedUnion('type', [DynamicDisc])
      }).toThrow(TypeError)
    })
  })

  describe('from an EnumSchema (exhaustive map)', () => {
    it('creates an exhaustive discriminated union with s.discriminatedUnion(key, enumSchema, map)', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])

      const ItemPropertiesSchema = s.discriminatedUnion('type', ItemPropertiesTypeSchema, {
        ItemWeapon: s.struct({ damage: s.number() }),
        ItemArmor: s.struct({ defense: s.number(), slot: s.string().optional() }),
      })

      type ItemProperties = Out<typeof ItemPropertiesSchema>
      expectTypeOf<ItemProperties>().toEqualTypeOf<
        | { type: 'ItemWeapon'; damage: number }
        | { type: 'ItemArmor'; defense: number; slot?: string | undefined }
      >()

      expect(ItemPropertiesSchema).toBeInstanceOf(DiscriminatedUnionSchema)
      expect(ItemPropertiesSchema.discriminator).toBe('type')
      expect(ItemPropertiesSchema.discriminatorValues).toEqual(['ItemWeapon', 'ItemArmor'])

      expect(ItemPropertiesSchema.parse({ type: 'ItemWeapon', damage: 40 })).toEqual({
        type: 'ItemWeapon',
        damage: 40,
      })
      expect(ItemPropertiesSchema.parse({ type: 'ItemArmor', defense: 15 })).toEqual({
        type: 'ItemArmor',
        defense: 15,
      })
      expect(ItemPropertiesSchema.safeParse({ type: 'ItemWeapon' }).success).toBe(false)
    })

    it('works via enumSchema.discriminatedUnion(key, map) and f.discriminatedUnion(...)', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemConsumable'])

      const fromMethod = ItemPropertiesTypeSchema.discriminatedUnion('type', {
        ItemWeapon: s.struct({ damage: s.number() }),
        ItemConsumable: { heal: s.number() }, // plain field shape supported too
      })

      expectTypeOf<Out<typeof fromMethod>>().toEqualTypeOf<
        { type: 'ItemWeapon'; damage: number } | { type: 'ItemConsumable'; heal: number }
      >()

      expect(fromMethod.parse({ type: 'ItemWeapon', damage: 5 })).toEqual({
        type: 'ItemWeapon',
        damage: 5,
      })
      expect(fromMethod.parse({ type: 'ItemConsumable', heal: 20 })).toEqual({
        type: 'ItemConsumable',
        heal: 20,
      })

      const fromForm = f.discriminatedUnion('type', ItemPropertiesTypeSchema, {
        ItemWeapon: s.struct({ damage: s.number() }),
        ItemConsumable: s.struct({ heal: s.number() }),
      })
      expectTypeOf<Out<typeof fromForm>>().toEqualTypeOf<
        { type: 'ItemWeapon'; damage: number } | { type: 'ItemConsumable'; heal: number }
      >()
      expect(fromForm.parse({ type: 'ItemConsumable', heal: 10 })).toEqual({
        type: 'ItemConsumable',
        heal: 10,
      })
    })

    it('accepts variants that already declare the matching discriminator and preserves struct options', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])

      const WeaponSchema = s
        .struct('Weapon', {
          type: ItemPropertiesTypeSchema.literal('ItemWeapon'),
          damage: s.number(),
        })
        .strict()
        .refine((w) => w.damage > 0, 'Damage must be positive')

      const ArmorSchema = s
        .struct({
          defense: s.number(),
        })
        .strict()

      const ItemProps = s.discriminatedUnion('type', ItemPropertiesTypeSchema, {
        ItemWeapon: WeaponSchema,
        ItemArmor: ArmorSchema,
      })

      expectTypeOf<Out<typeof ItemProps>>().toEqualTypeOf<
        { type: 'ItemWeapon'; damage: number } | { type: 'ItemArmor'; defense: number }
      >()

      // Preserves refinement on existing struct
      const badDamage = ItemProps.safeParse({ type: 'ItemWeapon', damage: 0 })
      expect(badDamage.success).toBe(false)
      if (!badDamage.success) {
        expect(badDamage.issues[0].message).toBe('Damage must be positive')
      }

      // Preserves strict mode on both existing and auto-injected structs
      expect(ItemProps.safeParse({ type: 'ItemWeapon', damage: 5, extra: true }).success).toBe(false)
      expect(ItemProps.safeParse({ type: 'ItemArmor', defense: 5, extra: true }).success).toBe(false)
    })

    it('works with numeric enums while preserving number types at runtime and compile time', () => {
      const HttpCode = s.enum([200, 404])
      const ResponseSchema = s.discriminatedUnion('status', HttpCode, {
        200: s.struct({ body: s.string() }),
        404: s.struct({ message: s.string() }),
      })

      expectTypeOf<Out<typeof ResponseSchema>>().toEqualTypeOf<
        { status: 200; body: string } | { status: 404; message: string }
      >()

      expect(ResponseSchema.parse({ status: 200, body: 'ok' })).toEqual({ status: 200, body: 'ok' })
      expect(ResponseSchema.safeParse({ status: '200', body: 'ok' }).success).toBe(false)
    })

    it('enforces exhaustiveness and matching discriminator values at compile time and runtime', () => {
      const ItemType = s.enum(['ItemWeapon', 'ItemArmor'])

      expect(() => {
        // @ts-expect-error missing ItemArmor branch
        s.discriminatedUnion('type', ItemType, {
          ItemWeapon: s.struct({ damage: s.number() }),
        })
      }).toThrow(RangeError)

      expect(() => {
        // @ts-expect-error extra key not in enum
        s.discriminatedUnion('type', ItemType, {
          ItemWeapon: s.struct({ damage: s.number() }),
          ItemArmor: s.struct({ defense: s.number() }),
          ItemExtra: s.struct({ foo: s.string() }),
        })
      }).toThrow(RangeError)

      expect(() => {
        // @ts-expect-error mismatched discriminator literal 'ItemArmor' under key 'ItemWeapon'
        s.discriminatedUnion('type', ItemType, {
          ItemWeapon: s.struct({ type: s.literal('ItemArmor'), damage: s.number() }),
          ItemArmor: s.struct({ defense: s.number() }),
        })
      }).toThrow(RangeError)
    })
  })

  describe('modifiers, async validation, descriptors, and bridges', () => {
    it('supports optional, nullable, default, refinements, and async validation', async () => {
      const ItemProps = s.discriminatedUnion('type', [
        s.struct({
          type: s.literal('ItemWeapon'),
          damage: s.number().refine(async (d) => d <= 100, 'Too much damage'),
        }),
        s.struct({
          type: s.literal('ItemArmor'),
          defense: s.number(),
        }),
      ])

      const opt = ItemProps.optional()
      expect(opt.parse(undefined)).toBeUndefined()

      const nul = ItemProps.nullable()
      expect(nul.parse(null)).toBeNull()

      const asyncOk = await ItemProps.safeParseAsync({ type: 'ItemWeapon', damage: 50 })
      expect(asyncOk.success).toBe(true)

      const asyncFail = await ItemProps.safeParseAsync({ type: 'ItemWeapon', damage: 999 })
      expect(asyncFail.success).toBe(false)
      if (!asyncFail.success) {
        expect(asyncFail.issues[0].path).toEqual(['damage'])
        expect(asyncFail.issues[0].message).toBe('Too much damage')
      }
    })

    it('round-trips through toJSON()/fromDescriptor(), JSON Schema, and Zod bridges', () => {
      const ItemType = s.enum(['ItemWeapon', 'ItemArmor'])
      const ItemProps = ItemType.discriminatedUnion('type', {
        ItemWeapon: s.struct({ damage: s.number() }),
        ItemArmor: s.struct({ defense: s.number() }),
      })

      // AST Descriptor round-trip
      const restored = s.fromDescriptor(ItemProps.toJSON())
      expect(restored).toBeInstanceOf(DiscriminatedUnionSchema)
      expect((restored as DiscriminatedUnionSchema).discriminator).toBe('type')
      expect(restored.parse({ type: 'ItemWeapon', damage: 10 })).toEqual({
        type: 'ItemWeapon',
        damage: 10,
      })

      // JSON Schema round-trip
      const jsonSchema = toJSONSchema(ItemProps)
      expect(jsonSchema.discriminator).toEqual({ propertyName: 'type' })
      expect(Array.isArray(jsonSchema.oneOf)).toBe(true)

      const fromJson = fromJSONSchema(jsonSchema)
      expect(fromJson).toBeInstanceOf(DiscriminatedUnionSchema)
      expect((fromJson as DiscriminatedUnionSchema).discriminator).toBe('type')
      expect(fromJson.parse({ type: 'ItemArmor', defense: 7 })).toEqual({
        type: 'ItemArmor',
        defense: 7,
      })

      // Zod 3 bridge round-trip
      const zodSchema = toZod(ItemProps)
      expect(zodSchema.safeParse({ type: 'ItemWeapon', damage: 12 }).success).toBe(true)
      expect(zodSchema.safeParse({ type: 'Unknown' }).success).toBe(false)

      const fromZodSchema = fromZodV3(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('ItemWeapon'), damage: z.number() }),
          z.object({ type: z.literal('ItemArmor'), defense: z.number() }),
        ]),
      )
      expect(fromZodSchema).toBeInstanceOf(DiscriminatedUnionSchema)
      expect((fromZodSchema as DiscriminatedUnionSchema).discriminator).toBe('type')
      expect(fromZodSchema.parse({ type: 'ItemWeapon', damage: 3 })).toEqual({
        type: 'ItemWeapon',
        damage: 3,
      })
    })
  })
})
