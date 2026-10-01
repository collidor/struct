# 001 - Fix Validation Refinement Cascade and Custom Messages

## Question

How should `StructSchema`, `ArraySchema`, and primitive validation be structured so that child field `.refine()` checks are reliably executed and custom error messages in `.min()`, `.max()`, and `.regex()` are not dead code?

## Type

`wayfinder:task`

## Status

Closed

## Blocked By

None

## Description

The code review identified two critical validation flaws:
1. In `StructSchema._validate()` and `ArraySchema._validate()`, child schemas have their internal `_validate()` called directly without running the refinements registered on `BaseSchema.refinements`. As a result, `.refine()` rules placed on struct fields (e.g. `s.struct({ email: s.string().refine(...) })`) are silently bypassed.
2. In `StringSchema` and `NumberSchema`, passing a custom message to `.min(len, message)`, `.max(len, message)`, or `.regex(pattern, message)` pushes a refinement, but `_validate()` executes the constraint first and issues a hardcoded message (`"String must contain at least X character(s)"`), failing before refinements can run and rendering the custom message unreachable dead code.

### Required Actions
- Update `StructSchema._validate()` to call `fieldSchema.safeParse()` (or invoke refinements) so child validation issues and refinement failures bubble up with full path context.
- Update `ArraySchema._validate()` to properly validate child items including refinements.
- Store custom messages directly on the `descriptor` (e.g. `minLengthMessage`, `maxLengthMessage`, `patternMessage` or constraint options) so that `_validate()` directly consumes the custom message when a constraint fails.
- Add comprehensive unit tests in `__tests__/validationCascade.spec.ts` covering nested struct refinements, nested array refinements, and custom constraint messages.

## Resolution

1. Added `messages?: Record<string, string>` to `BaseDescriptor` in `src/types/ast.ts`.
2. Implemented `BaseSchema._validateWithRefinements(value, path)` in `src/core/base.ts` to properly evaluate schema base validation followed by all registered `.refine()` checks, propagating full path prefixes (`['user', 'profile', 'email']`, `['items', 0]`, etc.).
3. Updated container schemas (`StructSchema`, `ArraySchema`, `RecordSchema`, `TupleSchema`, `UnionSchema`) to invoke `_validateWithRefinements` on child elements rather than raw `_validate()`.
4. Updated `StringSchema` and `NumberSchema` (and `ArraySchema`) to store custom error messages on `descriptor.messages` and consume them directly during constraint checks in `_validate()`. Added `length()` and `nonempty()` helpers.
5. Added comprehensive test suite in `__tests__/validationCascade.spec.ts` with 16 tests covering nested struct refinements, array item refinements, record value refinements, tuple element refinements, and custom messages across all primitive validators. All 89 tests in the repository pass.
