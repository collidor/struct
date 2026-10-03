<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const ddlSnippet = `import { s, generateStructDDL } from '@collidor/struct'

const ArticleSchema = s.struct({
  id: s.string().uuid(),
  title: s.string().min(1).max(255),
  views: s.number().integer().min(0).default(0),
  published: s.boolean().default(false),
  rating: s.optional(s.number()),
  content: s.string()
})

// Generate SQLite DDL
const sqliteDDL = generateStructDDL(ArticleSchema, {
  tableName: 'articles',
  dialect: 'sqlite'
})
/*
CREATE TABLE IF NOT EXISTS "articles" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "title" TEXT NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "published" INTEGER NOT NULL DEFAULT 0,
  "rating" REAL,
  "content" TEXT NOT NULL
);
*/

// Generate PostgreSQL DDL
const pgDDL = generateStructDDL(ArticleSchema, {
  tableName: 'articles',
  dialect: 'postgres'
})`

const migrationsSnippet = `import { s, SchemaMigrationEngine } from '@collidor/struct'

// Version 1 Schema
const V1 = s.struct({
  id: s.string().uuid(),
  name: s.string()
})

// Version 2 Schema: added email, renamed/modified name
const V2 = s.struct({
  id: s.string().uuid(),
  name: s.string().max(100),
  email: s.string().email().default('user@example.com'),
  active: s.boolean().default(true)
})

const engine = new SchemaMigrationEngine()
const plan = engine.diff(V1, V2, { tableName: 'users' })

console.log(plan.operations)
// Emits atomic migration operations:
// [
//   { type: 'addColumn', column: 'email', sql: 'ALTER TABLE "users" ADD COLUMN "email" TEXT NOT NULL DEFAULT ...' },
//   { type: 'addColumn', column: 'active', sql: 'ALTER TABLE "users" ADD COLUMN "active" INTEGER NOT NULL DEFAULT 1' }
// ]`
</script>

<template>
  <section id="sql-ddl" class="docs-section">
    <h2>SQL DDL Generation</h2>
    <p>
      Export struct schemas directly into production-grade SQL DDL for SQLite and PostgreSQL:
    </p>
    <CodeBlock title="ddl.ts" language="typescript" :code="ddlSnippet" />
  </section>

  <section id="migrations" class="docs-section">
    <h2>Schema Migration Engine</h2>
    <p>
      Automatically calculate schema drift and migration plans between two versions of a struct:
    </p>
    <CodeBlock title="migrations.ts" language="typescript" :code="migrationsSnippet" />
    <Callout type="tip" title="Deterministic Schema Diffing">
      The migration engine inspects field descriptors, type shifts, default changes, and nullability transitions to produce safe, non-destructive migration operations.
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}
</style>
