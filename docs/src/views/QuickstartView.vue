<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const installPnpm = `pnpm add @collidor/struct`
const installNpm = `npm install @collidor/struct`
const installJsr = `deno add jsr:@collidor/struct`
const installBun = `bun add @collidor/struct`

const quickstartSnippet = `import { s } from '@collidor/struct'

// Define a type-safe data structure with validation rules and sanitizers
export const UserSchema = s.struct({
  id: s.string().uuid(),
  username: s.string().trim().toLowerCase().min(3).max(24),
  email: s.string().trim().email(),
  age: s.number().integer().min(18).max(120),
  role: s.enum(['admin', 'editor', 'viewer'] as const).default('viewer'),
  website: s.optional(s.string().url()),
  verified: s.boolean().default(false),
})

// Infer TypeScript static types directly
export type User = s.infer<typeof UserSchema>
// => { id: string; username: string; email: string; age: number; role: 'admin' | 'editor' | 'viewer'; website?: string; verified: boolean }

// Standard Schema V1 Validation
const result = UserSchema['~standard'].validate({
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  username: '  AliceDev  ',
  email: 'alice@example.com',
  age: 29
})

if (result.issues) {
  console.error('Validation failed:', result.issues)
} else {
  console.log('Sanitized & valid user:', result.value)
  // Output username is cleanly trimmed & lowercased: "alicedev"
  // Default values applied: role = "viewer", verified = false
}`
</script>

<template>
  <section id="overview" class="docs-section">
    <h1>@collidor/struct</h1>
    <p class="lead">
      High-performance, modular data structure builder and validation engine with <strong>Standard Schema V1</strong> compliance,
      bidirectional <strong>Zod</strong> &amp; <strong>JSON Schema</strong> bridges, <strong>Axon graph port subtyping</strong>, and dynamic form generation for <strong>@collidor/ui</strong>.
    </p>

    <div class="feature-grid">
      <div class="feature-card">
        <h4>⚡ Zero-Dependency Core</h4>
        <p>Lightweight, tree-shakable runtime designed for high-frequency validation, edge functions, and in-browser execution.</p>
      </div>

      <div class="feature-card">
        <h4>📐 Standard Schema V1</h4>
        <p>Native compliance with the universal <code>~standard</code> specification. Interoperates with tRPC, FormKit, TanStack Form, and Vee-Validate.</p>
      </div>

      <div class="feature-card">
        <h4>🌉 Universal Bridges</h4>
        <p>Bidirectional lossless conversion with Zod and JSON Schema (Draft 7 / 2020-12), plus Axon graph type lattice subtyping.</p>
      </div>

      <div class="feature-card">
        <h4>🎨 Native Form Generation</h4>
        <p>Plugs straight into <code>&lt;ui-struct-form&gt;</code> from <code>@collidor/ui</code> with automatic widget inference and constraint enforcement.</p>
      </div>
    </div>
  </section>

  <section id="installation" class="docs-section">
    <h2>Installation</h2>
    <p>Install <code>@collidor/struct</code> using your preferred package manager or JSR for Deno:</p>

    <div class="install-tabs">
      <CodeBlock title="pnpm" language="bash" :code="installPnpm" />
      <CodeBlock title="npm" language="bash" :code="installNpm" />
      <CodeBlock title="jsr (Deno)" language="bash" :code="installJsr" />
      <CodeBlock title="bun" language="bash" :code="installBun" />
    </div>

    <Callout type="tip" title="JSR & Deno Support">
      <code>@collidor/struct</code> has zero slow-types and is published directly to <strong>JSR</strong> at
      <a href="https://jsr.io/@collidor/struct" target="_blank" rel="noopener noreferrer">jsr.io/@collidor/struct</a>.
    </Callout>
  </section>

  <section id="quickstart" class="docs-section">
    <h2>Quickstart</h2>
    <p>Construct a schema with <code>s.struct()</code>, apply string sanitizers and numerical bounds, and validate synchronously or asynchronously:</p>

    <CodeBlock title="quickstart.ts" language="typescript" :code="quickstartSnippet" />

    <Callout type="info" title="Standard Schema Native">
      Every schema returned by <code>s.*</code> implements the <code>StandardSchemaV1</code> specification through its <code>['~standard']</code> property.
      It works out of the box with any library in the JavaScript ecosystem that supports Standard Schema!
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}

.lead {
  font-size: 1.15rem;
  line-height: 1.618;
  color: var(--ui-color-text-muted, oklch(0.85 0.02 260));
  margin-bottom: 2em;
}

.install-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8em;
}
@media (max-width: 768px) {
  .install-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
