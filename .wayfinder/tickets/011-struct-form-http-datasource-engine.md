# 011 - Runtime HTTP DataSource Engine & Reactive Refetching in `<ui-struct-form>`

## Question

How should `<ui-struct-form>` execute declarative `HttpDataSourceConfig` and `ProviderDataSourceConfig` descriptors, interpolate reactive `$values.<field>` parameters, cancel in-flight requests, and bind the results to `<ui-combobox>`, `<ui-select>`, `<ui-table>`, and `<ui-list>`?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

- [008 - Serializable DataSource & Virtualization AST in `@collidor/struct`](./008-serializable-datasource-and-virtualization-ast.md)
- [009 - Virtualized & Async `<ui-combobox>` Component in `@collidor/ui`](./009-virtualized-async-ui-combobox.md)
- [010 - Windowed DOM Virtualization in `<ui-list>` and `<ui-table>`](./010-virtual-scroll-in-ui-list-and-ui-table.md)

## Description

1. **Runtime DataSource Engine in `UIStructForm` (`ui/src/components/struct-form.component.ts`)**:
   - Add optional properties on `UIStructForm`:
     - `baseUrl?: string`
     - `fetchInterceptor?: (url: string, init: RequestInit) => Promise<Response> | RequestInit`
     - `dataProviders?: Record<string, (params: Record<string, unknown>) => Promise<{ items: unknown[]; total?: number; nextCursor?: string }>>`
   - Implement `#fetchDataSource(field, { page, pageSize, search, cursor, append })`:
     - Interpolates `$search`, `$page`, `$pageSize`, `$cursor`, and `$values.<path>` from `this.#values`.
     - Cancels any prior in-flight `AbortController` for the same field key.
     - Extracts `items` (`responseItemsPath`), `total` (`responseTotalPath`), and maps `{ value: item[valueKey], label: item[labelKey] }` when used for option-picking widgets (`combobox`, `select`, `tags`).
     - Supports `append: true` for infinite scrolling pages (`page > 1`).
2. **Reactive Cross-Field Refetching**:
   - Track `field.dataSource.dependsOn` (or `$values.<dep>` tokens). When `setFieldValue(depKey, val)` mutates a dependency, reset the dependent field's page/cache and trigger a fresh fetch.
3. **Widget Wiring in `UIStructForm`**:
   - Render `<ui-combobox>` when `field.widget === 'combobox'` or `field.collectionView?.mode === 'combobox'`, binding `.options`, `.virtual`, `.remote`, `.loading`, `.total`, and `@ui-get-page`.
   - Bind `.virtual`, `.remote`, `.loading`, `.total`, and `@ui-get-page` on `<ui-table>` and `<ui-list>` when `field.dataSource` or `field.virtual` is configured.
4. **Tests**:
   - Add unit tests in `ui/tests/struct-form.test.ts` verifying declarative HTTP fetching (mocking `fetch`), `$values.<field>` reactive refetching on parent field change, infinite scroll page appending, and `<ui-combobox>` integration.
