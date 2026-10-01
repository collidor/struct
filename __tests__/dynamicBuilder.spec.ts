import { describe, it, expect } from 'vitest'
import { s, StructBuilder } from '../src'

describe('Dynamic StructBuilder (Form Builder Engine)', () => {
  it('allows adding, editing, and compiling dynamic fields', () => {
    const builder = new StructBuilder('CharacterSheet')
    builder.title = 'TTRPG Character Sheet'
    builder.description = 'Player character attributes'

    builder.addField('characterName', s.string().min(1), {
      label: 'Character Name',
      placeholder: 'Enter name...',
    })

    builder.addField('level', s.integer().min(1).max(20), {
      label: 'Level',
      default: 1,
    })

    const struct = builder.build()
    expect(struct.descriptor.name).toBe('CharacterSheet')
    expect(struct.descriptor.title).toBe('TTRPG Character Sheet')
    expect(struct.shape.characterName).toBeDefined()
    expect(struct.shape.level).toBeDefined()

    const parsed = struct.parse({ characterName: 'Conan' })
    expect(parsed).toEqual({ characterName: 'Conan', level: 1 })
  })

  it('supports field removal, renaming, and reordering', () => {
    const builder = new StructBuilder('Item')
    builder.addField('name', s.string())
    builder.addField('weight', s.number())
    builder.addField('cost', s.number())

    // Rename
    builder.renameField('cost', 'price')
    expect(builder.fields.has('cost')).toBe(false)
    expect(builder.fields.has('price')).toBe(true)

    // Remove
    builder.removeField('weight')
    expect(builder.fields.has('weight')).toBe(false)

    // Reorder
    builder.reorderFields(['price', 'name'])
    expect(builder.fieldOrder).toEqual(['price', 'name'])

    const struct = builder.build()
    expect(Object.keys(struct.shape)).toEqual(['price', 'name'])
  })

  it('serializes to JSON AST and rehydrates via StructBuilder.fromJSON()', () => {
    const builder = new StructBuilder('Spell')
    builder.addField('spellName', s.string().label('Spell Name'))
    builder.addField('damage', s.integer().min(0).default(10))

    const jsonDescriptor = builder.toJSON()
    expect(jsonDescriptor.kind).toBe('struct')
    expect(jsonDescriptor.fields.spellName).toBeDefined()

    const restoredBuilder = StructBuilder.fromJSON(jsonDescriptor)
    const restoredStruct = restoredBuilder.build()

    expect(restoredStruct.parse({ spellName: 'Fireball' })).toEqual({
      spellName: 'Fireball',
      damage: 10,
    })
  })
})
