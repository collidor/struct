import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  s,
  struct,
  isAssignable,
  getAxonDataType,
  toZod,
  fromZod,
  getFormFields,
  inferWidget,
  BaseSchema,
  toJSONSchema,
  clearMigrations,
  SchemaMigrationEngine,
  generateStructDDL,
  formatColumnDefinition,
} from '../src'
import { UniversalEdgeEngine } from '../src/edges/universalEdge'
import { sortComputedDefsTopologically } from '../src/computed/astEvaluator'

describe('Code Review Bug Fixes & Refactorings', () => {
  describe('Axon Bridge: Union-to-Union Subtyping', () => {
    it('correctly assesses reflexive and subtype union assignability', () => {
      const uAB = s.union([s.string(), s.number()])
      const uABC = s.union([s.string(), s.number(), s.boolean()])
      const uA = s.string()

      // Reflexive
      expect(isAssignable(uAB, uAB)).toBe(true)

      // Subtype into wider union
      expect(isAssignable(uAB, uABC)).toBe(true)

      // Single variant into union
      expect(isAssignable(uA, uAB)).toBe(true)

      // Wider union into narrower union is false
      expect(isAssignable(uABC, uAB)).toBe(false)

      // Union into single variant is false
      expect(isAssignable(uAB, uA)).toBe(false)
    })
  })

  describe('Struct Defaults on Optional Fields & Non-JSON Defaults', () => {
    it('applies default when field is explicitly .optional().default(...)', () => {
      const schema = s.struct({
        optDef: s.string().optional().default('fallback'),
        reqDef: s.string().default('active'),
      })

      const res = schema.parse({})
      expect(res.optDef).toBe('fallback')
      expect(res.reqDef).toBe('active')
    })

    it('safely preserves non-JSON defaults like Date instances without stringification corruption', () => {
      const defaultDate = new Date('2026-01-01T00:00:00Z')
      const schema = s.struct({
        created: s.date().default(defaultDate),
      })

      const res = schema.parse({})
      expect(res.created).toBeInstanceOf(Date)
      expect(res.created.toISOString()).toBe(defaultDate.toISOString())
      // Ensure it returned a clone, not the exact mutable reference
      expect(res.created).not.toBe(defaultDate)
    })
  })

  describe('Container Async Validation & Transforms', () => {
    it('asynchronously parses struct with async transforms in nested fields', async () => {
      const userSchema = s.struct({
        id: s.string().transform(async (val) => val.toUpperCase()),
        count: s.number().transform(async (n) => n * 2),
      })

      const res = await userSchema.parseAsync({ id: 'abc', count: 5 })
      expect(res).toEqual({ id: 'ABC', count: 10 })

      // Synchronous parse throws helpful guidance error
      expect(() => userSchema.parse({ id: 'abc', count: 5 })).toThrow(
        /Encountered asynchronous transform in synchronous parse/,
      )
    })

    it('asynchronously parses array with async transforms in items', async () => {
      const arraySchema = s.array(
        s.string().transform(async (item) => `#${item}`),
      )

      const res = await arraySchema.parseAsync(['apple', 'banana'])
      expect(res).toEqual(['#apple', '#banana'])
    })

    it('asynchronously parses tuple with async transforms', async () => {
      const tupleSchema = s.tuple([
        s.string().transform(async (s) => s.trim()),
        s.number().transform(async (n) => n + 10),
      ])

      const res = await tupleSchema.parseAsync(['  hello  ', 5])
      expect(res).toEqual(['hello', 15])
    })

    it('asynchronously parses record with async transforms', async () => {
      const recordSchema = s.record(
        s.string().transform(async (v) => v.toLowerCase()),
      )

      const res = await recordSchema.parseAsync({ greeting: 'HELLO' })
      expect(res).toEqual({ greeting: 'hello' })
    })

    it('asynchronously parses union with async transforms', async () => {
      const unionSchema = s.union([
        s.number(),
        s.string().transform(async (s) => `str:${s}`),
      ])

      const resNum = await unionSchema.parseAsync(42)
      expect(resNum).toBe(42)

      const resStr = await unionSchema.parseAsync('test')
      expect(resStr).toBe('str:test')
    })
  })

  describe('Zod Bridge Custom Messages', () => {
    it('preserves custom messages for constraints in toZod', () => {
      const strSchema = s.string().min(5, 'Minimum 5 characters required').max(10, 'Max 10')
      const zStr = toZod(strSchema.descriptor)

      const result = zStr.safeParse('abc')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Minimum 5 characters required')
      }

      const numSchema = s.number().min(100, 'Must be at least 100')
      const zNum = toZod(numSchema.descriptor)
      const numResult = zNum.safeParse(50)
      expect(numResult.success).toBe(false)
      if (!numResult.success) {
        expect(numResult.error.issues[0]?.message).toBe('Must be at least 100')
      }
    })
  })

  describe('Form Inspector Record Array Children & Dispatch Tables', () => {
    it('exposes children for record array items in getFormFields', () => {
      const schema = s.struct({
        settings: s.array(s.record(s.string().label('Setting Value'))),
      })

      const fields = getFormFields(schema)
      expect(fields[0].widget).toBe('list')
      expect(fields[0].children).toBeDefined()
      expect(fields[0].children?.[0]?.key).toBe('value')
      expect(fields[0].children?.[0]?.label).toBe('Setting Value')
    })

    it('infers widget correctly using dispatch table without monolithic switch', () => {
      expect(inferWidget(s.string().email().descriptor).props.type).toBe('email')
      expect(inferWidget(s.number().min(0).max(50).descriptor).widget).toBe('slider')
      expect(inferWidget(s.boolean().descriptor).widget).toBe('switch')
      expect(inferWidget(s.date().descriptor).widget).toBe('date')
    })
  })

  describe('JSON Schema Bridge Dispatch Maps', () => {
    it('correctly maps to and from JSON Schema via lookup tables', () => {
      const original = s.struct({
        name: s.string().min(2),
        active: s.boolean(),
      })

      const jsonSchema = toJSONSchema(original.descriptor)
      expect(jsonSchema.type).toBe('object')
      expect((jsonSchema.properties as any).name.type).toBe('string')
      expect((jsonSchema.properties as any).name.minLength).toBe(2)
      expect((jsonSchema.properties as any).active.type).toBe('boolean')
    })
  })

  describe('BaseSchema Temporal Coupling Elimination', () => {
    it('instantiates transform and pipe directly on BaseSchema without side-effect registration', () => {
      const base = s.string()
      const transformed = base.transform((v) => v.length)
      expect(transformed.parse('hello')).toBe(5)

      const piped = base.pipe(s.string().min(3))
      expect(piped.parse('hello')).toBe('hello')
      expect(() => piped.parse('hi')).toThrow()
    })
  })

  describe('Zod Bridge Preprocess & Refinement Enhancements', () => {
    it('executes preprocess BEFORE inner schema validation in fromZod', () => {
      const zPre = z.preprocess((val) => Number(val), z.number().min(10))
      const structSchema = fromZod(zPre)

      // Preprocessing converts string to number before number().min(10) validates
      expect(structSchema.parse('42')).toBe(42)
      expect(structSchema.safeParse('5').success).toBe(false)
    })

    it('propagates custom refinement paths in fromZod superRefine/refine', () => {
      const zObj = z
        .object({
          password: z.string(),
          confirm: z.string(),
        })
        .superRefine((val, ctx) => {
          if (val.password !== val.confirm) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Passwords must match',
              path: ['confirm'],
            })
          }
        })

      const structSchema = fromZod(zObj)
      const res = structSchema.safeParse({ password: 'abc', confirm: 'xyz' })
      expect(res.success).toBe(false)
      expect(res.issues?.[0]?.path).toEqual(['confirm'])
      expect(res.issues?.[0]?.message).toBe('Passwords must match')
    })
  })

  describe('TransformSchema Descriptor Constraint Stripping', () => {
    it('strips input constraints like minLength, pattern, etc. when kind is any', () => {
      const stringSchema = s.string().min(10).regex(/^[a-z]+$/)
      const transformSchema = stringSchema.transform((val) => val.length)

      expect(transformSchema.descriptor.kind).toBe('any')
      expect((transformSchema.descriptor as any).minLength).toBeUndefined()
      expect((transformSchema.descriptor as any).pattern).toBeUndefined()
    })
  })

  describe('fromDescriptor Null Safety & Fallbacks', () => {
    it('guards against null or undefined descriptor and missing items', () => {
      expect(s.fromDescriptor(null as any).descriptor.kind).toBe('any')
      expect(s.fromDescriptor({} as any).descriptor.kind).toBe('any')
      expect(s.fromDescriptor({ kind: 'array' } as any).descriptor.kind).toBe('array')
      expect(s.fromDescriptor({ kind: 'record' } as any).descriptor.kind).toBe('record')
      expect(s.fromDescriptor({ kind: 'union' } as any).descriptor.kind).toBe('union')
      expect(s.fromDescriptor({ kind: 'tuple' } as any).descriptor.kind).toBe('tuple')
    })
  })

  describe('Schema Migrator Engine State Isolation', () => {
    it('allows clearing migrations to prevent cross-test pollution', () => {
      SchemaMigrationEngine.registerMigration({
        structName: 'test_table',
        fromVersion: 1,
        toVersion: 2,
        upSql: ['ALTER TABLE test_table ADD COLUMN test TEXT;'],
        requiresTableRecreation: false,
      })
      expect(SchemaMigrationEngine.resolveMigrationPath('test_table', 1, 2).length).toBe(1)

      clearMigrations()
      expect(() => SchemaMigrationEngine.resolveMigrationPath('test_table', 1, 2)).toThrow()
    })
  })

  describe('FormattedError Field Name Collision Safety', () => {
    it('does not corrupt or clobber root errors when a field is named _errors', () => {
      const schema = s.struct({
        _errors: s.string().min(5),
      })
      const res = schema.safeParse({ _errors: 'no' })
      expect(res.success).toBe(false)
      const formatted = res.error?.format()
      expect(formatted).toBeDefined()
      expect(Array.isArray(formatted?._errors)).toBe(true)
      expect(formatted?._errors.length).toBeGreaterThan(0)
    })
  })

  describe('DDL Column Generation Simplification', () => {
    it('generates NOT NULL accurately regardless of defaultValue presence', () => {
      const ddl1 = generateStructDDL('users', {
        kind: 'struct',
        fields: {
          name: { kind: 'string', nullable: false },
          status: { kind: 'string', nullable: false, default: 'active' },
          bio: { kind: 'string', nullable: true },
        },
      })
      expect(ddl1).toContain('name TEXT NOT NULL')
      expect(ddl1).toContain("status TEXT NOT NULL DEFAULT 'active'")
      expect(ddl1).toContain('bio TEXT DEFAULT NULL')
    })

    it('correctly uses formatColumnDefinition directly', () => {
      const colDef = formatColumnDefinition({
        name: 'score',
        sqlType: 'INTEGER',
        nullable: false,
        defaultValue: 100,
        visibility: 'PUBLIC',
      })
      expect(colDef).toBe('score INTEGER NOT NULL DEFAULT 100')
    })
  })

  describe('BigInt Constraints Descriptor Persistence', () => {
    it('persists positive, nonnegative, and negative constraints on the descriptor', () => {
      const pos = s.bigint().positive('Must be positive')
      expect(pos.descriptor.positive).toBe(true)
      expect(pos.descriptor.messages?.positive).toBe('Must be positive')

      const nonNeg = s.bigint().nonnegative('Must be non-negative')
      expect(nonNeg.descriptor.nonnegative).toBe(true)
      expect(nonNeg.descriptor.messages?.nonnegative).toBe('Must be non-negative')

      const neg = s.bigint().negative('Must be negative')
      expect(neg.descriptor.negative).toBe(true)
      expect(neg.descriptor.messages?.negative).toBe('Must be negative')
    })
  })

  describe('Axon Data Type Guarding and Fallbacks', () => {
    it('returns any on null/undefined input without throwing', () => {
      expect(getAxonDataType(undefined)).toBe('any')
      expect(getAxonDataType(null)).toBe('any')
      expect(getAxonDataType({} as any)).toBe('any')
    })

    it('handles containers with missing item descriptors gracefully', () => {
      expect(getAxonDataType({ kind: 'array' } as any)).toBe('array:any')
      expect(getAxonDataType({ kind: 'record' } as any)).toBe('record:any')
      expect(getAxonDataType({ kind: 'tuple' } as any)).toBe('tuple:[]')
    })

    it('safely guards isAssignable against null/undefined and empty containers without throwing', () => {
      expect(isAssignable(null as any, s.string())).toBe(false)
      expect(isAssignable(s.string(), undefined as any)).toBe(false)
      expect(isAssignable({ kind: 'array' } as any, { kind: 'array' } as any)).toBe(true)
      expect(isAssignable({ kind: 'record' } as any, { kind: 'record' } as any)).toBe(true)
      expect(isAssignable({ kind: 'tuple' } as any, { kind: 'tuple' } as any)).toBe(true)
    })
  })

  describe('Descriptor Constraint Enforcement in _validate', () => {
    it('enforces positive/nonnegative/negative directly in BigIntSchema._validate when reconstituted from descriptor', () => {
      const posSchema = s.fromDescriptor({ kind: 'bigint', positive: true })
      expect(posSchema.safeParse(5n).success).toBe(true)
      expect(posSchema.safeParse(-5n).success).toBe(false)
      expect(posSchema.safeParse(0n).success).toBe(false)

      const nonNegSchema = s.fromDescriptor({ kind: 'bigint', nonnegative: true })
      expect(nonNegSchema.safeParse(0n).success).toBe(true)
      expect(nonNegSchema.safeParse(-1n).success).toBe(false)

      const negSchema = s.fromDescriptor({ kind: 'bigint', negative: true })
      expect(negSchema.safeParse(-5n).success).toBe(true)
      expect(negSchema.safeParse(5n).success).toBe(false)
    })

    it('converts BigInt positive/nonnegative/negative constraints to Zod schema in toZod', () => {
      const posZod = toZod(s.bigint().positive())
      expect(posZod.safeParse(10n).success).toBe(true)
      expect(posZod.safeParse(-10n).success).toBe(false)
    })
  })

  describe('Struct .extend() Refinement Retention', () => {
    it('retains struct-level refinements across .extend()', () => {
      const baseUser = s
        .struct({
          password: s.string(),
          confirm: s.string(),
        })
        .refine((data) => data.password === data.confirm, 'Passwords must match')

      const extendedUser = baseUser.extend({
        email: s.string(),
      })

      // Fails when password != confirm on extended struct
      const fail = extendedUser.safeParse({
        password: 'secret',
        confirm: 'mismatch',
        email: 'test@example.com',
      })
      expect(fail.success).toBe(false)
      expect(fail.issues?.[0].message).toBe('Passwords must match')

      // Passes when password == confirm
      const pass = extendedUser.safeParse({
        password: 'secret',
        confirm: 'secret',
        email: 'test@example.com',
      })
      expect(pass.success).toBe(true)
    })
  })

  describe('Refinement Issue Deduplication', () => {
    it('deduplicates identical issues from multiple refinements', () => {
      const schema = s
        .string()
        .refine(() => 'Must not be empty')
        .refine(() => 'Must not be empty')

      const res = schema.safeParse('test')
      expect(res.success).toBe(false)
      expect(res.issues).toHaveLength(1)
    })
  })

  describe('Universal Edge Data Clump & struct Alias', () => {
    it('allows linking, unlinking, finding and checking relations using EdgeEndpointTuple', () => {
      const engine = new UniversalEdgeEngine()
      const tuple = { sourceId: 'usr_1', relationName: 'follows', targetId: 'usr_2' }

      engine.link(tuple, { note: 'test' })
      expect(engine.hasRelation(tuple)).toBe(true)
      expect(engine.findEdge(tuple)?.metadata).toEqual({ note: 'test' })

      engine.unlink(tuple)
      expect(engine.hasRelation(tuple)).toBe(false)
    })

    it('exports struct as an alias for s', () => {
      expect(struct).toBe(s)
      expect(struct.string().parse('hello')).toBe('hello')
    })
  })

  describe('fromZod BigInt Constraint Roundtripping', () => {
    it('restores positive constraint on BigInt', () => {
      const zodBigInt = z.bigint().positive()
      const structSchema = fromZod(zodBigInt)
      expect(structSchema.descriptor.kind).toBe('bigint')
      expect((structSchema.descriptor as any).positive).toBe(true)

      expect(structSchema.safeParse(10n).success).toBe(true)
      expect(structSchema.safeParse(0n).success).toBe(false)
      expect(structSchema.safeParse(-5n).success).toBe(false)
    })

    it('restores nonnegative constraint on BigInt', () => {
      const zodBigInt = z.bigint().nonnegative()
      const structSchema = fromZod(zodBigInt)
      expect((structSchema.descriptor as any).nonnegative).toBe(true)

      expect(structSchema.safeParse(0n).success).toBe(true)
      expect(structSchema.safeParse(5n).success).toBe(true)
      expect(structSchema.safeParse(-1n).success).toBe(false)
    })

    it('restores negative constraint on BigInt', () => {
      const zodBigInt = z.bigint().negative()
      const structSchema = fromZod(zodBigInt)
      expect((structSchema.descriptor as any).negative).toBe(true)

      expect(structSchema.safeParse(-5n).success).toBe(true)
      expect(structSchema.safeParse(0n).success).toBe(false)
      expect(structSchema.safeParse(5n).success).toBe(false)
    })
  })

  describe('Struct partial() Refinement Preservation', () => {
    it('retains struct-level refinements after partial() derivation', () => {
      const schema = s
        .struct({
          a: s.number().optional(),
          b: s.number().optional(),
        })
        .refine((obj) => (obj.a ?? 0) + (obj.b ?? 0) > 10, 'Sum must be > 10')

      const partialSchema = schema.partial()
      expect(partialSchema.safeParse({ a: 6, b: 6 }).success).toBe(true)
      const fail = partialSchema.safeParse({ a: 2, b: 2 })
      expect(fail.success).toBe(false)
      expect(fail.issues?.[0].message).toBe('Sum must be > 10')
    })
  })

  describe('Computed Dependency Graph Cycle Handling', () => {
    it('throws descriptive error on circular computed property dependencies', () => {
      expect(() => {
        sortComputedDefsTopologically([
          {
            name: 'propA',
            ast: { type: 'Identifier', name: 'propB' },
            dependencies: ['propB'],
          },
          {
            name: 'propB',
            ast: { type: 'Identifier', name: 'propA' },
            dependencies: ['propA'],
          },
        ])
      }).toThrow(/Cycle detected in computed properties dependency graph/)
    })
  })

  describe('Issue Deduplication Path Collision', () => {
    it('does not incorrectly conflate distinct paths containing dots', () => {
      const schema = s.string().refine(() => [
        { path: ['a.b', 'c'], message: 'Issue 1' },
        { path: ['a', 'b.c'], message: 'Issue 1' },
      ])

      const res = schema.safeParse('test')
      expect(res.success).toBe(false)
      expect(res.issues).toHaveLength(2)
      expect(res.issues?.[0].path).toEqual(['a.b', 'c'])
      expect(res.issues?.[1].path).toEqual(['a', 'b.c'])
    })
  })

  describe('Struct toBuilder() Method', () => {
    it('creates a StructBuilder directly from StructSchema without feature envy', () => {
      const schema = s.struct({
        username: s.string().min(3),
        age: s.number().min(0),
      })

      const builder = schema.toBuilder('UserBuilder')
      expect(builder.name).toBe('UserBuilder')
      expect(builder.fields.has('username')).toBe(true)
      expect(builder.fields.has('age')).toBe(true)

      const rebuilt = builder.build()
      expect(rebuilt.safeParse({ username: 'al', age: 10 }).success).toBe(false)
      expect(rebuilt.safeParse({ username: 'alykam', age: 25 }).success).toBe(true)
    })
  })
})


