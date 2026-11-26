# @collidor/struct

A modular data-structure and form-structure definition library unifying validation, type inference, structural capabilities, and declarative UI form architecture.

## Language

### Core Data Structure (`@collidor/struct`)

**Data Schema**:
A pure, UI-agnostic definition of a data type, its constraints, refinements, and transformations (`s.*`).
_Avoid_: Validator, model, blueprint

**Type Descriptor**:
The serializable AST representation of a schema's structural type and constraints.
_Avoid_: Schema JSON, raw schema

**Component**:
A named `StructSchema` that can be matched and extracted from composite entities by property name or shape.
_Avoid_: Trait, mixin, facet

### Unified Form Structure (`@collidor/struct/form`)

**Form Structure**:
A composite structure (`f.*`) that unifies data fields, layout containers, conditional branches, and UI-only nodes in a single keyed definition while stripping non-data elements and flattening transparent layout containers in the parsed data output.
_Avoid_: Form blueprint, UI overlay, form config

**Layout Container**:
A keyed structural node (`row`, `grid`, `section`, `tabs`, `accordion`, `split`) that arranges child nodes spatially in the UI while remaining transparent in the inferred data shape.
_Avoid_: Wrapper, box, field group, spread fragment

**UI-Only Node**:
A keyed node inside a Form Structure (`heading`, `text`, `divider`, `spacer`, `alert`, `button`, `computedDisplay`) that renders in the form tree but holds no user input and is stripped from parsed data and TypeScript output types.
_Avoid_: Dummy field, decorative field, pseudo-field

**Conditional Branch**:
A rule (`when`) governing whether a field or layout container is active based on current form values, coupling UI visibility with validation bypass when inactive.
Fields inside a branch are exported as optional (JSON Schema, Zod and DDL cannot say "required while this holds"); the form itself still requires them when the condition is true. `createDefault()` includes a branch only when its condition holds for the defaults. A key may appear in the `when` and `else` of one conditional (exactly one applies) but nowhere else in the same form struct: a key defined twice throws when the form is defined.
_Avoid_: Show-if, visibility filter, toggle group

**Collection View Mode**:
The explicit presentation and interaction strategy (`table`, `list`, `cards`, `tabs`, `tags`, `combobox`) bound to an array, record, or tuple schema.
_Avoid_: Array widget, repeater type

**Reactive Derivation**:
A setting of a field that depends on the form's live values, given to `f.field` and evaluated with the same expression language and scoping as a Conditional Branch (`$root`, `$parent`, `$item`, `$index`): `disabledWhen`, `readonlyWhen` (presentation only), `hidden` / `hiddenWhen` (a hidden field is exempt from validation: it never blocks a submit, reports nothing, and passes its value through unchecked), `requiredWhen` (replaces the schema's requiredness, and exports as optional), cascading `options` (`{ by, map }`, a list or a function; a value outside the current choices is invalid) and `derive` (a computed value that the parsed output always holds). The shared row template has no values, so a row's settings come from `resolveItem`, or from `rows` when the tree is built with `expandRows` (plain data, so it survives JSON).
_Avoid_: Field hook, watcher, side effect

**Wizard**:
A multi-step sequential container (`steps`) that partitions a Form Structure into navigable stages with per-step validation gates on active fields.
_Avoid_: Stepper form, multi-page form, funnel

**Form Node Tree**:
The resolved, serializable hierarchical UI AST produced by inspecting a Form Structure against current form values.
_Avoid_: Field list, flat descriptor array

**Path Scope**:
The location of one object (the root, a nested object, or one list row) in the form values, from which every reference is resolved (`PathScope`, `@collidor/struct/form`). A bare key such as `name` means the field of that object; `$root.x`, `$parent.x` and `$item.x` reach outward, and `$index` is the row number. A form tree describes a field once by its **template path** (`orders[].lines[].sku`); values and validation issues use **concrete paths** (`orders[2].lines[0].sku`). Every tree node has a unique `id`, so layout and decorator keys cannot collide either. Conditions can look into other lists with `pluck`, `some`, `every` and `count` (`some($root.warehouses, "bins[].hazard", true)`); `[]` in the field path fans out over nested lists. A list field's `resolveItem(root, rowPath)` builds one row's subtree from real values, because the shared row template has none.
_Avoid_: Key lookup, flat path, field name resolution

**Headless Form Controller**:
The stateful, framework-agnostic runtime engine (`HeadlessFormController`) that manages form values by path, errors, touched fields, the active step of every `steps` container and the active tab of every `tabs` container (each addressed by node `id`), list operations, and validation against a **Form Source** (anything with `toFormTree` and `safeParse`). `submit()` hands over the parsed output, not the raw values.
_Avoid_: Form store, form manager, form state hook

**Row Draft**:
A copy of one list row being edited on its own (`controller.scoped(listPath, index?)`, a `ScopedFormController`), for dialogs. Edits stay in the draft until `commit()` writes the row back, and `discard()` drops it. A draft is judged against the WHOLE form with itself substituted in, so conditions that read another list, `$root` or the row's parent behave exactly as they do for the form. Drafts nest to any depth: committing an inner draft writes into the outer draft, not the form.
_Avoid_: Subform state, dialog values, row copy

**Data Source Descriptor**:
A 100% JSON-serializable specification (`DataSourceConfig`) attached to a schema's metadata that declares how remote options or collection rows are fetched (`http` endpoint spec or named `provider` key), parameterized by reactive `$values.<field>`, `$search`, `$page`, `$pageSize`, and `$cursor` tokens.
_Avoid_: Fetch callback, async loader, remote options function

**Virtual Viewport**:
A declarative windowing configuration (`VirtualScrollConfig`) on a collection or combobox view that renders only the visible slice of items plus overscan inside a fixed-height scroll container.
_Avoid_: Lazy list, infinite DOM, windowed repeater

**Option Hydration Cache**:
A runtime value-to-label lookup maintained by a form or widget so selected IDs from remote paginated/virtualized data sources continue displaying their human-readable labels without holding the full dataset in memory.
_Avoid_: Selected option store, label memoizer

