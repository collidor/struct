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
_Avoid_: Show-if, visibility filter, toggle group

**Collection View Mode**:
The explicit presentation and interaction strategy (`table`, `list`, `cards`, `tabs`, `tags`, `combobox`) bound to an array, record, or tuple schema.
_Avoid_: Array widget, repeater type

**Reactive Derivation**:
A dynamic property of a node (`disabledWhen`, `readonlyWhen`, `requiredWhen`, cascading `options`, derived value) evaluated against live form values (`$root`, `$item`, `$index`).
_Avoid_: Field hook, watcher, side effect

**Wizard**:
A multi-step sequential container (`steps`) that partitions a Form Structure into navigable stages with per-step validation gates on active fields.
_Avoid_: Stepper form, multi-page form, funnel

**Form Node Tree**:
The resolved, serializable hierarchical UI AST produced by inspecting a Form Structure against current form values.
_Avoid_: Field list, flat descriptor array

**Headless Form Controller**:
The stateful, framework-agnostic runtime engine that manages form values, path mutations, collection item operations, wizard navigation, and scoped validation for a Form Structure.
_Avoid_: Form store, form manager, form state hook

**Data Source Descriptor**:
A 100% JSON-serializable specification (`DataSourceConfig`) attached to a schema's metadata that declares how remote options or collection rows are fetched (`http` endpoint spec or named `provider` key), parameterized by reactive `$values.<field>`, `$search`, `$page`, `$pageSize`, and `$cursor` tokens.
_Avoid_: Fetch callback, async loader, remote options function

**Virtual Viewport**:
A declarative windowing configuration (`VirtualScrollConfig`) on a collection or combobox view that renders only the visible slice of items plus overscan inside a fixed-height scroll container.
_Avoid_: Lazy list, infinite DOM, windowed repeater

**Option Hydration Cache**:
A runtime value-to-label lookup maintained by a form or widget so selected IDs from remote paginated/virtualized data sources continue displaying their human-readable labels without holding the full dataset in memory.
_Avoid_: Selected option store, label memoizer

