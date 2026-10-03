/**
 * Storage classes and entity metadata models for SQLite table mappings.
 */

export type StorageClass = 'LOCAL_ONLY' | 'REMOTE_CACHE' | 'REPLICATED'

export type FieldVisibility = 'PUBLIC' | 'HOST_ONLY' | 'OWNER_ONLY'

export interface EntityMetadata {
  id: string
  struct_id: string
  storage_class: StorageClass
  sequence_id: number
  created_at: number
}

export interface EntityRecord<T = Record<string, unknown>> extends EntityMetadata {
  data: T
}

export type SQLType =
  | 'INTEGER'
  | 'REAL'
  | 'TEXT'
  | 'BLOB'
  | 'BOOLEAN'
  | 'BIGINT'
  | 'DOUBLE PRECISION'
  | 'TIMESTAMPTZ'
  | (string & {})

export interface StructFieldMapping {
  name: string
  sqlType: SQLType
  nullable: boolean
  defaultValue?: string | number | boolean | bigint | null
  primaryKey?: boolean
  visibility?: FieldVisibility
}
