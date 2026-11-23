import type {
  DiscriminatorValue,
  EnumDescriptor,
  LiteralDescriptor,
  StructDescriptor,
  TypeDescriptor,
  TypeKind,
  UnionDescriptor,
} from '../types/ast'
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

function sanitizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function formatSQLLiteral(
  value: DiscriminatorValue,
  dialect: SQLDialect,
): string {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  if (typeof value === 'boolean') {
    if (dialect === 'postgres') return value ? 'TRUE' : 'FALSE'
    return value ? '1' : '0'
  }
  return String(value)
}

function inferDiscriminatorSQLType(
  values: ReadonlyArray<DiscriminatorValue>,
  dialect: SQLDialect,
): SQLType {
  const nonNull = values.filter((v) => v !== null)
  if (nonNull.length === 0) return 'TEXT'
  if (nonNull.every((v) => typeof v === 'boolean')) {
    return dialect === 'postgres' ? 'BOOLEAN' : 'INTEGER'
  }
  if (nonNull.every((v) => typeof v === 'number')) {
    if (nonNull.every((v) => Number.isInteger(v))) {
      return 'INTEGER'
    }
    return dialect === 'postgres' ? 'DOUBLE PRECISION' : 'REAL'
  }
  return 'TEXT'
}

function formatCheckConstraint(
  columnName: string,
  values: ReadonlyArray<DiscriminatorValue>,
  dialect: SQLDialect,
): string {
  const nonNull = values.filter((v) => v !== null)
  const hasNull = values.some((v) => v === null)

  if (values.length === 1) {
    if (hasNull) return `CHECK (${columnName} IS NULL)`
    return `CHECK (${columnName} = ${formatSQLLiteral(nonNull[0], dialect)})`
  }

  const parts: string[] = []
  if (nonNull.length > 0) {
    const formatted = nonNull.map((v) => formatSQLLiteral(v, dialect)).join(', ')
    parts.push(`${columnName} IN (${formatted})`)
  }
  if (hasNull) {
    parts.push(`${columnName} IS NULL`)
  }
  return `CHECK (${parts.join(' OR ')})`
}

function isDiscriminatedUnionDescriptor(desc: TypeDescriptor | undefined): desc is UnionDescriptor {
  return Boolean(
    desc &&
      desc.kind === 'union' &&
      typeof desc.discriminator === 'string' &&
      desc.discriminator.length > 0 &&
      Array.isArray(desc.variants) &&
      desc.variants.length > 0,
  )
}

function extractVariantDiscriminatorValuesFromDescriptor(
  variant: StructDescriptor,
  discriminator: string,
): DiscriminatorValue[] {
  const discField = variant.fields?.[discriminator]
  if (!discField) {
    throw new Error(
      `Discriminated union variant is missing discriminator field "${discriminator}" in descriptor`,
    )
  }
  if (discField.kind === 'literal') {
    return [(discField as LiteralDescriptor).value]
  }
  if (discField.kind === 'enum') {
    const vals = (discField as EnumDescriptor).values || []
    if (vals.length === 0) {
      throw new Error(`Discriminator enum field "${discriminator}" has no values`)
    }
    return [...vals]
  }
  throw new Error(
    `Discriminator field "${discriminator}" must be a literal or enum descriptor, received "${discField.kind}"`,
  )
}

function resolveDescriptor(
  input:
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
): StructDescriptor | UnionDescriptor {
  if (typeof input === 'object' && input !== null && 'descriptor' in input && input.descriptor) {
    return input.descriptor
  }
  return input as StructDescriptor | UnionDescriptor
}

function getParentFkColumnName(parentTableName: string): string {
  const base = parentTableName.startsWith('struct_')
    ? parentTableName.slice('struct_'.length)
    : parentTableName
  return `${sanitizeIdentifier(base)}_id`
}

interface InternalUnionDDLOptions {
  mainTableName: string
  dialect: SQLDialect
  includeEntitiesForeignKey: boolean
  parentRef?: {
    tableName: string
    fkColumnName: string
  }
}

