import type { StructDescriptor } from '../types/ast'
import {
  generateStructDDL,
  getStructColumnMappings,
  getStructTableName,
  formatColumnDefinition,
} from './ddl'

export interface SchemaDiff {
  structName: string
  addedFields: string[]
  removedFields: string[]
  typeChangedFields: { field: string; oldType: string; newType: string }[]
  requiresTableRecreation: boolean
}

export interface MigrationScript {
  structName: string
  fromVersion: number
  toVersion: number
  upSql: string[]
  requiresTableRecreation: boolean
  dataMigrator?: (oldData: Record<string, unknown>) => Record<string, unknown>
}

export class SchemaMigrationEngine {
  private static registeredMigrations: MigrationScript[] = []

  /**
   * Clears all registered migrations to reset engine state between tests.
   */
  public static clearMigrations(): void {
    this.registeredMigrations = []
  }

  /**
   * Registers a migration script in the global migration graph.
   */
  public static registerMigration(script: MigrationScript): void {
    const existing = this.registeredMigrations.findIndex(
      (m) =>
        m.structName === script.structName &&
        m.fromVersion === script.fromVersion &&
        m.toVersion === script.toVersion,
    )
    if (existing >= 0) {
      this.registeredMigrations[existing] = script
    } else {
      this.registeredMigrations.push(script)
    }
  }

  /**
   * Resolves a multi-step migration path (DAG) from fromVersion to toVersion.
   */
  public static resolveMigrationPath(
    structName: string,
    fromVersion: number,
    toVersion: number,
  ): MigrationScript[] {
    if (fromVersion === toVersion) return []

    const relevant = this.registeredMigrations.filter((m) => m.structName === structName)
    const path: MigrationScript[] = []
    let current = fromVersion

    while (current < toVersion) {
      const nextStep = relevant.find((m) => m.fromVersion === current)
      if (!nextStep) {
        throw new Error(
          `Cannot resolve migration path for '${structName}' from v${fromVersion} to v${toVersion}: missing step from v${current}.`,
        )
      }
      path.push(nextStep)
      current = nextStep.toVersion
    }

    return path
  }

  /**
   * Compares two StructDescriptors and detects field additions, deletions, and type modifications.
   */
  public static diff(
    structName: string,
    oldSchema: StructDescriptor,
    newSchema: StructDescriptor,
  ): SchemaDiff {
    const oldMappings = new Map(getStructColumnMappings(oldSchema).map((m) => [m.name, m]))
    const newMappings = new Map(getStructColumnMappings(newSchema).map((m) => [m.name, m]))

    const addedFields: string[] = []
    const removedFields: string[] = []
    const typeChangedFields: { field: string; oldType: string; newType: string }[] = []

    for (const [name, newCol] of newMappings.entries()) {
      const oldCol = oldMappings.get(name)
      if (!oldCol) {
        addedFields.push(name)
      } else if (oldCol.sqlType !== newCol.sqlType) {
        typeChangedFields.push({
          field: name,
          oldType: oldCol.sqlType,
          newType: newCol.sqlType,
        })
      }
    }

    for (const name of oldMappings.keys()) {
      if (!newMappings.has(name)) {
        removedFields.push(name)
      }
    }

    const requiresTableRecreation = removedFields.length > 0 || typeChangedFields.length > 0

    return {
      structName,
      addedFields,
      removedFields,
      typeChangedFields,
      requiresTableRecreation,
    }
  }

  /**
   * Generates safe SQLite DDL statements for migrating from oldSchema to newSchema.
   */
  public static generateMigration(
    structName: string,
    oldSchema: StructDescriptor,
    newSchema: StructDescriptor,
    fromVersion = 1,
    toVersion = 2,
    dataMigrator?: (oldData: Record<string, unknown>) => Record<string, unknown>,
  ): MigrationScript {
    const diff = this.diff(structName, oldSchema, newSchema)
    const tableName = getStructTableName(structName)
    const upSql: string[] = []

    if (!diff.requiresTableRecreation) {
      // Simple ADD COLUMN statements
      const newMappings = new Map(getStructColumnMappings(newSchema).map((m) => [m.name, m]))
      for (const addedField of diff.addedFields) {
        const col = newMappings.get(addedField)!
        upSql.push(`ALTER TABLE ${tableName} ADD COLUMN ${formatColumnDefinition(col)};`)
      }
    } else {
      // Complex migration: Table recreation strategy for SQLite
      const tempTableName = `${tableName}_new`
      const rawNewDDL = generateStructDDL(structName, newSchema)
      const createTempDDL = rawNewDDL.replace(tableName, tempTableName)

      upSql.push(createTempDDL)

      // Identify common columns that can be safely copied
      const oldMappings = new Set(getStructColumnMappings(oldSchema).map((m) => m.name))
      const newMappings = new Set(getStructColumnMappings(newSchema).map((m) => m.name))
      const commonCols = ['id', ...Array.from(newMappings).filter((c) => oldMappings.has(c))]

      const colsList = commonCols.join(', ')
      upSql.push(`INSERT INTO ${tempTableName} (${colsList}) SELECT ${colsList} FROM ${tableName};`)
      upSql.push(`DROP TABLE ${tableName};`)
      upSql.push(`ALTER TABLE ${tempTableName} RENAME TO ${tableName};`)
    }

    return {
      structName,
      fromVersion,
      toVersion,
      upSql,
      requiresTableRecreation: diff.requiresTableRecreation,
      dataMigrator,
    }
  }
}

export function clearMigrations(): void {
  SchemaMigrationEngine.clearMigrations()
}

