# Wayfinder Map: Serializable Long Lists, Virtualization & Async HTTP Fetching

## Destination

End-to-end support for 100% JSON-serializable `DataSourceConfig` descriptors (`.fromHttp()`, `.fromProvider()`) with reactive `$values.<field>` parameter bindings and `VirtualScrollConfig` (`.virtual()`, `.paginate()`) in `@collidor/struct`, paired with a new virtualized & async `<ui-combobox>`, virtual scrolling in `<ui-list>` and `<ui-table>`, a declarative HTTP data source runtime engine in `<ui-struct-form>`, and a live interactive Playground demo.

## Notes

- **Execution Mode**: Carry execution into the map itself (each ticket delivers tested code across `@collidor/struct`, `@collidor/ui`, and `struct/docs`).
- **Core Constraint**: Zero JavaScript functions or closures in the struct AST — all data sources, query bindings, and virtualization configs must round-trip cleanly through `JSON.stringify`.
- **UI Rule**: Compose `@collidor/ui` components exclusively (linked into `struct/docs`).
- **Skills**: `codebase-design`, `tdd`, `domain-modeling`.
- **Toolchain**: Vitest (`npm test` / `vitest run`) in both `c:\Users\alyka\projects\collidor\struct` and `c:\Users\alyka\projects\collidor\ui`.
- **Tracker**: Local markdown tracker under `struct/.wayfinder/`.

## Decisions so far

- **Single Canonical `DataSourceConfig`**: Both option-picking fields (`select`, `combobox`, `tags`) and collection views (`table`, `list`, `cards`) share `descriptor.metadata.dataSource` (`type: 'http' | 'provider'`).
- **Declarative HTTP Descriptor with Optional Host Interceptor**: `HttpDataSourceConfig` supports full URL/method/headers/query templates (`$search`, `$page`, `$pageSize`, `$cursor`, `$values.<field>`) and dot-path extractors (`responseItemsPath`, `responseTotalPath`, `valueKey`, `labelKey`), while `<ui-struct-form>` exposes optional `baseUrl` and `fetchInterceptor` hooks for host auth/origin policies.
- **Dedicated `<ui-combobox>` in `@collidor/ui`**: Keep `<ui-select>` lightweight for native/base-select dropdowns and introduce `<ui-combobox>` for searchable, virtualized, and async HTTP option lists (single or multi-select) with an Option Hydration Cache.
- **[Validation Refinements & Custom Messages](./tickets/001-fix-validation-refinement-cascade-and-custom-messages.md)**: Child refinements bubble up with accurate paths; custom constraint messages live on `descriptor.messages`.
- **[Safe Descriptor Cloning & Error Formatting](./tickets/002-safe-descriptor-cloning-and-error-formatting.md)**: `cloneDescriptor` preserves non-JSON primitives where needed; `StructValidationError` provides `.flatten()` and `.format()`.
- **[Missing Primitives Date, BigInt, and Coercion](./tickets/003-missing-primitives-date-bigint-and-coercion.md)**: Added `s.date()`, `s.bigint()`, and `s.coerce.*`.
- **[Schema Transforms, Pipes, and String Sanitizers](./tickets/004-schema-transforms-and-string-sanitizers.md)**: Added `.transform()`, `.pipe()`, and string sanitizers.
- **[Computed Formula Text to AST Parser](./tickets/005-computed-formula-text-to-ast-parser.md)**: Zero-dependency expression parser and AST evaluator in `src/computed/`.
- **[Harden Interop Bridges and Subtyping](./tickets/006-harden-interop-bridges-and-subtyping.md)**: Hardened `fromZod` and `isAssignable`.
- **[Form Inspector Heuristics and Rich Widgets](./tickets/007-form-inspector-heuristics-and-rich-widgets.md)**: Rich widget inference for arrays of structs/records/enums and layout metadata chaining.
- **[Serializable DataSource & Virtualization AST in `@collidor/struct`](./tickets/008-serializable-datasource-and-virtualization-ast.md)**: 100% JSON-serializable `DataSourceConfig` (`fromHttp`, `fromProvider`), automatic reactive `$values.<field>` `dependsOn` extraction, and `VirtualScrollConfig` (`.virtual()`, `.paginate()`) with full AST/form tree propagation. (Closed)
- **[Virtualized & Async `<ui-combobox>` Component in `@collidor/ui`](./tickets/009-virtualized-async-ui-combobox.md)**: Created `<ui-combobox>` with single/multi-select, debounced async search, windowed DOM virtualization for 1,000+ options, infinite scroll (`ui-get-page`), and an Option Hydration Cache. (Closed)
- **[Windowed DOM Virtualization in `<ui-list>` and `<ui-table>`](./tickets/010-virtual-scroll-in-ui-list-and-ui-table.md)**: Windowed DOM virtualization rendering `[startIndex, endIndex]` subsets and spacer elements with infinite-scroll triggers across `<ui-list>` and `<ui-table>`. (Closed)
- **[Runtime HTTP DataSource Engine & Reactive Refetching in `<ui-struct-form>`](./tickets/011-struct-form-http-datasource-engine.md)**: Built runtime data source caching, request abort controllers, parameter interpolation (`$values.<field>`, `$search`, `$page`, `$pageSize`), reactive cross-field refetching, and wired `<ui-combobox>`, `<ui-select>`, `<ui-table>`, and `<ui-list>`. (Closed)
- **[Interactive Playground Demo for Long Lists, Virtualization & Async HTTP Fetching](./tickets/012-playground-async-virtual-lists-demo.md)**: Added `Cloud Infrastructure (Async HTTP & 10k Virtual Nodes)` preset in `struct/docs` with live mock API responder simulating latency, filtering, and 10,000 virtual nodes. (Closed)

## Frontier (Open & Unblocked)

*(All tickets closed — feature complete)*

## Blocked

*(None)*


## Not yet specified

- Dynamic variable-height row measurement (`ResizeObserver` item height cache) if fixed `itemHeight` proves insufficient for multi-line cards in `<ui-list>`.
- GraphQL or WebSocket subscription transport descriptors alongside `type: 'http'` and `type: 'provider'`.
- Server-side async existence validation rule (`remoteExists`) when a form is validated headlessly on a backend without the UI widget's Option Hydration Cache.

## Out of scope

- Embedding arbitrary JS fetch callbacks inside the serialized schema AST.
- Visual drag-and-drop API endpoint builder UI (belongs in `ui-builder` / `axon`).
