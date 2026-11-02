# 010 - Windowed DOM Virtualization in `<ui-list>` and `<ui-table>`

## Question

How should `<ui-list>` and `<ui-table>` in `@collidor/ui` support fixed-height windowed DOM virtualization (`VirtualScrollConfig`) and infinite scroll alongside their existing remote pagination?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-23

## Resolution

1. Added `virtual` property (`boolean | VirtualScrollConfig`) and `#onListScroll` / `#isVirtualActive` to `UIList` in `ui/src/components/list.component.ts`.
2. Implemented windowed DOM virtualization in `UIList` rendering only `[startIndex, endIndex]` absolute-positioned items within a full-height `.virtual-sizer` container, and triggering `ui-get-page` on scroll near bottom for remote lists.
3. Added `virtual` property (`boolean | VirtualScrollConfig`) and `#onTableScroll` / `#isVirtualActive` to `UITable` in `ui/src/components/table.component.ts`.
4. Implemented windowed DOM virtualization in `UITable` rendering sticky headers, top/bottom spacer rows, and only visible `<tr>` rows within the scroll container, plus infinite scroll `ui-get-page` triggers.
5. Added 4 unit tests in `ui/src/__tests__/virtual-collections.spec.ts`. All 116 tests in `@collidor/ui` pass.

## Blocked By


None

## Description

1. **Virtual Scroll in `<ui-list>` (`ui/src/components/list.component.ts`)**:
   - Add `virtual` property (`boolean | VirtualScrollConfig`) and `itemHeight` (`number`, default `48`).
   - When `virtual` is active in `layout="list"`, wrap the list viewport in a scrollable container (`max-height: viewportHeight`), render a full-height sizer (`items.length * itemHeight`), and slice `displayItems` to `[startIndex - overscan, endIndex + overscan]` positioned via `transform: translateY(${offsetY}px)`.
   - When `paginationMode === 'infinite'` (or `virtual` + `remote` without discrete pages), emit `ui-get-page` for `page + 1` when scrolling within `2 * itemHeight` of the bottom.
2. **Virtual Scroll in `<ui-table>` (`ui/src/components/table.component.ts`)**:
   - Add `virtual` property (`boolean | VirtualScrollConfig`) and `rowHeight` (`number`, default `40`).
   - When `virtual` is active, constrain the table scroll container height, keep `<thead>` sticky, and render top/bottom spacer `<tr>` rows around the visible slice `[startIndex, endIndex]` so native table column alignment is preserved while keeping DOM node count constant (`~20` rows even for 10,000 items).
3. **Tests**:
   - Add unit tests in `ui/tests/` verifying that `<ui-list>` and `<ui-table>` with 5,000 items and `.virtual=${true}` render only the windowed subset of DOM elements and update the slice on `scroll`.
