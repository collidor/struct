import { describe, it, expect } from 'vitest'
import { s } from '../../builders/index'
import { SchemaMigrationEngine } from '../migrator'

describe('Schema Evolution & DDL Migrator', () => {
  it('generates non-destructive ADD COLUMN migrations for column additions', () => {
    const v1Schema = s.struct({
      name: s.string(),
      hp: s.integer(),
    })

    const v2Schema = s.struct({
      name: s.string(),
      hp: s.integer(),
      mana: s.integer().default(100),
    })

    const migration = SchemaMigrationEngine.generateMigration(
      'Character',
      v1Schema.descriptor,
      v2Schema.descriptor,
      1,
      2,
    )

    expect(migration.requiresTableRecreation).toBe(false)
    expect(migration.upSql).toHaveLength(1)
    expect(migration.upSql[0]).toContain(
      'ALTER TABLE struct_character ADD COLUMN mana INTEGER NOT NULL DEFAULT 100;',
    )
  })

  it('generates table recreation scripts for destructive modifications or column drops', () => {
    const v1Schema = s.struct({
      name: s.string(),
      is_stealthy: s.boolean().default(false),
    })

    const v2Schema = s.struct({
      name: s.string(),
      stealth_state: s.enum(['VISIBLE', 'HIDDEN', 'CAMOUFLAGED']).default('VISIBLE'),
    })

    const migration = SchemaMigrationEngine.generateMigration(
      'Character',
      v1Schema.descriptor,
      v2Schema.descriptor,
      1,
      2,
    )

    expect(migration.requiresTableRecreation).toBe(true)
    expect(migration.upSql.some((sql) => sql.includes('struct_character_new'))).toBe(true)
    expect(migration.upSql.some((sql) => sql.includes('INSERT INTO struct_character_new'))).toBe(
      true,
    )
    expect(migration.upSql.some((sql) => sql.includes('DROP TABLE struct_character;'))).toBe(true)
    expect(
      migration.upSql.some((sql) =>
        sql.includes('ALTER TABLE struct_character_new RENAME TO struct_character;'),
      ),
    ).toBe(true)
  })

  it('resolves multi-step migration paths across chained versions', () => {
    SchemaMigrationEngine.registerMigration({
      structName: 'Character',
      fromVersion: 1,
      toVersion: 2,
      upSql: ['ALTER TABLE struct_character ADD COLUMN mana INTEGER DEFAULT 100;'],
      requiresTableRecreation: false,
    })

    SchemaMigrationEngine.registerMigration({
      structName: 'Character',
      fromVersion: 2,
      toVersion: 3,
      upSql: ['ALTER TABLE struct_character ADD COLUMN stamina INTEGER DEFAULT 50;'],
      requiresTableRecreation: false,
    })

    const path = SchemaMigrationEngine.resolveMigrationPath('Character', 1, 3)
    expect(path).toHaveLength(2)
    expect(path[0].fromVersion).toBe(1)
    expect(path[0].toVersion).toBe(2)
    expect(path[1].fromVersion).toBe(2)
    expect(path[1].toVersion).toBe(3)
  })
})
