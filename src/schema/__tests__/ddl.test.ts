import { describe, it, expect } from 'vitest'
import { s } from '../../builders/index'
import {
  generateBaseTablesDDL,
  generateStructDDL,
  generateDiscriminatedUnionDDL,
  generateSchemaDDL,
  getStructColumnMappings,
} from '../ddl'

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

  describe('Discriminated Union (oneOf) SQL DDL', () => {
    it('generates main table (id + type) and leaf tables (keeping type) with composite FKs', () => {
      const ItemPropertiesType = s.enum(['ItemWeapon', 'ItemArmor'])
      const ItemProperties = s.discriminatedUnion('type', ItemPropertiesType, {
        ItemWeapon: s.struct({
          damage: s.number(),
          crit_chance: s.number().optional(),
        }),
        ItemArmor: s.struct({
          defense: s.integer().default(0),
        }),
      })

      const statements = generateDiscriminatedUnionDDL('ItemProperties', ItemProperties)
      // Main table + discriminator index + 2 leaf tables
      expect(statements).toHaveLength(4)

      const [mainTable, discIndex, weaponLeaf, armorLeaf] = statements

      expect(mainTable).toContain('CREATE TABLE IF NOT EXISTS struct_itemproperties')
      expect(mainTable).toContain('id TEXT PRIMARY KEY')
      expect(mainTable).toContain("type TEXT NOT NULL CHECK (type IN ('ItemWeapon', 'ItemArmor'))")
      expect(mainTable).toContain('UNIQUE (id, type)')
      expect(mainTable).toContain('FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')

      expect(discIndex).toBe(
        'CREATE INDEX IF NOT EXISTS idx_struct_itemproperties_type ON struct_itemproperties(type);',
      )

      expect(weaponLeaf).toContain('CREATE TABLE IF NOT EXISTS struct_itemproperties_itemweapon')
      expect(weaponLeaf).toContain('id TEXT PRIMARY KEY')
      expect(weaponLeaf).toContain(
        "type TEXT NOT NULL DEFAULT 'ItemWeapon' CHECK (type = 'ItemWeapon')",
      )
      expect(weaponLeaf).toContain('damage REAL NOT NULL')
      expect(weaponLeaf).toContain('crit_chance REAL DEFAULT NULL')
      expect(weaponLeaf).toContain(
        'FOREIGN KEY(id, type) REFERENCES struct_itemproperties(id, type) ON DELETE CASCADE',
      )

      expect(armorLeaf).toContain('CREATE TABLE IF NOT EXISTS struct_itemproperties_itemarmor')
      expect(armorLeaf).toContain('id TEXT PRIMARY KEY')
      expect(armorLeaf).toContain(
        "type TEXT NOT NULL DEFAULT 'ItemArmor' CHECK (type = 'ItemArmor')",
      )
      expect(armorLeaf).toContain('defense INTEGER NOT NULL DEFAULT 0')
      expect(armorLeaf).toContain(
        'FOREIGN KEY(id, type) REFERENCES struct_itemproperties(id, type) ON DELETE CASCADE',
      )

      // generateStructDDL joins all statements seamlessly
      const combined = generateStructDDL('ItemProperties', ItemProperties)
      expect(combined).toBe(statements.join('\n\n'))
    })

    it('generates 1-to-N connections for discriminated union fields and arrays on a parent struct', () => {
      const ItemProperties = s.discriminatedUnion('type', s.enum(['ItemWeapon', 'ItemArmor']), {
        ItemWeapon: s.struct({ damage: s.number() }),
        ItemArmor: s.struct({ defense: s.integer() }),
      })

      const EffectSchema = s.discriminatedUnion('type', [
        s.struct({ type: s.literal('Buff'), bonus: s.integer() }),
        s.struct({ type: s.literal('Debuff'), penalty: s.integer() }),
      ])

      const ItemSchema = s.struct('Item', {
        name: s.string(),
        properties: ItemProperties,
        secondary: ItemProperties.optional(),
        effects: s.array(EffectSchema),
      })

      const statements = generateSchemaDDL('Item', ItemSchema)
      const fullSql = statements.join('\n\n')

      // Referenced single-union main tables must appear BEFORE struct_item
      const propsMainIdx = statements.findIndex((st) =>
        st.includes('CREATE TABLE IF NOT EXISTS struct_item_properties ('),
      )
      const itemTableIdx = statements.findIndex((st) =>
        st.includes('CREATE TABLE IF NOT EXISTS struct_item ('),
      )
      const effectsMainIdx = statements.findIndex((st) =>
        st.includes('CREATE TABLE IF NOT EXISTS struct_item_effects ('),
      )

      expect(propsMainIdx).toBeGreaterThanOrEqual(0)
      expect(itemTableIdx).toBeGreaterThan(propsMainIdx)
      expect(effectsMainIdx).toBeGreaterThan(itemTableIdx)

      const itemTable = statements[itemTableIdx]
      // Required single union field
      expect(itemTable).toContain('properties_id TEXT NOT NULL')
      expect(itemTable).toContain(
        "properties_type TEXT NOT NULL CHECK (properties_type IN ('ItemWeapon', 'ItemArmor'))",
      )
      expect(itemTable).toContain(
        'FOREIGN KEY(properties_id, properties_type) REFERENCES struct_item_properties(id, type) ON DELETE CASCADE',
      )
      // Optional single union field
      expect(itemTable).toContain('secondary_id TEXT DEFAULT NULL')
      expect(itemTable).toContain(
        'FOREIGN KEY(secondary_id, secondary_type) REFERENCES struct_item_secondary(id, type) ON DELETE SET NULL',
      )
      // 1-to-N array field is normalized into child union tables, not stored as a TEXT column
      expect(itemTable).not.toContain('effects TEXT')

      // 1-to-N child union main table links to parent struct_item(id) and keeps id + type
      const effectsMain = statements[effectsMainIdx]
      expect(effectsMain).toContain('id TEXT PRIMARY KEY')
      expect(effectsMain).toContain('item_id TEXT NOT NULL')
      expect(effectsMain).toContain("type TEXT NOT NULL CHECK (type IN ('Buff', 'Debuff'))")
      expect(effectsMain).toContain('UNIQUE (id, type)')
      expect(effectsMain).toContain(
        'FOREIGN KEY(item_id) REFERENCES struct_item(id) ON DELETE CASCADE',
      )

      // Leaf tables of 1-to-N array union keep type and reference struct_item_effects(id, type)
      expect(fullSql).toContain('CREATE TABLE IF NOT EXISTS struct_item_effects_buff')
      expect(fullSql).toContain("type TEXT NOT NULL DEFAULT 'Buff' CHECK (type = 'Buff')")
      expect(fullSql).toContain(
        'FOREIGN KEY(id, type) REFERENCES struct_item_effects(id, type) ON DELETE CASCADE',
      )
      expect(fullSql).toContain('CREATE TABLE IF NOT EXISTS struct_item_effects_debuff')
      expect(fullSql).toContain("type TEXT NOT NULL DEFAULT 'Debuff' CHECK (type = 'Debuff')")
      expect(fullSql).toContain(
        'CREATE INDEX IF NOT EXISTS idx_struct_item_effects_item_id ON struct_item_effects(item_id);',
      )
    })

    it('supports PostgreSQL dialect, numeric/boolean discriminators, and multi-value enum leaves', () => {
      const CodeUnion = s.discriminatedUnion('status', s.enum([200, 404]), {
        200: s.struct({ ok: s.boolean().default(true), payload: s.string() }),
        404: s.struct({ message: s.string() }),
      })

      const pgStatements = generateDiscriminatedUnionDDL(CodeUnion, {
        tableName: 'api_responses',
        dialect: 'postgres',
      })

      expect(pgStatements[0]).toContain('CREATE TABLE IF NOT EXISTS api_responses')
      expect(pgStatements[0]).toContain('status INTEGER NOT NULL CHECK (status IN (200, 404))')
      expect(pgStatements[0]).toContain('UNIQUE (id, status)')
      expect(pgStatements[0]).not.toContain('REFERENCES entities')

      expect(pgStatements[2]).toContain('CREATE TABLE IF NOT EXISTS api_responses_200')
      expect(pgStatements[2]).toContain('status INTEGER NOT NULL DEFAULT 200 CHECK (status = 200)')
      expect(pgStatements[2]).toContain('ok BOOLEAN NOT NULL DEFAULT TRUE')
      expect(pgStatements[2]).toContain(
        'FOREIGN KEY(id, status) REFERENCES api_responses(id, status) ON DELETE CASCADE',
      )

      // Multi-value enum on a leaf variant
      const WeaponUnion = s.discriminatedUnion('type', [
        s.struct({ type: s.enum(['Sword', 'Axe']), reach: s.number() }),
        s.struct({ type: s.literal('Bow'), range: s.number() }),
      ])
      const weaponDDL = generateDiscriminatedUnionDDL(WeaponUnion, { tableName: 'weapons' })
      expect(weaponDDL[0]).toContain("type TEXT NOT NULL CHECK (type IN ('Sword', 'Axe', 'Bow'))")
      expect(weaponDDL[2]).toContain('CREATE TABLE IF NOT EXISTS weapons_sword_axe')
      expect(weaponDDL[2]).toContain("type TEXT NOT NULL CHECK (type IN ('Sword', 'Axe'))")
      expect(weaponDDL[2]).not.toContain('DEFAULT')
    })
  })
})
