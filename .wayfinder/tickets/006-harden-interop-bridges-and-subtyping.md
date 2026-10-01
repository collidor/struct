# 006 - Harden Interop Bridges and Subtyping

## Question

How should `fromZod` extract constraint checks, how should `isAssignable` (Axon) support tuple subtyping and strict nullability, and how should repeated `switch (descriptor.kind)` cascades across bridges be centralized?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-01

## Resolution

1. **`fromZod` Constraint Extraction**:
   - Refactored `fromZod()` to inspect `_def.checks` on string schemas (`min`, `max`, `length`, `email`, `url`, `uuid`, `datetime`, `regex`, `trim`, `toLowerCase`, `toUpperCase`) and number schemas (`min`, `max`, `gt`, `lt`, `int`, `multipleOf`) along with custom messages.
   - Added support for `ZodDate` (with `min`/`max` checks), `ZodBigInt` (with `min`/`max`/`multipleOf` checks), `ZodTuple` (heterogeneous items), `ZodArray` (`minLength`, `maxLength`, `exactLength`), `ZodEffects` (`.refine`/`.transform`), and `z.coerce.*` flags.
2. **`isAssignable` (Axon Bridge)**:
   - Decomposed nullable sources (`sDesc.nullable === true`) into requirement that target accepts null AND base non-nullable source is assignable to target. Nullable source can no longer flow into non-nullable target.
   - Decomposed optional sources (`sDesc.optional === true`) into requirement that target accepts undefined/optional AND required base source is assignable to target.
   - Added tuple-to-tuple subtyping (length equality + pointwise assignability) and tuple-to-array subtyping.
   - Added date and bigint subtyping in `isAssignable()` and literal subtyping.
   - Added `tuple:[item1,item2]` format to `getAxonDataType()`.
3. **Repeated Switches & Shotgun Surgery**:
   - Replaced switch cascades in `src/bridges/zod.ts` (`TO_ZOD_HANDLERS`, `FROM_ZOD_HANDLERS`), `src/bridges/axon.ts` (`AXON_DATA_TYPE_DISPATCH`), `src/utils/defaults.ts` (`DEFAULT_VALUE_HANDLERS`), and `src/schema/ddl.ts` (`SQLITE_TYPE_MAP`) with declarative dispatch maps and lookup tables.
4. Added 16 tests in `__tests__/bridgesHardening.spec.ts` covering all bridge conversions, checks extraction, soundness checks, and data types.

## Blocked By

None

## Description

1. **`fromZod` Constraint Extraction**:
   - `src/bridges/zod.ts`: `fromZod()` currently checks only `_def.typeName` and ignores `_def.checks`. It drops `.min()`, `.max()`, `.email()`, `.regex()`.
   - Update `fromZod()` to inspect `_def.checks` on string and number schemas and map them to `minLength`, `maxLength`, `format: 'email'`, `pattern`, `min`, `max`, etc.
   - Add support for `ZodDate`, `ZodBigInt`, `ZodTuple`.
2. **`isAssignable` (Axon Bridge)**:
   - Handle tuple subtyping (`sDesc.kind === 'tuple' && tDesc.kind === 'tuple'`).
   - Fix nullability unsoundness: a nullable source (`sDesc.nullable === true`) must not be assignable to a non-nullable target.
   - Add support for `date` and `bigint` data types in `getAxonDataType()`.
3. **Repeated Switches & Shotgun Surgery**:
   - Refactor the 12-case `switch (descriptor.kind)` repeated across `axon.ts`, `zod.ts`, `jsonSchema.ts`, `ddl.ts`, and `defaults.ts` into centralized lookup tables / handlers.
- Add test coverage in `__tests__/bridgesHardening.spec.ts`.
