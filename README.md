# @collidor/struct

Modular data structure builder with Standard Schema compliance, JSON Schema / Zod bidirectional bridges, Axon graph port typing, and Vee-Validate form generation.

## Features

- 📐 **Standard Schema V1 Compliant**: Works directly with modern form, validation, and API libraries.
- 🔄 **Bidirectional Bridges**: Interop with **Zod 3 and 4** (`toZod`, `fromZod`, `fromZodV3`) and **JSON Schema** (`toJSONSchema`, `fromJSONSchema`).
- ⚡ **Axon Port Subtyping**: Complete graph data type descriptor mapping and subtype compatibility checker (`isAssignable`).
- 📝 **Dynamic UI Form Generation**: Automated field layout, widget inference, and interactive form builder (`StructBuilder`, `descriptorToFormTree`).
- 🗄️ **Storage & DDL Migrations**: Schema DDL generation (including normalized main + leaf tables for discriminated unions via `generateDiscriminatedUnionDDL` and `generateSchemaDDL`) and transactional migrations for SQLite/PostgreSQL backends.
- 🧮 **Computed Properties**: Safe in-memory formula evaluation with AST dependency topological resolution.

## Installation

### Deno / JSR
```bash
deno add jsr:@collidor/struct
```

### Node / npm / pnpm / Bun
```bash
npx jsr add @collidor/struct
# or
pnpm dlx jsr add @collidor/struct
# or
bunx jsr add @collidor/struct
```

