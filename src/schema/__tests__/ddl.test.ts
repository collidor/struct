import { describe, it, expect } from 'vitest'
import { s } from '../../builders/index'
import { generateBaseTablesDDL, generateStructDDL, getStructColumnMappings } from '../ddl'

describe('Dynamic SQLite DDL Generator', () => {
  it('generates base entities and universal edges tables', () => {
    const baseDDL = generateBaseTablesDDL()
    expect(baseDDL).toHaveLength(4)
    expect(baseDDL[0]).toContain('CREATE TABLE IF NOT EXISTS entities')
    expect(baseDDL[0]).toContain('sequence_id INTEGER NOT NULL DEFAULT 1')
    expect(baseDDL[1]).toContain('CREATE TABLE IF NOT EXISTS entity_edges')
    expect(baseDDL[2]).toContain('CREATE INDEX IF NOT EXISTS idx_edges_source')
    expect(baseDDL[3]).toContain('CREATE INDEX IF NOT EXISTS idx_edges_target')
  })

  it('generates concrete struct table DDL from schema descriptor', () => {
    const CharacterSchema = s.struct({
      name: s.string(),
      hp: s.integer().default(10),
      is_stealthy: s.boolean().default(false),
      speed: s.number().default(30.5),
      inventory: s.array(s.string()).optional(),
    })

    const ddl = generateStructDDL('Character', CharacterSchema.descriptor)
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS struct_character')
    expect(ddl).toContain('id TEXT PRIMARY KEY')
    expect(ddl).toContain('name TEXT NOT NULL')
    expect(ddl).toContain('hp INTEGER NOT NULL DEFAULT 10')
    expect(ddl).toContain('is_stealthy INTEGER NOT NULL DEFAULT 0')
    expect(ddl).toContain('speed REAL NOT NULL DEFAULT 30.5')
    expect(ddl).toContain('inventory TEXT DEFAULT NULL')
    expect(ddl).toContain('FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')
  })

  it('correctly maps column definitions with metadata and visibility', () => {
    const MonsterSchema = s.struct({
      name: s.string(),
      secret_lore: s.string().meta({ visibility: 'HOST_ONLY' }),
    })

    const mappings = getStructColumnMappings(MonsterSchema.descriptor)
    const secretLore = mappings.find((m) => m.name === 'secret_lore')
    expect(secretLore).toBeDefined()
    expect(secretLore?.visibility).toBe('HOST_ONLY')
  })

  it('supports schema instance directly with custom tableName and SQLite dialect', () => {
    const ArticleSchema = s.struct({
      title: s.string(),
      published: s.boolean().default(false),
      rating: s.number().optional(),
    })

    const ddl = generateStructDDL(ArticleSchema, {
      tableName: 'articles',
      dialect: 'sqlite',
    })

    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS articles')
    expect(ddl).toContain('title TEXT NOT NULL')
    expect(ddl).toContain('published INTEGER NOT NULL DEFAULT 0')
    expect(ddl).toContain('rating REAL DEFAULT NULL')
  })

  it('supports PostgreSQL dialect with typed booleans and floating point', () => {
    const ArticleSchema = s.struct({
      title: s.string(),
      views: s.integer().default(0),
      published: s.boolean().default(true),
      rating: s.number().optional(),
      created_at: s.date().optional(),
      points: s.bigint().default(100n),
    })

    const pgDDL = generateStructDDL(ArticleSchema, {
      tableName: 'articles',
      dialect: 'postgres',
    })

    expect(pgDDL).toContain('CREATE TABLE IF NOT EXISTS articles')
    expect(pgDDL).toContain('title TEXT NOT NULL')
    expect(pgDDL).toContain('views INTEGER NOT NULL DEFAULT 0')
    expect(pgDDL).toContain('published BOOLEAN NOT NULL DEFAULT TRUE')
    expect(pgDDL).toContain('rating DOUBLE PRECISION')
    expect(pgDDL).toContain('created_at TIMESTAMPTZ')
    expect(pgDDL).toContain('points BIGINT NOT NULL DEFAULT 100')
    // Postgres dialect defaults to omitting SQLite-specific entities foreign key
    expect(pgDDL).not.toContain('FOREIGN KEY(id) REFERENCES entities')
  })
})
