import type { EntityRecord, StorageClass } from './storage'
import { getStructTableName } from './ddl'

export interface SQLiteQueryResult<T = Record<string, unknown>> {
  rows: T[]
  rowsAffected: number
  lastInsertId?: string | number
}

export class SQLiteMemoryDatabase {
  private tables = new Map<string, Map<string, Record<string, unknown>>>() // tableName -> (id -> row)
  private inTransaction = false
  private transactionSnapshot: Map<string, Map<string, Record<string, unknown>>> | null = null

  constructor() {
    this.createTable('entities')
    this.createTable('entity_edges')
  }

  public createTable(tableName: string): void {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map())
    }
  }

  public dropTable(tableName: string): void {
    this.tables.delete(tableName)
  }

  public renameTable(oldName: string, newName: string): void {
    const table = this.tables.get(oldName)
    if (table) {
      this.tables.set(newName, table)
      this.tables.delete(oldName)
    }
  }

  public addColumn(tableName: string, columnName: string, defaultValue?: unknown): void {
    const table = this.tables.get(tableName)
    if (table) {
      for (const row of table.values()) {
        if (!(columnName in row)) {
          row[columnName] = defaultValue ?? null
        }
      }
    }
  }

  public beginTransaction(): void {
    if (this.inTransaction) throw new Error('Transaction already in progress.')
    this.inTransaction = true
    this.transactionSnapshot = this.cloneTables()
  }

  public commit(): void {
    if (!this.inTransaction) throw new Error('No transaction to commit.')
    this.inTransaction = false
    this.transactionSnapshot = null
  }

  public rollback(): void {
    if (!this.inTransaction) throw new Error('No transaction to rollback.')
    if (this.transactionSnapshot) {
      this.tables = this.transactionSnapshot
    }
    this.inTransaction = false
    this.transactionSnapshot = null
  }

  public insert(tableName: string, id: string, row: Record<string, unknown>): void {
    this.createTable(tableName)
    this.tables.get(tableName)!.set(id, { ...row, id })
  }

  public update(tableName: string, id: string, patch: Record<string, unknown>): void {
    const table = this.tables.get(tableName)
    if (table && table.has(id)) {
      const existing = table.get(id)!
      table.set(id, { ...existing, ...patch })
    }
  }

  public delete(tableName: string, id: string): boolean {
    const table = this.tables.get(tableName)
    if (table) {
      return table.delete(id)
    }
    return false
  }

  public get(tableName: string, id: string): Record<string, unknown> | undefined {
    return this.tables.get(tableName)?.get(id)
  }

  public all(tableName: string): Record<string, unknown>[] {
    return Array.from(this.tables.get(tableName)?.values() ?? [])
  }

  private cloneTables(): Map<string, Map<string, Record<string, unknown>>> {
    const clone = new Map<string, Map<string, Record<string, unknown>>>()
    for (const [tName, tMap] of this.tables.entries()) {
      const rowClone = new Map<string, Record<string, unknown>>()
      for (const [rId, row] of tMap.entries()) {
        try {
          rowClone.set(rId, JSON.parse(JSON.stringify(row)))
        } catch {
          rowClone.set(rId, { ...row })
        }
      }
      clone.set(tName, rowClone)
    }
    return clone
  }
}

/**
 * SQLite Entity Store Adapter implementing the full transactional store contract.
 */
export class SQLiteEntityStoreAdapter {
  private db: SQLiteMemoryDatabase

  constructor(db: SQLiteMemoryDatabase = new SQLiteMemoryDatabase()) {
    this.db = db
  }

  public getDatabase(): SQLiteMemoryDatabase {
    return this.db
  }

  public getEntity(id: string): EntityRecord | undefined {
    const baseEntity = this.db.get('entities', id)
    if (!baseEntity) return undefined

    const structId = String(baseEntity.struct_id)
    const structTableName = getStructTableName(structId)
    const structData = this.db.get(structTableName, id) ?? {}

    return {
      id,
      struct_id: structId,
      storage_class: baseEntity.storage_class as StorageClass,
      sequence_id: Number(baseEntity.sequence_id ?? 1),
      created_at: Number(baseEntity.created_at ?? Date.now()),
      data: { ...structData },
    }
  }

  public saveEntity(
    id: string,
    structId: string,
    sequenceId: number,
    data: Record<string, unknown>,
    storageClass: StorageClass = 'REPLICATED',
  ): void {
    const structTableName = getStructTableName(structId)

    // 1. Update entities catalog
    this.db.insert('entities', id, {
      id,
      struct_id: structId,
      storage_class: storageClass,
      sequence_id: sequenceId,
      created_at: Date.now(),
    })

    // 2. Update struct-specific table
    this.db.insert(structTableName, id, {
      ...data,
      id,
    })
  }

  public deleteEntity(id: string): void {
    const baseEntity = this.db.get('entities', id)
    if (baseEntity) {
      const structTableName = getStructTableName(String(baseEntity.struct_id))
      this.db.delete(structTableName, id)
    }
    this.db.delete('entities', id)
  }

  public beginTransaction(): void {
    this.db.beginTransaction()
  }

  public commitTransaction(): void {
    this.db.commit()
  }

  public rollbackTransaction(): void {
    this.db.rollback()
  }
}
