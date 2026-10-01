# 003 - Missing Primitives Date, BigInt, and Coercion

## Question

How should `DateSchema` (`s.date()`), `BigIntSchema` (`s.bigint()`), and the coercion namespace `s.coerce.*` (`number`, `string`, `boolean`, `date`, `bigint`) be structured and integrated into AST descriptors and fluent builders?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

None

## Description

In real applications (forms, database entities, query parameters, Axon router nodes), inputs often arrive as strings or need rich date/bigint types:
1. **Date Primitive**:
   - Implement `DateSchema` (`s.date()`) validating `Date` instances (rejecting `NaN` invalid dates).
   - Add `.min(date, message)` and `.max(date, message)`.
   - Update `TypeDescriptor` with `DateDescriptor` (`kind: 'date'`).
2. **BigInt Primitive**:
   - Implement `BigIntSchema` (`s.bigint()`) validating `bigint` types.
   - Add `.positive()`, `.negative()`, `.min()`, `.max()`.
   - Update `TypeDescriptor` with `BigIntDescriptor` (`kind: 'bigint'`).
3. **Coercion Namespace (`s.coerce.*`)**:
   - Implement `s.coerce.string()`, `s.coerce.number()`, `s.coerce.boolean()`, `s.coerce.date()`, and `s.coerce.bigint()`.
   - Coercion schemas attempt to convert raw input (`"42" -> 42`, `"true" -> true`, `"2026-10-01" -> Date`, `123n`) before applying validation constraints.
- Add test coverage in `__tests__/primitivesAndCoerce.spec.ts`.

## Resolution

1. Added `kind: 'date' | 'bigint'` and `coerce?: boolean` to AST descriptors (`DateDescriptor`, `BigIntDescriptor`) in `src/types/ast.ts`.
2. Implemented `DateSchema` with `.min()`, `.max()`, and `BigIntSchema` with `.min()`, `.max()`, `.positive()`, `.nonnegative()`, `.negative()` in `src/builders/primitives.ts`.
3. Added coercion logic (`descriptor.coerce`) to `StringSchema`, `NumberSchema`, `BooleanSchema`, `DateSchema`, and `BigIntSchema`.
4. Exposed `s.date()`, `s.bigint()`, and the `s.coerce` namespace (`s.coerce.string()`, `s.coerce.number()`, `s.coerce.boolean()`, `s.coerce.date()`, `s.coerce.bigint()`) in `src/builders/index.ts`.
5. Integrated `date` and `bigint` across JSON Schema, Zod (`toZod` and `fromZod`), Axon (`getAxonDataType`), and SQLite DDL (`typeDescriptorToSQLType`).
6. Exported `DateSchema` and `BigIntSchema` from `src/index.ts`.
7. Created comprehensive test suite in `__tests__/primitivesAndCoerce.spec.ts` (12 tests). All 19 test files (111 tests) and `tsc --noEmit` pass with zero errors.
