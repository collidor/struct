# 002 - Safe Descriptor Cloning and Error Formatting

## Question

How should `BaseSchema._clone()` preserve non-JSON metadata (function defaults, regexes, custom objects) without `JSON.parse(JSON.stringify)`, and how should `StructValidationError` expose `.flatten()` and `.format()` for seamless form UI integration?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

None

## Description

1. **Flawed Cloning**: `BaseSchema._clone()` uses `JSON.parse(JSON.stringify(this.descriptor))`. Whenever a user chains `.optional()`, `.label()`, `.widget()`, or `.refine()`, function-based dynamic defaults (`() => crypto.randomUUID()`) and RegExp instances are destroyed or mangled.
   - Replace with structured/shallow descriptor cloning that preserves object references, function defaults, and regex patterns while maintaining immutability across fluent builder chains.
2. **Error Formatting Ergonomics**: Currently, `StructValidationError` only contains an array of `StructIssue`. In UI frameworks (like `@collidor/ui`'s `<struct-form>` or Vee-Validate), consumers need flattened key-value error maps.
   - Implement `error.flatten()` returning `{ formErrors: string[], fieldErrors: Record<string, string[]> }`.
   - Implement `error.format()` providing nested recursive issue maps matching the shape of the validated data.
- Add test coverage in `__tests__/cloningAndErrors.spec.ts`.

## Resolution

1. Implemented `cloneDescriptor<T>(val: T): T` in `src/utils/clone.ts` that recursively copies AST descriptors, preserving functions (such as dynamic default generators `() => crypto.randomUUID()`), `RegExp` instances, `Date` objects, arrays, and nested structures without relying on `JSON.parse(JSON.stringify)`.
2. Updated `_clone()` across `BaseSchema`, `StructSchema`, `ArraySchema`, `RecordSchema`, `UnionSchema`, `TupleSchema`, `EnumSchema`, and `LiteralSchema` to use `cloneDescriptor`.
3. Updated `_validateWithRefinements` to check `descriptor.default` before `descriptor.optional` and clone non-function default values safely with `cloneDescriptor`.
4. Enhanced `StructValidationError` in `src/core/errors.ts`:
   - Added `.flatten<U = string>(mapper?, options?)` returning `FlattenedErrors<U>` (`{ formErrors: U[], fieldErrors: Record<string, U[]> }`), supporting custom mappers and dot-path style (`options: { pathStyle: 'dot' }`).
   - Added `.format()` returning `FormattedError` (`{ _errors: string[], [key: string]: FormattedError | string[] }`) providing recursive nested error trees matching the data structure.
   - Exported `FlattenedErrors`, `FormattedError`, and `cloneDescriptor` from `src/index.ts`.
5. Created comprehensive test suite in `__tests__/cloningAndErrors.spec.ts` (10 tests). Full test suite (18 files, 99 tests) passes and `tsc --noEmit` passes with 0 errors.
