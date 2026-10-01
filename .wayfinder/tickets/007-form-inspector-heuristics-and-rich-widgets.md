# 007 - Form Inspector Heuristics and Rich Widgets

## Question

How should `inferWidget` and `getFormFields` differentiate primitive arrays from arrays-of-structs (`table`/`list`), and support `password`, `file`, `datetime`, and layout hints?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-01

## Resolution

1. **Array Widget Inference**:
   - Updated `inferWidget` in `src/dynamic/formInspector.ts` so arrays of structs map to `widget: 'table'` with extracted `columns` in `widgetProps`.
   - Arrays of records map to `widget: 'list'`.
   - Arrays of enums map to `widget: 'multiselect'` with mapped `options`.
   - Arrays of primitives map to `widget: 'tags'`.
   - In `getFormFields`, populated `children` on array-of-struct fields with the child struct's `FormFieldDescriptor` list.
2. **Additional Widget Hints**:
   - Expanded `WidgetHint` and `StringFormat` in `src/types/ast.ts` to support `password`, `file`, `table`, `list`, and `multiselect`.
   - Added `.password()` and `.file()` fluent methods on `StringSchema`.
   - Mapped `DateSchema` and `format === 'date'` to `widget: 'date'`.
   - Mapped `BigIntSchema` to `widget: 'number'` with `{ step: 1 }`.
3. **Layout & Grouping**:
   - Added `colSpan`, `section`, `helpText` to `FieldMetadata` and `FormFieldDescriptor`.
   - Added fluent chaining methods on `BaseSchema`: `.colSpan()`, `.section()`, `.group()`, `.helpText()`, `.hidden()`, `.disabled()`, `.readonly()`.
   - Passed layout and state properties through `getFormFields`.
4. Added 8 unit tests in `__tests__/formInspectorRich.spec.ts` validating all widget inference cases, columns, children, and layout metadata.

## Blocked By

None

## Description

1. **Array Widget Inference**:
   - Currently, `inferWidget` maps every array schema to the `tags` widget. If an array contains structs (e.g. `s.array(s.struct({ name: s.string(), quantity: s.number() }))`), `tags` is broken and unusable.
   - Update `inferWidget` so that arrays containing `struct` or `record` kinds map to `table` or `list` widget hints, retaining nested children descriptors.
2. **Additional Widget Hints**:
   - Support `password` (`format === 'password'`), `file`, `date`, `datetime`, and `multiselect` (for array of enums).
3. **Layout & Grouping**:
   - Honor layout metadata properties: `colSpan`, `section`, `helpText`.
- Add test coverage in `__tests__/formInspectorRich.spec.ts`.
