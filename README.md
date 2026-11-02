# @collidor/struct

Modular data structure builder with Standard Schema compliance, JSON Schema / Zod bidirectional bridges, Axon graph port typing, and Vee-Validate form generation.

## Features

- 📐 **Standard Schema V1 Compliant**: Works directly with modern form, validation, and API libraries.
- 🔄 **Bidirectional Bridges**: Lossless interop with **Zod** (`toZod`, `fromZod`) and **JSON Schema** (`toJSONSchema`, `fromJSONSchema`).
- ⚡ **Axon Port Subtyping**: Complete graph data type descriptor mapping and subtype compatibility checker (`isAssignable`).
- 📝 **Dynamic UI Form Generation**: Automated field layout, widget inference, and interactive form builder (`StructBuilder`, `getFormFields`).
- 🗄️ **Storage & DDL Migrations**: Schema DDL generation and transactional migrations for SQLite/SQL backends.
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

## Unified Form Builder (`@collidor/struct/form`)

The `@collidor/struct/form` secondary export unifies spatial layout containers, non-data UI decorators, conditional rendering, and collection view modes directly inside structure definitions:

```typescript
import { f } from "@collidor/struct/form";

const OnboardingForm = f.struct({
  banner: f.alert({
    title: "Welcome",
    message: "Fill in your details below",
    tone: "info",
  }),

  // Put two inputs on the same line
  nameRow: f.row({
    firstName: f.string().min(2),
    lastName: f.string().min(2),
  }, { gap: "1rem" }),

  accountType: f.enum(["personal", "business"] as const).default("personal"),

  // Conditional branch (validation bypassed when hidden)
  companyInfo: f.when('accountType == "business"', {
    companyName: f.string(),
    vatId: f.string(),
  }),

  // Collection view modes (asTable, asList, asCards, asTags)
  skills: f.array(f.string()).asTags(),
  submitBtn: f.button({ label: "Create Account", action: "submit" }),
});

// Flat data model: UI-only nodes stripped, layout containers flattened!
const validated = OnboardingForm.parse({
  firstName: "Ada",
  lastName: "Lovelace",
  accountType: "personal",
  skills: ["computing", "math"],
});

// Framework-agnostic Headless Form Controller
const controller = f.createController(OnboardingForm, {
  initialValues: validated,
  onSubmit: (values) => console.log("Submitted:", values),
});
```

## Zod & JSON Schema Interop

```typescript
import { s, toZod, fromZod, toJSONSchema, fromJSONSchema } from "@collidor/struct";
import { z } from "zod";

// Convert struct to Zod
const zodUser = toZod(UserSchema);

// Convert Zod to struct
const zodSchema = z.object({ count: z.number().int().positive() });
const structFromZod = fromZod(zodSchema);

// JSON Schema export
const jsonSchema = toJSONSchema(UserSchema);
```

## License

MIT © [Alykam Burdzaki](https://alykam.com)
