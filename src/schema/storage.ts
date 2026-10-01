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

export interface StructFieldMapping {
  name: string
  sqlType: 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB'
  nullable: boolean
  defaultValue?: string | number | boolean | null
  primaryKey?: boolean
  visibility?: FieldVisibility
}
