<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const primitivesSnippet = `import { s } from '@collidor/struct'

// Scalar primitives
const str = s.string()
const num = s.number()
const int = s.integer() // enforces Number.isInteger()
const bool = s.boolean()
const date = s.date() // validates Date objects (and rejects invalid NaN dates)
const big = s.bigint() // validates bigint primitives
const anyVal = s.any()
const unk = s.unknown()`

const stringsSnippet = `// String validation rules and fluent sanitizers
const username = s.string()
  .trim()                   // automatically trims whitespace
  .toLowerCase()            // normalizes casing
  .min(3, 'Too short')     // min length with custom message
  .max(30, 'Too long')     // max length
  .regex(/^[a-z0-9_]+$/)    // pattern check

const email = s.string().trim().email('Invalid email address')
const profileUrl = s.string().url('Must be a valid HTTP/HTTPS URL')
const token = s.string().uuid('Must be a valid UUIDv4')`

const numbersSnippet = `// Number constraints and precision rules
const score = s.number()
  .min(0)
  .max(100)
  .step(0.5) // ensures value is multiple of step

const count = s.integer().positive() // > 0
const index = s.integer().nonnegative() // >= 0

// Coercion pipeline: converts input values before validation
const coercedNum = s.coerce.number()  // "42" -> 42
const coercedDate = s.coerce.date()    // "2026-10-03" -> Date object
const coercedBool = s.coerce.boolean() // "true" | 1 -> true`

const structsSnippet = `// Object structs with shape inheritance and manipulation
const BaseEntity = s.struct({
  id: s.string().uuid(),
  createdAt: s.date().default(() => new Date()),
  updatedAt: s.date().default(() => new Date())
})

// Extend creates a new schema with additional fields
const UserProfile = BaseEntity.extend({
  displayName: s.string().min(2),
  bio: s.optional(s.string().max(280))
})

// Pick / Omit subsets
const PublicUser = UserProfile.pick('displayName', 'bio')
const CreateInput = UserProfile.omit('id', 'createdAt', 'updatedAt')

// Make all fields optional for PATCH endpoints
const UpdatePatch = UserProfile.partial()`

const collectionsSnippet = `// Arrays with length constraints and uniqueness
const tags = s.array(s.string().toLowerCase())
  .min(1, 'At least 1 tag required')
  .max(10, 'At most 10 tags allowed')
  .unique('Tags must be unique')

// Positional typed Tuples
const coordinates = s.tuple([
  s.number().min(-90).max(90),   // Latitude
  s.number().min(-180).max(180)  // Longitude
])

// Key-Value Dictionary Records
const scores = s.record(s.string(), s.number())`

const unionsSnippet = `// Strict string enums
const Status = s.enum(['draft', 'published', 'archived'] as const)

// Literal singletons
const ActiveLiteral = s.literal('ACTIVE')

// Discriminated / Untagged Unions
const Event = s.union([
  s.struct({ type: s.literal('click'), x: s.number(), y: s.number() }),
  s.struct({ type: s.literal('keypress'), key: s.string() })
])`

const modifiersSnippet = `// Custom Business Rules (.refine)
const PasswordForm = s.struct({
  password: s.string().min(8),
  confirmPassword: s.string()
}).refine(
  (data) => data.password === data.confirmPassword,
  'Passwords do not match',
  ['confirmPassword'] // target path for error
)

// Data Transformation (.transform)
const PriceWithTax = s.number().transform((price) => ({
  subtotal: price,
  tax: Math.round(price * 0.2 * 100) / 100,
  total: Math.round(price * 1.2 * 100) / 100
}))

// Rich Metadata Annotation
const TitleField = s.string()
  .describe('Blog post headline')
  .meta({ widget: 'textarea', placeholder: 'Enter an engaging title...' })`
</script>

<template>
  <section id="primitives" class="docs-section">
    <h2>Primitives &amp; Scalar Types</h2>
    <p>Construct primitive validators with built-in type inference:</p>
    <CodeBlock title="primitives.ts" language="typescript" :code="primitivesSnippet" />
  </section>

  <section id="strings" class="docs-section">
    <h2>String Rules &amp; Sanitizers</h2>
    <p>Strings support both validation rules (length, format) and seamless data sanitizers (trimming, casing normalization):</p>
    <CodeBlock title="strings.ts" language="typescript" :code="stringsSnippet" />
  </section>

  <section id="numbers" class="docs-section">
    <h2>Number Rules &amp; Coercions</h2>
    <p>Validate numerical bounds, integer precision, and coerce strings or dates via <code>s.coerce.*</code>:</p>
    <CodeBlock title="numbers.ts" language="typescript" :code="numbersSnippet" />
  </section>

  <section id="structs" class="docs-section">
    <h2>Structs &amp; Objects</h2>
    <p>Define object structures with descriptors, defaults, and composable operations like <code>extend</code>, <code>pick</code>, <code>omit</code>, and <code>partial</code>:</p>
    <CodeBlock title="structs.ts" language="typescript" :code="structsSnippet" />
  </section>

  <section id="collections" class="docs-section">
    <h2>Arrays, Tuples &amp; Records</h2>
    <p>Type-safe collections with element validation, array uniqueness, and fixed-length positional tuples:</p>
    <CodeBlock title="collections.ts" language="typescript" :code="collectionsSnippet" />
  </section>

  <section id="unions" class="docs-section">
    <h2>Enums, Literals &amp; Unions</h2>
    <p>Represent strict enumerations, literal constants, and discriminated unions:</p>
    <CodeBlock title="unions.ts" language="typescript" :code="unionsSnippet" />
  </section>

  <section id="modifiers" class="docs-section">
    <h2>Refinements &amp; Transforms</h2>
    <p>Apply custom multi-field validations with <code>.refine()</code>, data pipelines with <code>.transform()</code>, and UI metadata annotations with <code>.meta()</code>:</p>
    <CodeBlock title="modifiers.ts" language="typescript" :code="modifiersSnippet" />
    <Callout type="tip" title="InferInput vs InferOutput">
      When using <code>.transform()</code> or <code>s.coerce.*</code>, <code>s.inferInput&lt;T&gt;</code> represents the accepted raw input shape,
      while <code>s.infer&lt;T&gt;</code> represents the transformed output type!
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}
</style>