function buildDiscriminatedUnionStatements(
  descriptor: UnionDescriptor,
  opts: InternalUnionDDLOptions,
): string[] {
  const discriminator = descriptor.discriminator
  if (!discriminator) {
    throw new Error('generateDiscriminatedUnionDDL requires a UnionDescriptor with a discriminator')
  }
  if (!descriptor.variants || descriptor.variants.length === 0) {
    throw new Error('generateDiscriminatedUnionDDL requires at least one variant')
  }

  const { mainTableName, dialect, includeEntitiesForeignKey, parentRef } = opts

  const variantEntries: Array<{
    variant: StructDescriptor
    values: DiscriminatorValue[]
    leafTableName: string
  }> = []
  const allDiscriminatorValues: DiscriminatorValue[] = []
  const usedTableNames = new Set<string>([mainTableName])

  for (let i = 0; i < descriptor.variants.length; i++) {
    const rawVariant = descriptor.variants[i]
    if (rawVariant.kind !== 'struct' || !rawVariant.fields) {
      throw new Error(
        `Discriminated union variant at index ${i} must be a struct descriptor`,
      )
    }

    const values = extractVariantDiscriminatorValuesFromDescriptor(rawVariant, discriminator)
    allDiscriminatorValues.push(...values)

    const rawSlug =
      rawVariant.name ||
      rawVariant.title ||
      values.map((v) => String(v)).join('_')
    const baseLeafName = `${mainTableName}_${sanitizeIdentifier(rawSlug)}`
    let leafTableName = baseLeafName
    let suffix = 2
    while (usedTableNames.has(leafTableName)) {
      leafTableName = `${baseLeafName}_${suffix++}`
    }
    usedTableNames.add(leafTableName)

    variantEntries.push({ variant: rawVariant, values, leafTableName })
  }

  const discSqlType = inferDiscriminatorSQLType(allDiscriminatorValues, dialect)
  const mainCheck = formatCheckConstraint(discriminator, allDiscriminatorValues, dialect)
  const mainHasNull = allDiscriminatorValues.some((v) => v === null)

  // 1. Main table holding id, optional parent FK (for 1-to-N array relations), and discriminator
  const mainCols: string[] = ['    id TEXT PRIMARY KEY']
  if (parentRef) {
    mainCols.push(`    ${parentRef.fkColumnName} TEXT NOT NULL`)
  }
  mainCols.push(
    `    ${discriminator} ${discSqlType}${mainHasNull ? '' : ' NOT NULL'} ${mainCheck}`,
  )
  mainCols.push(`    UNIQUE (id, ${discriminator})`)
  if (parentRef) {
    mainCols.push(
      `    FOREIGN KEY(${parentRef.fkColumnName}) REFERENCES ${parentRef.tableName}(id) ON DELETE CASCADE`,
    )
  }
  if (includeEntitiesForeignKey) {
    mainCols.push('    FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')
  }

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS ${mainTableName} (\n${mainCols.join(',\n')}\n);`,
    `CREATE INDEX IF NOT EXISTS idx_${mainTableName}_${sanitizeIdentifier(discriminator)} ON ${mainTableName}(${discriminator});`,
  ]

  if (parentRef) {
    statements.push(
      `CREATE INDEX IF NOT EXISTS idx_${mainTableName}_${sanitizeIdentifier(parentRef.fkColumnName)} ON ${mainTableName}(${parentRef.fkColumnName});`,
    )
  }

  // 2. Each leaf table keeping id + discriminator + variant-specific fields, with composite FK to main table
  for (const { variant, values, leafTableName } of variantEntries) {
    const leafStatements = buildStructWithRelationsStatements(variant, {
      tableName: leafTableName,
      dialect,
      includeEntitiesForeignKey: false,
      leafUnionContext: {
        mainTableName,
        discriminator,
        discSqlType,
        values,
      },
    })
    statements.push(...leafStatements)
  }

  return statements
}

interface InternalStructDDLOptions {
  tableName: string
  dialect: SQLDialect
  includeEntitiesForeignKey: boolean
  leafUnionContext?: {
    mainTableName: string
    discriminator: string
    discSqlType: SQLType
    values: DiscriminatorValue[]
  }
}

function buildStructWithRelationsStatements(
  descriptor: StructDescriptor,
  opts: InternalStructDDLOptions,
): string[] {
  const { tableName, dialect, includeEntitiesForeignKey, leafUnionContext } = opts
  const preStatements: string[] = []
  const postStatements: string[] = []
  const columnDefs: string[] = ['    id TEXT PRIMARY KEY']
  const fkDefs: string[] = []

  if (leafUnionContext) {
    const { discriminator, discSqlType, values, mainTableName } = leafUnionContext
    const leafHasNull = values.some((v) => v === null)
    const leafCheck = formatCheckConstraint(discriminator, values, dialect)
    const defaultClause =
      values.length === 1 && values[0] !== null
        ? ` DEFAULT ${formatSQLLiteral(values[0], dialect)}`
        : ''
    columnDefs.push(
      `    ${discriminator} ${discSqlType}${leafHasNull ? '' : ' NOT NULL'}${defaultClause} ${leafCheck}`,
    )
    fkDefs.push(
      `    FOREIGN KEY(id, ${discriminator}) REFERENCES ${mainTableName}(id, ${discriminator}) ON DELETE CASCADE`,
    )
  }

  const mappings = getStructColumnMappings(descriptor, dialect)
  const mappingsByName = new Map(mappings.map((m) => [m.name, m]))

  for (const [fieldName, fieldDesc] of Object.entries(descriptor.fields)) {
    if (leafUnionContext && (fieldName === 'id' || fieldName === leafUnionContext.discriminator)) {
      continue
    }

    // 1. Direct discriminated union field -> create union main + leaf tables, reference via (field_id, field_type)
    if (isDiscriminatedUnionDescriptor(fieldDesc)) {
      const unionTableName = `${tableName}_${sanitizeIdentifier(fieldName)}`
      const unionStatements = buildDiscriminatedUnionStatements(fieldDesc, {
        mainTableName: unionTableName,
        dialect,
        includeEntitiesForeignKey: false,
      })
      preStatements.push(...unionStatements)

      const disc = fieldDesc.discriminator!
      const allVals = fieldDesc.variants.flatMap((v) =>
        v.kind === 'struct'
          ? extractVariantDiscriminatorValuesFromDescriptor(v, disc)
          : [],
      )
      const discSqlType = inferDiscriminatorSQLType(allVals, dialect)
      const isNullable = Boolean(fieldDesc.nullable || fieldDesc.optional)
      const idCol = `${fieldName}_id`
      const typeCol = `${fieldName}_${disc}`
      const nullSuffix = isNullable ? (dialect === 'sqlite' ? ' DEFAULT NULL' : '') : ' NOT NULL'
      const checkClause =
        allVals.length > 0 ? ` ${formatCheckConstraint(typeCol, allVals, dialect)}` : ''

      columnDefs.push(`    ${idCol} TEXT${nullSuffix}`)
      columnDefs.push(`    ${typeCol} ${discSqlType}${nullSuffix}${checkClause}`)
      fkDefs.push(
        `    FOREIGN KEY(${idCol}, ${typeCol}) REFERENCES ${unionTableName}(id, ${disc}) ON DELETE ${isNullable ? 'SET NULL' : 'CASCADE'}`,
      )
      continue
    }

    // 2. Array of discriminated union -> 1-to-N child union main table (referencing parent) + N leaf tables
    if (fieldDesc.kind === 'array' && isDiscriminatedUnionDescriptor(fieldDesc.items)) {
      const childUnionTableName = `${tableName}_${sanitizeIdentifier(fieldName)}`
      const parentFkCol = getParentFkColumnName(tableName)
      const childStatements = buildDiscriminatedUnionStatements(fieldDesc.items, {
        mainTableName: childUnionTableName,
        dialect,
        includeEntitiesForeignKey: false,
        parentRef: {
          tableName,
          fkColumnName: parentFkCol,
        },
      })
      postStatements.push(...childStatements)
      continue
    }

    const col = mappingsByName.get(fieldName)!
    columnDefs.push(`    ${formatColumnDefinition(col, dialect)}`)
  }

  if (includeEntitiesForeignKey) {
    fkDefs.push('    FOREIGN KEY(id) REFERENCES entities(id) ON DELETE CASCADE')
  }

  const mainTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n${[...columnDefs, ...fkDefs].join(',\n')}\n);`

  return [...preStatements, mainTableSQL, ...postStatements]
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

type DDLSchemaInput<T extends StructDescriptor | UnionDescriptor = StructDescriptor | UnionDescriptor> =
  | { descriptor: T }
  | T

function normalizeDDLArgs<T extends StructDescriptor | UnionDescriptor>(
  schemaOrName: string | DDLSchemaInput<T>,
  descriptorOrOptions?: DDLSchemaInput<T> | GenerateDDLOptions,
  options?: GenerateDDLOptions,
): {
  descriptor: T
  dialect: SQLDialect
  tableName: string
  includeEntitiesForeignKey: boolean
} {
  let descriptor: T
  let opts: GenerateDDLOptions
  let derivedTableName: string

  if (typeof schemaOrName === 'string') {
    derivedTableName = getStructTableName(schemaOrName)
    descriptor = resolveDescriptor(descriptorOrOptions as DDLSchemaInput<T>) as T
    opts = options || {}
  } else {
    descriptor = resolveDescriptor(schemaOrName) as T
    opts = (descriptorOrOptions as GenerateDDLOptions) || {}
    const inferredName = descriptor?.name || descriptor?.title
    derivedTableName =
      opts.tableName ||
      (typeof inferredName === 'string' ? getStructTableName(inferredName) : 'records')
  }

  const dialect: SQLDialect = opts.dialect || 'sqlite'
  const tableName = opts.tableName || derivedTableName
  const includeEntitiesForeignKey =
    opts.includeEntitiesForeignKey ?? (dialect === 'sqlite' && typeof schemaOrName === 'string')

  return { descriptor, dialect, tableName, includeEntitiesForeignKey }
}

/**
 * Generates SQL DDL statements for a discriminated union (oneOf):
 * - A main table holding `id` and the discriminator column (with CHECK and UNIQUE (id, discriminator))
 * - One leaf table per variant keeping `id`, the discriminator column (with CHECK/DEFAULT),
 *   all variant-specific columns, and a composite FOREIGN KEY (id, discriminator) referencing the main table.
 */
export function generateDiscriminatedUnionDDL(
  unionName: string,
  descriptor: { descriptor: UnionDescriptor } | UnionDescriptor,
  options?: GenerateDDLOptions,
): string[]
export function generateDiscriminatedUnionDDL(
  schemaOrDescriptor: { descriptor: UnionDescriptor } | UnionDescriptor,
  options?: GenerateDDLOptions,
): string[]
export function generateDiscriminatedUnionDDL(
  unionOrName: string | { descriptor: UnionDescriptor } | UnionDescriptor,
  descriptorOrOptions?: { descriptor: UnionDescriptor } | UnionDescriptor | GenerateDDLOptions,
  options?: GenerateDDLOptions,
): string[] {
  const { descriptor, dialect, tableName, includeEntitiesForeignKey } =
    normalizeDDLArgs<UnionDescriptor>(unionOrName, descriptorOrOptions, options)

  if (!isDiscriminatedUnionDescriptor(descriptor)) {
    throw new Error(
      'generateDiscriminatedUnionDDL requires a DiscriminatedUnionSchema or UnionDescriptor with a discriminator',
    )
  }

  return buildDiscriminatedUnionStatements(descriptor, {
    mainTableName: tableName,
    dialect,
    includeEntitiesForeignKey,
  })
}

/**
 * Generates all SQL DDL statements (tables, foreign keys, and indexes) for a StructSchema or DiscriminatedUnionSchema,
 * expanding any discriminated union (`oneOf`) fields or arrays into normalized main + leaf tables.
 */
export function generateSchemaDDL(
  name: string,
  schemaOrDescriptor:
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
  options?: GenerateDDLOptions,
): string[]
export function generateSchemaDDL(
  schemaOrDescriptor:
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
  options?: GenerateDDLOptions,
): string[]
export function generateSchemaDDL(
  schemaOrName:
    | string
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
  descriptorOrOptions?:
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor
    | GenerateDDLOptions,
  options?: GenerateDDLOptions,
): string[] {
  const { descriptor, dialect, tableName, includeEntitiesForeignKey } = normalizeDDLArgs(
    schemaOrName,
    descriptorOrOptions,
    options,
  )

  if (isDiscriminatedUnionDescriptor(descriptor)) {
    return buildDiscriminatedUnionStatements(descriptor, {
      mainTableName: tableName,
      dialect,
      includeEntitiesForeignKey,
    })
  }

  if (!descriptor || descriptor.kind !== 'struct' || !descriptor.fields) {
    throw new Error(
      'generateSchemaDDL requires a struct or discriminated union schema/descriptor',
    )
  }

  return buildStructWithRelationsStatements(descriptor, {
    tableName,
    dialect,
    includeEntitiesForeignKey,
  })
}

/**
 * Generates dynamic DDL CREATE TABLE statements for a specific Struct or DiscriminatedUnion definition.
 *
 * Supports both:
 * - Low-level: `generateStructDDL('users', descriptor, options)`
 * - High-level: `generateStructDDL(UserSchema, options)`
 *
 * For discriminated unions or structs containing discriminated union fields/arrays, emits all
 * main, leaf, and index DDL statements separated by blank lines.
 */
export function generateStructDDL(
  structName: string,
  descriptor: StructDescriptor | UnionDescriptor | { descriptor: StructDescriptor | UnionDescriptor },
  options?: GenerateDDLOptions,
): string
export function generateStructDDL(
  schemaOrDescriptor:
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
  options?: GenerateDDLOptions,
): string
export function generateStructDDL(
  structOrName:
    | string
    | { descriptor: StructDescriptor | UnionDescriptor }
    | StructDescriptor
    | UnionDescriptor,
  descriptorOrOptions?:
    | StructDescriptor
    | UnionDescriptor
    | { descriptor: StructDescriptor | UnionDescriptor }
    | GenerateDDLOptions,
  options?: GenerateDDLOptions,
): string {
  const statements =
    typeof structOrName === 'string'
      ? generateSchemaDDL(
          structOrName,
          descriptorOrOptions as
            | StructDescriptor
            | UnionDescriptor
            | { descriptor: StructDescriptor | UnionDescriptor },
          options,
        )
      : generateSchemaDDL(structOrName, descriptorOrOptions as GenerateDDLOptions)

  return statements.join('\n\n')
}