Pin the `1.x` line (`jsr:@collidor/struct@^1`) if you are not ready for the form API changes described in
[Upgrading to the next major release](#upgrading-to-the-next-major-release).

## Quick Start

```typescript
import { s } from "@collidor/struct";

// Define a schema
const UserSchema = s.struct({
  id: s.string().uuid(),
  name: s.string().min(2).max(50),
  email: s.string().email(),
  age: s.number().positive().optional(),
  tags: s.array(s.string()).default([]),
});

// Validate synchronous or asynchronous
const result = UserSchema.safeParse({
  id: "123e4567-e89b-12d3-a456-426614174000",
  name: "Alykam",
  email: "alykam@example.com",
});

if (result.success) {
  console.log("Validated user:", result.data);
} else {
  console.error("Validation issues:", result.issues);
}
```

## Enums, Literals & Discriminated Unions

`EnumSchema` and `LiteralSchema` interoperate seamlessly, and `s.oneOf` supports both untagged unions and O(1) discriminated unions with a typesafe discriminator key as the second argument (also available on `f.oneOf` and round-tripped through Zod, JSON Schema, and SQL DDL):

```typescript
import { s, generateDiscriminatedUnionDDL } from "@collidor/struct";

// Enums accept primitives or literals and expose literal helpers
const Status = s.enum(["draft", "published", "archived"] as const);
const DraftLiteral = Status.literals.draft; // LiteralSchema<"draft">
const SingleEnum = s.literal("ACTIVE").toEnum(); // EnumSchema<readonly ["ACTIVE"]>

// Discriminated union — 2nd argument autocompletes only valid shared Literal/Enum keys
const Event = s.oneOf(
  [
    s.struct({ type: s.literal("click"), x: s.number(), y: s.number() }),
    s.struct({ type: s.literal("keypress"), key: s.string() }),
  ],
  "type",
);

// Exhaustive enum-driven discriminated union (auto-injects discriminator literals)
const EventType = s.enum(["click", "keypress"] as const);
const ExhaustiveEvent = EventType.discriminatedUnion("type", {
  click: { x: s.number(), y: s.number() },
  keypress: s.struct({ key: s.string() }),
});

// Untagged union (omit the discriminator)
const StringOrNumber = s.oneOf([s.string(), s.number()]);

// Normalized SQL DDL (main table + per-variant leaf tables with composite FK)
const ddlStatements = generateDiscriminatedUnionDDL("events", Event, { dialect: "postgres" });
```

## Unified Form Builder (`@collidor/struct/form`)

The `@collidor/struct/form` secondary export unifies spatial layout containers, non-data UI decorators, conditional rendering, and
collection widgets directly inside structure definitions.

`f.*` is exclusively for form concerns (layout, decorators, widgets, controllers). **Data schemas always come from `s.*`**: a raw `s.*`
schema can be used directly as an `f.struct` field and gets a default widget inferred from its type. When you want a specific widget,
wrap the schema with `f.field(schema, { widget })`.

```typescript
import { s } from "@collidor/struct";
import { f } from "@collidor/struct/form";

const OnboardingForm = f.struct({
  banner: f.alert({
    title: "Welcome",
    message: "Fill in your details below",
    tone: "info",
  }),

  // Put two inputs on the same line. Raw s.* schemas use their inferred default widget.
  nameRow: f.row({
    firstName: s.string().min(2),
    lastName: s.string().min(2),
  }, { gap: "1rem" }),

  accountType: s.enum(["personal", "business"] as const).default("personal"),

  // Conditional branch (validation bypassed when hidden)
  companyInfo: f.when('accountType == "business"', {
    companyName: s.string(),
    vatId: s.string(),
  }),

  // Explicit widget: f.field(schema, { widget })
  bio: f.field(s.string().max(500), { widget: f.textarea().rows(4) }),
  volume: f.field(s.number().min(0).max(100), { widget: f.slider() }),

  // Collections: a collection widget wraps an s.array(...)
  skills: f.field(s.array(s.string()), { widget: f.tags() }),

  submitBtn: f.button({ label: "Create Account", action: "submit" }),
});

// Flat data model: UI-only nodes stripped, layout containers flattened!
const validated = OnboardingForm.parse({
  firstName: "Ada",
  lastName: "Lovelace",
  accountType: "personal",
  bio: "Mathematician",
  volume: 80,
  skills: ["computing", "math"],
});

// Framework-agnostic Headless Form Controller
const controller = f.createController(OnboardingForm, {
  initialValues: validated,
  onSubmit: (values) => console.log("Submitted:", values),
});
```

### Widgets

| Widget factory | Use with |
| --- | --- |
| `f.textInput()`, `f.textarea().rows(n)` | `s.string()` |
| `f.numberInput()`, `f.slider()`, `f.range()` | `s.number()` |
| `f.table(config)`, `f.tags(config)`, `f.list(config)`, `f.cards(config)` | `s.array(...)` |
| `f.tabsWidget(config)`, `f.combobox(config)` | `s.array(...)` |

`f.text(content)` is unrelated to `f.textInput()`: it stays a display-only informational node.

## Upgrading to the next major release

The form API is being reworked in the next major release. `f.*` becomes form-only, so the data-schema builders that used to live on `f`
are removed, and collection presentation moves from fluent array methods to widgets. If you depend on the current form API, pin
`@collidor/struct` to the `1.x` line until you have migrated.

| Before (1.x) | After |
| --- | --- |
| `f.string()`, `f.number()`, `f.boolean()`, ... | `s.string()`, `s.number()`, `s.boolean()`, ... (raw `s.*` schemas are valid `f.struct` fields) |
| `f.enum([...])` | `s.enum([...])` |
| `f.optional(x)` | `s.optional(x)` |
| `f.coerce` | `s.coerce` |
| `f.string().meta({ widget: 'textarea' })` | `f.field(s.string(), { widget: f.textarea().rows(4) })` |
| `f.array(x).asTable(config)` | `f.field(s.array(x), { widget: f.table(config) })` |
| `f.array(x).asTags(config)` | `f.field(s.array(x), { widget: f.tags(config) })` |
| `f.array(x).asList(config)` | `f.field(s.array(x), { widget: f.list(config) })` |
| `f.array(x).asCards(config)` | `f.field(s.array(x), { widget: f.cards(config) })` |

`f.text`, `f.heading`, `f.alert`, `f.divider`, `f.spacer`, `f.button`, `f.row`, `f.grid`, `f.tabs`, `f.section`, `f.steps`, `f.when`
and `f.createController` are unchanged. See the docs site for the full form guide.

## Zod & JSON Schema Interop

```typescript
import { s, toZod, fromZod, fromZodV3, toJSONSchema, fromJSONSchema } from "@collidor/struct";
import { z } from "zod/v4"; // or "zod" 4.x

// Convert struct to Zod
const zodUser = toZod(UserSchema);

// Convert a Zod 4 schema to struct
const zodSchema = z.object({ count: z.number().int().positive() });
const structFromZod = fromZod(zodSchema);

// JSON Schema export and import
const jsonSchema = toJSONSchema(UserSchema);
const structFromJson = fromJSONSchema(jsonSchema);
```

### Which `fromZod`

Zod 4 rewrote the internals the converters read, so there is one reader for each major version and each refuses the other's schemas
(a `TypeError` that names the right one) instead of converting them wrongly:

| Zod | Reader | Reads |
| --- | --- | --- |
| 4 (`zod` 4.x, `zod/v4`, `zod/mini`) | `fromZod` | `schema._zod.def` |
| 3 (`zod` 3.x) | `fromZodV3` | `schema._def` |

> **Upgrading:** `fromZod` used to read Zod 3 schemas. Rename existing calls on Zod 3 schemas to `fromZodV3`.

What the struct cannot express is dropped rather than guessed: a tuple's rest element, an intersection of anything but two objects (the
left side is kept), the type of a `catchall` (any catchall becomes `passthrough`), and a function default (evaluated once, at conversion).
A struct also has a single `min` and `max`, so when a schema states several (`.min(5).min(1)`), the strictest one is kept, as in Zod.

Where a struct and Zod 4 could differ, they match: a number is finite (`NaN` and `±Infinity` are invalid), an optional field that was not
given is left out of the output instead of being returned as `key: undefined`, and a literal has no default of its own (a missing value is
invalid, and `.default(value)` is how to fill one in). Zod 3 is the exception: it accepts `Infinity` as a number, so `fromZodV3` cannot
carry that over.

## License

MIT © [Alykam Burdzaki](https://alykam.com)
