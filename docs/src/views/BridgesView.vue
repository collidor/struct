<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const standardSchemaSnippet = `import { s } from '@collidor/struct'

const schema = s.struct({
  apiKey: s.string().min(16),
  tier: s.enum(['free', 'pro', 'enterprise'])
})

// Access standard interface
const standard = schema['~standard']
console.log(standard.version) // 1
console.log(standard.vendor)  // 'collidor-struct'

// Execute standard validation
const result = standard.validate({ apiKey: 'abcdef1234567890', tier: 'pro' })
if ('value' in result) {
  console.log('Passed:', result.value)
} else {
  console.error('Errors:', result.issues)
}`

const zodBridgeSnippet = `import { s } from '@collidor/struct'
import { toZod, fromZod } from '@collidor/struct/bridges/zod'
import { z } from 'zod'

// 1. Convert @collidor/struct to Zod
const structSchema = s.struct({
  email: s.string().email(),
  count: s.number().int().min(1)
})

const zodSchema = toZod(structSchema)
// zodSchema is an authentic z.ZodObject preserving all bounds and custom error messages!
zodSchema.parse({ email: 'hello@collidor.com', count: 5 })

// 2. Convert Zod back to @collidor/struct
const originalZod = z.object({
  name: z.string().min(2),
  tags: z.array(z.string())
})

const convertedStruct = fromZod(originalZod)
// Ready for use with Axon, JSON Schema, or @collidor/ui!`

const jsonSchemaSnippet = `import { s } from '@collidor/struct'
import { toJSONSchema, fromJSONSchema } from '@collidor/struct/bridges/jsonSchema'

const schema = s.struct({
  title: s.string().min(1).describe('Post title'),
  rating: s.number().min(1).max(5),
  published: s.boolean().default(false)
})

// Export to JSON Schema (Draft 2020-12 / Draft 7)
const jsonSchema = toJSONSchema(schema)
/*
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "title": { "type": "string", "minLength": 1, "description": "Post title" },
    "rating": { "type": "number", "minimum": 1, "maximum": 5 },
    "published": { "type": "boolean", "default": false }
  },
  "required": ["title", "rating"]
}
*/

// Import JSON Schema directly into executable struct builders
const restoredSchema = fromJSONSchema(jsonSchema)`

const axonSnippet = `import { s } from '@collidor/struct'
import { isAssignable } from '@collidor/struct/bridges/axon'

// Check semantic subtyping and port compatibility in Axon graph workflows:
const strictNumber = s.number().min(0).max(100)
const broadNumber = s.number()

// Subtype check: Can a value from strictNumber flow into broadNumber?
console.log(isAssignable(strictNumber, broadNumber)) // true!

// But broadNumber cannot safely flow into a restricted range:
console.log(isAssignable(broadNumber, strictNumber)) // false!

// Complex structural subtyping:
const detailedUser = s.struct({ id: s.string(), name: s.string(), role: s.string() })
const basicUser = s.struct({ id: s.string(), name: s.string() })

console.log(isAssignable(detailedUser, basicUser)) // true (width subtyping)
console.log(isAssignable(basicUser, detailedUser)) // false`
</script>

<template>
  <section id="standard-schema" class="docs-section">
    <h2>Standard Schema V1</h2>
    <p>
      <code>@collidor/struct</code> was designed from the ground up to be fully compliant with the
      <a href="https://github.com/standard-schema/standard-schema" target="_blank" rel="noopener noreferrer">Standard Schema V1</a> specification.
      This allows you to use struct schemas directly with tRPC, FormKit, TanStack Form, and Vee-Validate without adapter layers:
    </p>
    <CodeBlock title="standard-schema.ts" language="typescript" :code="standardSchemaSnippet" />
  </section>

  <section id="zod-bridge" class="docs-section">
    <h2>Zod Bridge</h2>
    <p>
      Seamlessly interoperate with existing codebases using Zod. The bridge provides full bidirectional conversion:
    </p>
    <CodeBlock title="zod-bridge.ts" language="typescript" :code="zodBridgeSnippet" />
  </section>

  <section id="json-schema" class="docs-section">
    <h2>JSON Schema Bridge</h2>
    <p>
      Generate standard JSON Schema Draft 2020-12 and Draft 7 definitions for OpenAPI / Swagger specifications, client generators, or external validation engines:
    </p>
    <CodeBlock title="json-schema.ts" language="typescript" :code="jsonSchemaSnippet" />
  </section>

  <section id="axon-bridge" class="docs-section">
    <h2>Axon Graph Subtyping &amp; Lattice</h2>
    <p>
      For distributed computational graphs and Axon node ports, <code>isAssignable</code> calculates semantic type lattice compatibility and subtyping:
    </p>
    <CodeBlock title="axon-bridge.ts" language="typescript" :code="axonSnippet" />
    <Callout type="tip" title="Width & Depth Subtyping">
      The Axon bridge checks union variance, record key/value assignability, tuple positional assignability, and bounded number ranges automatically.
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}
</style>
