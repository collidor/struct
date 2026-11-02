# 008 - Serializable DataSource & Virtualization AST in `@collidor/struct`

## Question

How should `@collidor/struct` represent declarative HTTP and Provider data sources (`DataSourceConfig`), reactive `$values.<field>` parameter bindings, and virtualization/pagination configs (`VirtualScrollConfig`, `AsyncPaginationConfig`) in a 100% JSON-serializable AST?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-23

## Resolution

1. Defined `HttpDataSourceConfig`, `ProviderDataSourceConfig`, `DataSourceConfig`, `VirtualScrollConfig`, and `AsyncPaginationConfig` in `src/types/ast.ts` and `src/form/types.ts`.
2. Implemented `extractValueDependencies` in `src/form/utils/dataSource.ts` to automatically extract reactive `$values.<field>` dependencies into `dataSource.dependsOn: string[]`.
3. Added `.fromHttp()`, `.fromProvider()`, `.virtual()`, `.paginate()`, `.asSelect()`, and `.asCombobox()` fluent builder methods on `BaseSchema` and `FormArraySchema`.
4. Propagated `dataSource`, `virtual`, `pagination`, and `dependsOn` onto `FormFieldNode` in `FormStructSchema.toFormTree()`.
5. Added `named()` support to `FormStructSchema` and verified 100% JSON roundtrip and schema serializability with 6 new unit tests in `__tests__/formDataSource.spec.ts`. All 252 tests in `struct` passing.

## Blocked By


None

## Description

1. **Serializable Types (`src/form/types.ts` & `src/types/ast.ts`)**:
   - Define `HttpDataSourceConfig`:
     - `type: 'http'`
     - `url: string`
     - `method?: 'GET' | 'POST'`
     - `headers?: Record<string, string>`
     - `query?: Record<string, string | number | boolean>` (supports `$search`, `$page`, `$pageSize`, `$cursor`, `$values.<field>`)
     - `body?: Record<string, unknown>`
     - `responseItemsPath?: string` (dot-path, e.g. `'data.items'`)
     - `responseTotalPath?: string` (dot-path, e.g. `'data.total'`)
     - `responseNextCursorPath?: string` (dot-path, e.g. `'data.nextCursor'`)
     - `valueKey?: string` (e.g. `'id'`)
     - `labelKey?: string` (e.g. `'name'`)
     - `descriptionKey?: string`
     - `debounceMs?: number`
   - Define `ProviderDataSourceConfig`:
     - `type: 'provider'`
     - `key: string`
     - `params?: Record<string, string | number | boolean>` (supports `$values.<field>`)
     - `debounceMs?: number`
   - Define `VirtualScrollConfig`:
     - `enabled: boolean`
     - `itemHeight?: number` (default `40`)
     - `overscan?: number` (default `5`)
     - `viewportHeight?: string` (default `'320px'`)
     - `threshold?: number` (default `100`)
   - Define `AsyncPaginationConfig`:
     - `mode: 'pages' | 'infinite' | 'cursor'`
     - `pageSize?: number` (default `50`)
2. **Fluent Builders (`src/core/base.ts` & `src/form/extensions/array.ts`)**:
   - Add `.fromHttp(config: Omit<HttpDataSourceConfig, 'type'>)` and `.fromProvider(key: string, config?: Omit<ProviderDataSourceConfig, 'type' | 'key'>)` on `BaseSchema` (so both `f.string().asSelect().fromHttp(...)` and `f.array(...).asCombobox().fromHttp(...)` work seamlessly).
   - Add `.virtual(config?: Partial<VirtualScrollConfig> | boolean)` and `.paginate(config?: Partial<AsyncPaginationConfig> | number)` on `BaseSchema` and `FormArraySchema`.
   - Extract reactive `$values.<field>` dependencies from `query` / `params` into `dataSource.dependsOn: string[]` automatically so runtime controllers don't need to re-parse strings on every keystroke.
3. **Form Node Resolution (`src/form/builders/formStruct.ts`)**:
   - Propagate `dataSource`, `virtual`, and `pagination` onto `FormFieldNode` during `resolveNodeTree()`, ensuring `JSON.stringify(form.descriptor)` and `JSON.stringify(form.resolveNodeTree(values))` remain 100% lossless and function-free.
4. **Tests**:
   - Add unit tests in `__tests__/formDataSource.spec.ts` verifying JSON round-tripping, dependency extraction (`$values.region` -> `dependsOn: ['region']`), and builder immutability.
