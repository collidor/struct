# Wayfinder Map: Struct Library Hardening, Modern Primitives & Ergonomics

## Destination

A production-grade, hardened `@collidor/struct` library with zero validation bugs (nested refinements work, custom messages are honored, safe cloning), modern schema primitives (`Date`, `BigInt`, coercion `s.coerce.*`, transformations), ergonomic error formatting (`.flatten()`, `.format()`), an AST math/logic expression parser for computed properties, hardened interop bridges (`fromZod` checks, Axon `isAssignable` tuples & strict nullability), and clean dispatch replacing repeated switch cascades.

## Notes

- **Skills**: `codebase-design`, `tdd`, `domain-modeling`.
- **Toolchain**: Vitest (`npm test` / `vitest run`).
- **Tracker**: Local markdown tracker under `.wayfinder/`.
- **Target Package**: `c:\Users\alyka\projects\collidor\struct`.

## Decisions so far

- **Validation Refinements & Custom Messages (Ticket 001)**: Implemented `BaseSchema._validateWithRefinements` to bubble up child refinements with accurate paths across all container schemas (`StructSchema`, `ArraySchema`, `RecordSchema`, `TupleSchema`, `UnionSchema`). Custom constraint messages are stored on `descriptor.messages` and directly honored inside primitive `_validate()` routines without relying on dead-code refinements. Added `length()` and `nonempty()` helpers. (Closed)
- **Safe Descriptor Cloning & Error Formatting (Ticket 002)**: Replaced `JSON.parse(JSON.stringify)` with `cloneDescriptor` in `src/utils/clone.ts`, preserving function dynamic defaults, RegExp, and Date instances across fluent builder chains. Prioritized defaults over optional undefined checks in `_validateWithRefinements`. Added `.flatten()` (with optional dot-path style) and `.format()` (nested error tree) to `StructValidationError`. (Closed)
- **Missing Primitives Date, BigInt, and Coercion (Ticket 003)**: Implemented `DateSchema` (`s.date()`) and `BigIntSchema` (`s.bigint()`) with constraint methods (`min`, `max`, `positive`, `negative`). Introduced `s.coerce` namespace for `string`, `number`, `boolean`, `date`, `bigint`. Updated AST descriptors, default value generation, and bridges (JSON Schema, Zod `toZod`/`fromZod`, Axon port types, SQLite DDL). (Closed)
- **Schema Transforms, Pipes, and String Sanitizers (Ticket 004)**: Added `.transform<TNext>()` and `.pipe()` to `BaseSchema` and `s.pipe()`, backed by `TransformSchema` and `PipeSchema` with async execution support. Added in-place string sanitizers (`.trim()`, `.toLowerCase()`, `.toUpperCase()`, `.lower()`, `.upper()`) to `StringSchema` via AST `StringConstraints`. (Closed)
- **Computed Formula Text to AST Parser (Ticket 005)**: Implemented zero-dependency lexical tokenizer, Pratt expression parser, and dependency extractor in `src/computed/expressionParser.ts` supporting numbers, strings, booleans, unary/binary/ternary ops, right-associative `**`, dotted paths, and function calls. Connected to `ComputedPropertiesEngine.defineComputed` with auto-dependency extraction and string formulas. (Closed)
- **Harden Interop Bridges and Subtyping (Ticket 006)**: Refactored `fromZod` to extract checks on strings, numbers, dates, bigints, arrays, and tuples with custom messages. Enforced sound nullability and optionality in `isAssignable` (preventing nullable/optional sources from flowing into non-nullable/required targets), added tuple and tuple-to-array subtyping, date and bigint subtyping, and replaced switch cascades across bridges and utilities with declarative dispatch maps and lookup tables. (Closed)
- **Form Inspector Heuristics and Rich Widgets (Ticket 007)**: Expanded `inferWidget` and `getFormFields` to map arrays of structs to `table` (with columns and children field descriptors), arrays of records to `list`, and arrays of enums to `multiselect`. Added `password`, `file`, and `date` widget inference. Added layout and metadata chaining methods (`colSpan`, `section`, `group`, `helpText`, `hidden`, `disabled`, `readonly`) on `BaseSchema`. (Closed)

## Frontier (Open & Unblocked)

_(All planned tickets in this roadmap completed)_

## Blocked

_(None - all tickets unblocked)_

## Not yet specified

- Decomposing storage adapters (`universalEdge.ts`, `sqliteAdapter.ts`) into separate dedicated packages or maintaining them as secondary subpath exports.
- JSON Schema Draft 2020-12 `$defs` and recursive `$ref` schema resolution.
- Full discriminated union optimization with indexed dictionary branch selection (`s.discriminatedUnion()`).

## Out of scope

- Creating a visual UI canvas editor within `struct` (belongs in `ui-builder` / `axon`).
- Non-SQLite SQL dialects (Postgres, MySQL) in the initial DDL engine.
