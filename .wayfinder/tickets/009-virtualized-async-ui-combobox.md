# 009 - Virtualized & Async `<ui-combobox>` Component in `@collidor/ui`

## Question

How should `<ui-combobox>` in `@collidor/ui` support single/multi-select, debounced async search, windowed DOM virtualization for 10,000+ options, infinite scroll (`ui-get-page`), and an Option Hydration Cache?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-23

## Resolution

1. Created `UICombobox` in `ui/src/components/combobox.component.ts` and registered it in `UI_TAG_NAMES.COMBOBOX` and `ui/src/index.ts`.
2. Implemented single & multi-select (`.multiple`) with selected tag chips and remove buttons.
3. Implemented windowed DOM virtualization (`.virtual`) rendering an absolute-positioned visible slice (`[startIndex, endIndex]`) inside a relative spacer container (`totalCount * itemHeight`) for 1,000+ items.
4. Added debounced async search (`this.debounceMs`) and infinite scroll emitting `ui-get-page` with `{ page, pageSize, search }` when `remote` is true.
5. Implemented Option Hydration Cache so selected option labels are preserved across page updates and search filtering.
6. Added 6 unit tests in `ui/src/__tests__/combobox.spec.ts`. All 112 tests in `@collidor/ui` pass.

## Blocked By


None

## Description

1. **Component Implementation (`ui/src/components/combobox.component.ts`)**:
   - Create `UICombobox` (`<ui-combobox>`) extending `UIElement` and export it in `ui/src/index.ts` and `UI_TAG_NAMES` in `ui/src/constants.ts`.
   - Properties:
     - `value`: `string | string[]`
     - `options`: `Array<{ value: string | number; label: string; description?: string; disabled?: boolean }>`
     - `multiple`: `boolean`
     - `searchable`: `boolean` (default `true`)
     - `creatable`: `boolean` (default `false`)
     - `remote`: `boolean`
     - `loading`: `boolean`
     - `total`: `number`
     - `page`: `number`
     - `pageSize`: `number`
     - `virtual`: `VirtualScrollConfig | boolean`
     - `debounceMs`: `number` (default `250`)
     - `placeholder`, `label`, `disabled`, `required`, `invalid`
2. **Windowed DOM Virtualization**:
   - When `virtual` is enabled (or `filteredOptions.length >= threshold`), compute `startIndex` and `endIndex` from `scrollTop` and `itemHeight` (default `36px`), rendering only visible option rows + `overscan` inside a total-height spacer container.
3. **Async Search & Infinite Scroll (`ui-get-page`)**:
   - When `remote` is true, typing in the search input debounces and emits `ui-get-page` with `{ page: 1, pageSize, search }`.
   - Scrolling near the bottom of the dropdown viewport triggers `ui-get-page` with `{ page: this.page + 1, pageSize, search }` when `options.length < total`.
4. **Option Hydration Cache**:
   - Maintain an internal `Map<string, { value: string; label: string }>` updated whenever `options` are received or an item is selected, so selected tags/chips and single-select display text stay hydrated even when a subsequent search changes `this.options`.
5. **Tests**:
   - Add unit tests in `ui/tests/combobox.test.ts` covering single/multi selection, virtual window slicing on 10,000 items, debounced `ui-get-page` emission, and option label hydration across searches.
