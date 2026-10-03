import type { StructDescriptor, TypeDescriptor, TypeKind } from '../types/ast'
import type { StructFieldMapping, FieldVisibility, SQLType } from './storage'

export type SQLDialect = 'sqlite' | 'postgres'

export interface GenerateDDLOptions {
  /** Optional custom table name (defaults to 'records' or derived from structName) */
  tableName?: string
  /** Target SQL dialect (defaults to 'sqlite') */
  dialect?: SQLDialect
  /** Whether to include SQLite entities table FOREIGN KEY reference (defaults to true for SQLite, false for Postgres) */
  includeEntitiesForeignKey?: boolean
}

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

const POSTGRES_TYPE_MAP: Partial<Record<TypeKind, SQLType>> = {
  integer: 'INTEGER',
  bigint: 'BIGINT',
  number: 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  date: 'TIMESTAMPTZ',
}

/**
 * Maps a Struct AST descriptor kind to a SQL storage data type.
 */
export function typeDescriptorToSQLType(
  descriptor: TypeDescriptor,
  dialect: SQLDialect = 'sqlite',
): SQLType {
  if (dialect === 'postgres') {
    return POSTGRES_TYPE_MAP[descriptor.kind] ?? 'TEXT'
  }
  return SQLITE_TYPE_MAP[descriptor.kind] ?? 'TEXT'
}

/**
 * Extracts normalized column field mappings from a StructDescriptor.
 */
export function getStructColumnMappings(
  descriptor: StructDescriptor,
  dialect: SQLDialect = 'sqlite',
): StructFieldMapping[] {
  const mappings: StructFieldMapping[] = []

  for (const [fieldName, fieldDesc] of Object.entries(descriptor.fields)) {
    const sqlType = typeDescriptorToSQLType(fieldDesc, dialect)
    const isNullable = Boolean(fieldDesc.nullable || fieldDesc.optional)
    let defaultValue = fieldDesc.default

    if (dialect === 'sqlite') {
      if (fieldDesc.kind === 'boolean' && typeof defaultValue === 'boolean') {
        defaultValue = defaultValue ? 1 : 0
      }
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
 * Formats a single column definition for SQL DDL.
 */
export function formatColumnDefinition(
  col: StructFieldMapping,
  dialect: SQLDialect = 'sqlite',
): string {
  let def = `${col.name} ${col.sqlType}`

  if (!col.nullable) {
    def += ' NOT NULL'
  }

  if (col.defaultValue !== undefined && col.defaultValue !== null) {
    if (typeof col.defaultValue === 'string') {
      def += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`
    } else if (typeof col.defaultValue === 'boolean') {
      if (dialect === 'postgres') {
        def += ` DEFAULT ${col.defaultValue ? 'TRUE' : 'FALSE'}`
      } else {
        def += ` DEFAULT ${col.defaultValue ? 1 : 0}`
      }
    } else if (typeof col.defaultValue === 'number' || typeof col.defaultValue === 'bigint') {
      def += ` DEFAULT ${col.defaultValue.toString()}`
    } else {
      def += ` DEFAULT '${JSON.stringify(col.defaultValue).replace(/'/g, "''")}'`
    }
  } else if (col.nullable) {
    if (dialect === 'sqlite') {
      def += ' DEFAULT NULL'
    }
  }

  return def
}

/**
 * Generates dynamic DDL CREATE TABLE statements for a specific Struct definition.
 *
 * Supports both:
 * - Low-level: `generateStructDDL('users', descriptor, options)`
 * - High-level: `generateStructDDL(UserSchema, options)`
 */
export function generateStructDDL(
  structName: string,
  descriptor: StructDescriptor,
  options?: GenerateDDLOptions,
): string
export function generateStructDDL(
  schemaOrDescriptor: { descriptor: StructDescriptor } | StructDescriptor,
  options?: GenerateDDLOptions,
): string
export function generateStructDDL(
  structOrName: string | { descriptor: StructDescriptor } | StructDescriptor,
  descriptorOrOptions?: StructDescriptor | GenerateDDLOptions,
  options?: GenerateDDLOptions,
): string {
  let descriptor: StructDescriptor
  let opts: GenerateDDLOptions = {}
  let derivedTableName: string

  if (typeof structOrName === 'string') {
    derivedTableName = getStructTableName(structOrName)
    descriptor = descriptorOrOptions as StructDescriptor
    opts = options || {}
  } else {
    descriptor =
      'descriptor' in (structOrName as object) && (structOrName as { descriptor: StructDescriptor }).descriptor
        ? (structOrName as { descriptor: StructDescriptor }).descriptor
        : (structOrName as StructDescriptor)
    opts = (descriptorOrOptions as GenerateDDLOptions) || {}
    derivedTableName =
      opts.tableName ||
      (typeof descriptor?.title === 'string' ? getStructTableName(descriptor.title) : 'records')
  }

  if (!descriptor || descriptor.kind !== 'struct' || !descriptor.fields) {
    throw new Error('generateStructDDL requires a struct schema or StructDescriptor with fields')
  }

  const tableName = opts.tableName || derivedTableName
  const dialect: SQLDialect = opts.dialect || 'sqlite'
  const mappings = getStructColumnMappings(descriptor, dialect)

  const columnDefs: string[] = ['    id TEXT PRIMARY KEY']

  for (const col of mappings) {
    columnDefs.push(`    ${formatColumnDefinition(col, dialect)}`)
  }

  const shouldIncludeFk =
    opts.includeEntitiesForeignKey ?? (dialect === 'sqlite' && typeof structOrName === 'string')

  if (shouldIncludeFk) {
    columnDefs.push('    FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')
  }

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columnDefs.join(',\n')}\n);`
}
