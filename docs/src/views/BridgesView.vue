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
import { toZod, fromZod, fromZodV3 } from '@collidor/struct/bridges/zod'
import { z } from 'zod'

// 1. Convert @collidor/struct to Zod (including discriminated unions)
const EventSchema = s.discriminatedUnion('type', [
  s.struct({ type: s.literal('click'), x: s.number(), y: s.number() }),
  s.struct({ type: s.literal('keypress'), key: s.string() }),
])

const zodEvent = toZod(EventSchema)
// Produces z.discriminatedUnion('type', [...]) preserving all constraints!
zodEvent.parse({ type: 'click', x: 10, y: 20 })

// 2. Convert Zod back to @collidor/struct (fromZod for Zod 4, fromZodV3 for Zod 3)
const originalZod = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), data: z.string() }),
  z.object({ status: z.literal('err'), message: z.string() }),
])

const convertedStruct = fromZodV3(originalZod)
// Preserves DiscriminatedUnionSchema (and falls back to UnionSchema if incompatible)`

const jsonSchemaSnippet = `import { s } from '@collidor/struct'
import { toJSONSchema, fromJSONSchema } from '@collidor/struct/bridges/jsonSchema'

const schema = s.discriminatedUnion('kind', [
  s.struct({ kind: s.literal('email'), address: s.string().email() }),
  s.struct({ kind: s.literal('sms'), phone: s.string() }),
])

// Export to JSON Schema (emits oneOf + OpenAPI/JSON Schema discriminator)
const jsonSchema = toJSONSchema(schema)
/*
{
  "oneOf": [
    { "type": "object", "properties": { "kind": { "const": "email" }, "address": { "type": "string", "format": "email" } }, "required": ["kind", "address"] },
    { "type": "object", "properties": { "kind": { "const": "sms" }, "phone": { "type": "string" } }, "required": ["kind", "phone"] }
  ],
  "discriminator": { "propertyName": "kind" }
}
*/

// Import JSON Schema back into an executable DiscriminatedUnionSchema
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
      Seamlessly interoperate with existing codebases using Zod. The bridge converts in both directions:
      <code>fromZod</code> reads Zod 4 schemas and <code>fromZodV3</code> reads Zod 3 ones, and each refuses the other's.
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
