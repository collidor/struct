import { describe, it, expect, beforeEach } from 'vitest'
import { SQLiteMemoryDatabase, SQLiteEntityStoreAdapter } from '../sqliteAdapter'

describe('SQLite In-Memory Database & Entity Store Adapter', () => {
  let db: SQLiteMemoryDatabase
  let adapter: SQLiteEntityStoreAdapter

  beforeEach(() => {
    db = new SQLiteMemoryDatabase()
    adapter = new SQLiteEntityStoreAdapter(db)
  })

  it('stores and retrieves entities across entities catalog and struct tables', () => {
    adapter.saveEntity('hero_1', 'Character', 1, { name: 'Valeros', hp: 20, speed: 30 })

    const entity = adapter.getEntity('hero_1')
    expect(entity).toBeDefined()
    expect(entity?.id).toBe('hero_1')
    expect(entity?.struct_id).toBe('Character')
    expect(entity?.sequence_id).toBe(1)
    expect(entity?.data.name).toBe('Valeros')
    expect(entity?.data.hp).toBe(20)

    // Verify row was stored in struct_character table
    const structRow = db.get('struct_character', 'hero_1')
    expect(structRow?.hp).toBe(20)
  })

  it('performs atomic transactions and rollbacks on the underlying SQLite database', () => {
    adapter.saveEntity('goblin_1', 'Monster', 1, { hp: 10, name: 'Goblin' })

    adapter.beginTransaction()
    adapter.saveEntity('goblin_1', 'Monster', 2, { hp: 0, name: 'Goblin' })
    adapter.saveEntity('goblin_2', 'Monster', 1, { hp: 10, name: 'Goblin Guard' })

    expect(adapter.getEntity('goblin_1')?.data.hp).toBe(0)
    expect(adapter.getEntity('goblin_2')).toBeDefined()

    adapter.rollbackTransaction()

    // After rollback, goblin_1 reverts to hp: 10 and goblin_2 is removed
    expect(adapter.getEntity('goblin_1')?.data.hp).toBe(10)
    expect(adapter.getEntity('goblin_2')).toBeUndefined()
  })

  it('deletes entities from both catalog and struct tables', () => {
    adapter.saveEntity('spell_1', 'Spell', 1, { name: 'Fireball', damage: '8d6' })
    expect(adapter.getEntity('spell_1')).toBeDefined()

    adapter.deleteEntity('spell_1')
    expect(adapter.getEntity('spell_1')).toBeUndefined()
    expect(db.get('struct_spell', 'spell_1')).toBeUndefined()
  })
})
