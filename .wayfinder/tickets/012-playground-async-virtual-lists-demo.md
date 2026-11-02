# 012 - Interactive Playground Demo for Long Lists, Virtualization & Async HTTP Fetching

## Question

How should the `struct/docs` Playground demonstrate 100% JSON-serializable HTTP data sources, reactive `$values.<field>` cascading fetches, and 10,000-item virtualized lists/comboboxes?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

- [011 - Runtime HTTP DataSource Engine & Reactive Refetching in `<ui-struct-form>`](./011-struct-form-http-datasource-engine.md)

## Description

1. **Playground Preset & Demo (`struct/docs/src/data/playgroundSnippets.ts` & `Playground.vue`)**:
   - Add or enhance a preset in `playgroundSnippets.ts` showcasing:
     - `.fromHttp({ url: '...', query: { region: '$values.region', q: '$search', page: '$page', limit: '$pageSize' }, ... })` with reactive cascading refetch when `region` changes.
     - `.asCombobox({ searchable: true }).virtual({ itemHeight: 36 })` handling a large virtualized dataset (e.g., 10,000 cloud instances / IAM principals / nodes).
     - `.asTable().virtual({ itemHeight: 40 })` or remote paginated table.
   - Provide a lightweight `fetchInterceptor` / mock API responder in `Playground.vue` for `/api/v1/...` routes so the live `fromHttp` descriptors execute real `fetch` flows in the browser with realistic latency, filtering, pagination, and 10,000 virtual items without needing an external backend server.
   - Verify the JSON Schema / AST inspector tab shows the pure serializable `dataSource` and `virtual` JSON descriptors.
