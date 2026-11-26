import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  s,
  EnumSchema,
  LiteralSchema,
  toJSONSchema,
  toZod,
  type Out,
  type In,
  type Infer,
} from '../src'

describe('Enum const inference and Enum <-> Literal conversions', () => {
  describe('const inference without `as const`', () => {
    it('infers exact literal type from single-element s.enum array', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon'])
      type ItemPropertiesType = Out<typeof ItemPropertiesTypeSchema>

      expectTypeOf<ItemPropertiesType>().toEqualTypeOf<'ItemWeapon'>()
      expectTypeOf<In<typeof ItemPropertiesTypeSchema>>().toEqualTypeOf<'ItemWeapon'>()
      expectTypeOf<Infer<typeof ItemPropertiesTypeSchema>>().toEqualTypeOf<'ItemWeapon'>()
      expectTypeOf(ItemPropertiesTypeSchema.values).toEqualTypeOf<readonly ['ItemWeapon']>()

      expect(ItemPropertiesTypeSchema.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(ItemPropertiesTypeSchema.safeParse('Other').success).toBe(false)
    })

    it('infers exact union from multi-element string, number, and mixed arrays', () => {
      const ItemType = s.enum(['ItemWeapon', 'ItemArmor', 'ItemConsumable'])
      const StatusCode = s.enum([200, 404, 500])
      const Mixed = s.enum(['auto', 0, 1])

      expectTypeOf<Out<typeof ItemType>>().toEqualTypeOf<
        'ItemWeapon' | 'ItemArmor' | 'ItemConsumable'
      >()
      expectTypeOf<Out<typeof StatusCode>>().toEqualTypeOf<200 | 404 | 500>()
      expectTypeOf<Out<typeof Mixed>>().toEqualTypeOf<'auto' | 0 | 1>()

      expect(StatusCode.parse(404)).toBe(404)
      expect(Mixed.parse('auto')).toBe('auto')
      expect(Mixed.parse(1)).toBe(1)
    })

    it('infers const with new EnumSchema(...) and s.enum(...)', () => {
      const direct = new EnumSchema(['ItemWeapon'])
      const formEnum = s.enum(['ItemWeapon', 'ItemArmor'])

      expectTypeOf<Out<typeof direct>>().toEqualTypeOf<'ItemWeapon'>()
      expectTypeOf<Out<typeof formEnum>>().toEqualTypeOf<'ItemWeapon' | 'ItemArmor'>()
    })

    it('remains compatible with `as const` and widened runtime string[] arrays', () => {
      const withConst = s.enum(['red', 'green'] as const)
      expectTypeOf<Out<typeof withConst>>().toEqualTypeOf<'red' | 'green'>()

      const runtimeValues: string[] = ['a', 'b']
      const dynamicEnum = s.enum(runtimeValues)
      expectTypeOf<Out<typeof dynamicEnum>>().toEqualTypeOf<string>()
      expect(dynamicEnum.parse('a')).toBe('a')
      expect(dynamicEnum.safeParse('c').success).toBe(false)
    })
  })

  describe('creating literals from EnumSchema', () => {
    it('creates a single type-checked LiteralSchema with enumSchema.literal(value)', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])
      const WeaponType = ItemPropertiesTypeSchema.literal('ItemWeapon')

      expect(WeaponType).toBeInstanceOf(LiteralSchema)
      expect(WeaponType.value).toBe('ItemWeapon')
      expectTypeOf(WeaponType).toEqualTypeOf<LiteralSchema<'ItemWeapon'>>()
      expectTypeOf<Out<typeof WeaponType>>().toEqualTypeOf<'ItemWeapon'>()

      expect(WeaponType.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(WeaponType.safeParse('ItemArmor').success).toBe(false)

      // Accepts optional descriptor
      const described = ItemPropertiesTypeSchema.literal('ItemArmor', {
        description: 'Armor discriminator',
      })
      expect(described.descriptor.description).toBe('Armor discriminator')

      // Rejects invalid members at compile time and runtime
      expect(() => {
        // @ts-expect-error 'NotAMember' is not a member of ItemPropertiesTypeSchema
        ItemPropertiesTypeSchema.literal('NotAMember')
      }).toThrow(RangeError)
    })

    it('exposes a typed frozen map via enumSchema.literals', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])
      const { ItemWeapon, ItemArmor } = ItemPropertiesTypeSchema.literals

      expect(ItemWeapon).toBeInstanceOf(LiteralSchema)
      expect(ItemArmor).toBeInstanceOf(LiteralSchema)
      expect(ItemWeapon.value).toBe('ItemWeapon')
      expect(ItemArmor.value).toBe('ItemArmor')

      expectTypeOf(ItemWeapon).toEqualTypeOf<LiteralSchema<'ItemWeapon'>>()
      expectTypeOf(ItemArmor).toEqualTypeOf<LiteralSchema<'ItemArmor'>>()
      expectTypeOf<Out<typeof ItemWeapon>>().toEqualTypeOf<'ItemWeapon'>()

      expect(Object.isFrozen(ItemPropertiesTypeSchema.literals)).toBe(true)
      // Cached getter returns stable reference
      expect(ItemPropertiesTypeSchema.literals).toBe(ItemPropertiesTypeSchema.literals)
      // Chaining on a cached literal does not mutate it
      const optWeapon = ItemWeapon.optional()
      expect(optWeapon.safeParse(undefined).success).toBe(true)
      expect(ItemWeapon.safeParse(undefined).success).toBe(false)
    })

    it('supports numeric keys and edge-case keys in enumSchema.literals', () => {
      const Codes = s.enum([200, 404])
      const okLit = Codes.literals[200]
      expectTypeOf(okLit).toEqualTypeOf<LiteralSchema<200>>()
      expect(okLit.value).toBe(200)
      expect(okLit.parse(200)).toBe(200)
      expect(okLit.safeParse('200').success).toBe(false)

      // Duplicate values and __proto__ do not throw or pollute prototype
      const edgeEnum = s.enum(['a', 'a', '__proto__'])
      expect(edgeEnum.literals.a.value).toBe('a')
      expect(Object.prototype.hasOwnProperty.call(edgeEnum.literals, '__proto__')).toBe(true)
      expect(edgeEnum.literals['__proto__'].value).toBe('__proto__')
    })

    it('converts all enum members into a typed tuple via enumSchema.toLiterals()', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])
      const tuple = ItemPropertiesTypeSchema.toLiterals()
      const [weaponLit, armorLit] = tuple

      expectTypeOf(tuple).toEqualTypeOf<
        readonly [LiteralSchema<'ItemWeapon'>, LiteralSchema<'ItemArmor'>]
      >()
      expectTypeOf(weaponLit).toEqualTypeOf<LiteralSchema<'ItemWeapon'>>()
      expectTypeOf(armorLit).toEqualTypeOf<LiteralSchema<'ItemArmor'>>()

      expect(tuple).toHaveLength(2)
      expect(weaponLit.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(armorLit.parse('ItemArmor')).toBe('ItemArmor')

      // Composes directly with s.oneOf(...)
      const asUnion = s.oneOf(ItemPropertiesTypeSchema.toLiterals())
      expectTypeOf<Out<typeof asUnion>>().toEqualTypeOf<'ItemWeapon' | 'ItemArmor'>()
      expect(asUnion.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(asUnion.safeParse('Other').success).toBe(false)
    })

    it('works cleanly in discriminated struct definitions', () => {
      const ItemPropertiesTypeSchema = s.enum(['ItemWeapon', 'ItemArmor'])
      const WeaponProps = s.struct({
        type: ItemPropertiesTypeSchema.literal('ItemWeapon'),
        damage: s.number(),
      })
      const ArmorProps = s.struct({
        type: ItemPropertiesTypeSchema.literals.ItemArmor,
        defense: s.number(),
      })
      const ItemProps = s.oneOf([WeaponProps, ArmorProps], 'type')

      type Props = Out<typeof ItemProps>
      expectTypeOf<Props>().toEqualTypeOf<
        { type: 'ItemWeapon'; damage: number } | { type: 'ItemArmor'; defense: number }
      >()

      expect(ItemProps.parse({ type: 'ItemWeapon', damage: 25 })).toEqual({
        type: 'ItemWeapon',
        damage: 25,
      })
      expect(ItemProps.parse({ type: 'ItemArmor', defense: 10 })).toEqual({
        type: 'ItemArmor',
        defense: 10,
      })
      expect(ItemProps.safeParse({ type: 'ItemWeapon', defense: 10 }).success).toBe(false)
    })
  })

  describe('creating EnumSchema from LiteralSchema(s)', () => {
    it('creates an EnumSchema from an array of LiteralSchemas via s.enum([...])', () => {
      const WeaponType = s.literal('ItemWeapon')
      const ArmorType = s.literal('ItemArmor')

      const ItemPropertiesTypeSchema = s.enum([WeaponType, ArmorType])

      expect(ItemPropertiesTypeSchema).toBeInstanceOf(EnumSchema)
      expect(ItemPropertiesTypeSchema.values).toEqual(['ItemWeapon', 'ItemArmor'])
      expect(ItemPropertiesTypeSchema.descriptor.values).toEqual(['ItemWeapon', 'ItemArmor'])
      expectTypeOf(ItemPropertiesTypeSchema).toEqualTypeOf<
        EnumSchema<readonly ['ItemWeapon', 'ItemArmor']>
      >()
      expectTypeOf<Out<typeof ItemPropertiesTypeSchema>>().toEqualTypeOf<
        'ItemWeapon' | 'ItemArmor'
      >()

      expect(ItemPropertiesTypeSchema.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(ItemPropertiesTypeSchema.parse('ItemArmor')).toBe('ItemArmor')
      expect(ItemPropertiesTypeSchema.safeParse('Other').success).toBe(false)
    })

    it('supports mixing LiteralSchemas and raw string/number values in s.enum([...])', () => {
      const WeaponType = s.literal('ItemWeapon')
      const TierOne = s.literal(1)

      const MixedEnum = s.enum([WeaponType, 'ItemArmor', TierOne, 2])

      expectTypeOf<Out<typeof MixedEnum>>().toEqualTypeOf<'ItemWeapon' | 'ItemArmor' | 1 | 2>()
      expect(MixedEnum.values).toEqual(['ItemWeapon', 'ItemArmor', 1, 2])
      expect(MixedEnum.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(MixedEnum.parse('ItemArmor')).toBe('ItemArmor')
      expect(MixedEnum.parse(1)).toBe(1)
      expect(MixedEnum.parse(2)).toBe(2)
    })

    it('supports s.enum([...]) with LiteralSchemas', () => {
      const FormEnum = s.enum([s.literal('ItemWeapon'), s.literal('ItemArmor')])
      expectTypeOf<Out<typeof FormEnum>>().toEqualTypeOf<'ItemWeapon' | 'ItemArmor'>()
      expect(FormEnum.parse('ItemWeapon')).toBe('ItemWeapon')
    })

    it('rejects boolean and null LiteralSchemas in s.enum([...])', () => {
      const boolLit = s.literal(true)
      const nullLit = s.literal(null)

      expect(() => {
        // @ts-expect-error boolean LiteralSchema is not allowed in s.enum
        s.enum([boolLit])
      }).toThrow(TypeError)

      expect(() => {
        // @ts-expect-error null LiteralSchema is not allowed in s.enum
        s.enum([nullLit])
      }).toThrow(TypeError)
    })

    it('converts a single string or number LiteralSchema via literal.toEnum()', () => {
      const strEnum = s.literal('ItemWeapon').toEnum()
      const numEnum = s.literal(42).toEnum({ description: 'Answer' })

      expect(strEnum).toBeInstanceOf(EnumSchema)
      expect(strEnum.values).toEqual(['ItemWeapon'])
      expectTypeOf(strEnum).toEqualTypeOf<EnumSchema<readonly ['ItemWeapon']>>()
      expectTypeOf<Out<typeof strEnum>>().toEqualTypeOf<'ItemWeapon'>()
      expect(strEnum.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(strEnum.safeParse('Other').success).toBe(false)

      expect(numEnum.values).toEqual([42])
      expect(numEnum.descriptor.description).toBe('Answer')
      expectTypeOf(numEnum).toEqualTypeOf<EnumSchema<readonly [42]>>()
      expectTypeOf<Out<typeof numEnum>>().toEqualTypeOf<42>()
      expect(numEnum.parse(42)).toBe(42)

      // Rejects boolean and null literals at compile time and runtime
      expect(() => {
        // @ts-expect-error toEnum is only valid on string | number literals
        s.literal(true).toEnum()
      }).toThrow(TypeError)

      expect(() => {
        // @ts-expect-error toEnum is only valid on string | number literals
        s.literal(null).toEnum()
      }).toThrow(TypeError)
    })
  })

  describe('round-trip and bridge compatibility', () => {
    it('round-trips Enum -> toLiterals() -> s.enum(...) preserving exact types and runtime', () => {
      const original = s.enum(['ItemWeapon', 'ItemArmor'])
      const roundTripped = s.enum(original.toLiterals())

      expectTypeOf<Out<typeof roundTripped>>().toEqualTypeOf<'ItemWeapon' | 'ItemArmor'>()
      expect(roundTripped.values).toEqual(original.values)
      expect(toJSONSchema(roundTripped)).toEqual(toJSONSchema(original))
      expect(toJSONSchema(roundTripped).enum).toEqual(['ItemWeapon', 'ItemArmor'])
      expect(toJSONSchema(original.literal('ItemWeapon'))).toEqual({ const: 'ItemWeapon' })

      const zodEnum = toZod(roundTripped)
      expect(zodEnum.safeParse('ItemWeapon').success).toBe(true)
      expect(zodEnum.safeParse('Other').success).toBe(false)
    })

    it('round-trips Literal -> toEnum() -> literal()/literals preserving exact types', () => {
      const lit = s.literal('ItemWeapon')
      const asEnum = lit.toEnum()
      const backViaMethod = asEnum.literal('ItemWeapon')
      const backViaMap = asEnum.literals.ItemWeapon

      expectTypeOf<Out<typeof backViaMethod>>().toEqualTypeOf<'ItemWeapon'>()
      expectTypeOf<Out<typeof backViaMap>>().toEqualTypeOf<'ItemWeapon'>()
      expect(backViaMethod.parse('ItemWeapon')).toBe('ItemWeapon')
      expect(backViaMap.parse('ItemWeapon')).toBe('ItemWeapon')
    })
  })
})
