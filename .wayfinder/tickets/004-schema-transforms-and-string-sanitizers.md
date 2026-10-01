# 004 - Schema Transforms and String Sanitizers

## Question

How should `.transform<TNext>()`, `.pipe()`, and string sanitizers (`trim()`, `toLowerCase()`, `toUpperCase()`) be integrated into `BaseSchema<TInput, TOutput>`?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

None

## Description

Currently, `BaseSchema<TInput, TOutput>` defines dual input/output generics, but lacks a mechanism to transform data from `TInput` to `TOutput`:
1. **Generic `.transform()`**:
   - Add `.transform<TNext>((value: TOutput) => TNext | Promise<TNext>)` creating a `TransformSchema<TInput, TNext>`.
   - Support asynchronous parsing via `parseAsync` / `safeParseAsync` when a transformer returns a Promise.
2. **Pipelines via `.pipe()`**:
   - Allow piping a transformed output into a secondary schema (e.g. `s.string().transform(Number).pipe(s.number().min(0))`).
3. **Fluent String Sanitizers**:
   - Add `.trim()`, `.toLowerCase()`, and `.toUpperCase()` directly to `StringSchema`.
- Add test coverage in `__tests__/transformsAndPipes.spec.ts`.

## Resolution

1. Added `trim?: boolean`, `toLowerCase?: boolean`, and `toUpperCase?: boolean` to `StringConstraints` in `src/types/ast.ts`.
2. Implemented string sanitizers in `StringSchema`: `.trim()`, `.toLowerCase()`, `.toUpperCase()`, `.lower()`, `.upper()` which execute before constraint checks (`minLength`, `maxLength`, `pattern`, `format`) and return the sanitized string output.
3. Created `TransformSchema<TInput, TOutput>` and `PipeSchema<TInput, TOutput>` in `src/builders/transform.ts`, supporting synchronous transforms and asynchronous pipelines via `parseAsync()` / `safeParseAsync()`.
4. Connected `.transform()` and `.pipe()` on `BaseSchema<TInput, TOutput>` using a factory registration pattern to prevent circular module evaluation issues. Added `s.pipe()` builder helper to `src/builders/index.ts`.
5. Exported `TransformSchema`, `PipeSchema`, and `type TransformFn` from `src/index.ts`.
6. Created comprehensive test suite in `__tests__/transformsAndPipes.spec.ts` (11 tests). All 20 test files (122 tests) and `tsc --noEmit` pass with zero errors.
