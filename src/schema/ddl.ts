import type { StructDescriptor, TypeDescriptor, TypeKind } from '../types/ast'
import type { StructFieldMapping, FieldVisibility } from './storage'

/**
 * Generates the base SQLite tables (entities tracking and universal edges).
 */
export function generateBaseTablesDDL(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    struct_id TEXT NOT NULL,
    storage_class TEXT NOT NULL,
    sequence_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS entity_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    relation_name TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(source_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES entities(id) ON DELETE CASCADE
);`,
    `CREATE INDEX IF NOT EXISTS idx_edges_source ON entity_edges(source_id, relation_name);`,
    `CREATE INDEX IF NOT EXISTS idx_edges_target ON entity_edges(target_id, relation_name);`,
  ]
}

const SQLITE_TYPE_MAP: Partial<Record<TypeKind, 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB'>> = {
  integer: 'INTEGER',
  boolean: 'INTEGER',
  bigint: 'INTEGER',
  number: 'REAL',
}

/**
 * Maps a Struct AST descriptor kind to a SQLite storage data type.
 */
export function typeDescriptorToSQLType(
  descriptor: TypeDescriptor,
): 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB' {
  return SQLITE_TYPE_MAP[descriptor.kind] ?? 'TEXT'
}

/**
 * Extracts normalized column field mappings from a StructDescriptor.
 */
export function getStructColumnMappings(descriptor: StructDescriptor): StructFieldMapping[] {
  const mappings: StructFieldMapping[] = []

  for (const [fieldName, fieldDesc] of Object.entries(descriptor.fields)) {
    const sqlType = typeDescriptorToSQLType(fieldDesc)
    const isNullable = Boolean(fieldDesc.nullable || fieldDesc.optional)
    let defaultValue = fieldDesc.default

    if (fieldDesc.kind === 'boolean' && typeof defaultValue === 'boolean') {
      defaultValue = defaultValue ? 1 : 0
    }

    const visibility = (fieldDesc.metadata?.visibility as FieldVisibility) ?? 'PUBLIC'

    mappings.push({
      name: fieldName,
      sqlType,
      nullable: isNullable,
      defaultValue: defaultValue as string | number | boolean | null | undefined,
      visibility,
    })
  }

  return mappings
}

/**
 * Returns the normalized SQLite table name for a Struct.
 */
export function getStructTableName(structName: string): string {
  return `struct_${structName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`
}

/**
 * Formats a single column definition for SQLite DDL.
 */
export function formatColumnDefinition(col: StructFieldMapping): string {
  let def = `${col.name} ${col.sqlType}`

  if (!col.nullable) {
    def += ' NOT NULL'
  }

  if (col.defaultValue !== undefined && col.defaultValue !== null) {
    if (typeof col.defaultValue === 'string') {
      def += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`
    } else if (typeof col.defaultValue === 'boolean') {
      def += ` DEFAULT ${col.defaultValue ? 1 : 0}`
    } else if (typeof col.defaultValue === 'number') {
      def += ` DEFAULT ${col.defaultValue}`
    } else {
      def += ` DEFAULT '${JSON.stringify(col.defaultValue).replace(/'/g, "''")}'`
    }
  } else if (col.nullable) {
    def += ' DEFAULT NULL'
  }

  return def
}

/**
 * Generates dynamic DDL CREATE TABLE statements for a specific Struct definition.
 */
export function generateStructDDL(structName: string, descriptor: StructDescriptor): string {
  const tableName = getStructTableName(structName)
  const mappings = getStructColumnMappings(descriptor)

  const columnDefs: string[] = ['    id TEXT PRIMARY KEY']

  for (const col of mappings) {
    columnDefs.push(`    ${formatColumnDefinition(col)}`)
  }

  columnDefs.push('    FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columnDefs.join(',\n')}\n);`
}
