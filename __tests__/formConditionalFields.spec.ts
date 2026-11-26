import { describe, expect, it } from 'vitest'
import { s, toJSONSchema, toZod, fromJSONSchema, generateStructDDL } from '../src'
import { f } from '../src/form'

const business = () =>
  f.struct({
    kind: s.enum(['person', 'business']).default('person'),
    company: f.when('kind == "business"', { vat: s.string().min(3) }),
  })

describe('exporting a form with conditional fields', () => {
  it('does not claim a conditional field is always required', () => {
    const json = toJSONSchema(business().descriptor) as any
    expect(json.properties.vat).toBeDefined() // still described
    expect(json.required ?? []).not.toContain('vat') // but not demanded
  })

  it('exported schemas accept data that omits a field whose condition is false', () => {
    const form = business()
    const person = { kind: 'person' }
    expect(form.safeParse(person).success).toBe(true)
    expect(toZod(form).safeParse(person).success).toBe(true)
    expect(fromJSONSchema(toJSONSchema(form.descriptor)).safeParse(person).success).toBe(true)
  })

  it('the form itself still demands the field while its condition holds', () => {
    const form = business()
    expect(form.safeParse({ kind: 'business' }).success).toBe(false)
    expect(form.safeParse({ kind: 'business', vat: 'ABC' }).success).toBe(true)
  })

  it('treats both branches of one conditional the same way', () => {
    const form = f.struct({
      mode: s.string(),
      choice: f.when('mode == "a"', { x: s.string() }, { x: s.number() }),
    })
    const json = toJSONSchema(form.descriptor) as any
    expect(json.required).toEqual(['mode'])
    expect(form.safeParse({ mode: 'a', x: 'text' }).success).toBe(true)
    expect(form.safeParse({ mode: 'b', x: 5 }).success).toBe(true)
    expect(form.safeParse({ mode: 'b', x: 'text' }).success).toBe(false)
  })

  it('makes the column of a conditional field nullable', () => {
    const sql = generateStructDDL(business(), { tableName: 'accounts', dialect: 'sqlite' })
    const vat = sql.split('\n').find((line) => line.includes('vat'))!
    expect(vat).not.toMatch(/NOT NULL/i)
  })

  it('leaves fields outside any condition as they were', () => {
    const form = f.struct({ name: s.string(), shown: f.when('true', { extra: s.string() }) })
    expect((toJSONSchema(form.descriptor) as any).required).toEqual(['name'])
  })
})

describe('starting values', () => {
  it('leaves out the fields of a branch that is not active', () => {
    expect(business().createDefault()).toEqual({ kind: 'person' })
  })

  it('includes a branch that is active for the defaults', () => {
    const form = f.struct({
      kind: s.enum(['person', 'business']).default('business'),
      company: f.when('kind == "business"', { vat: s.string() }),
      person: f.when('kind == "person"', { age: s.number() }),
    })
    expect(form.createDefault()).toEqual({ kind: 'business', vat: '' })
  })

  it('follows a chain of conditions regardless of the order they are written in', () => {
    const form = f.struct({
      // `second` depends on a field `first` adds, and is written before it
      second: f.when('level == "x"', { deep: s.string() }),
      first: f.when('kind == "on"', { level: s.string().default('x') }),
      kind: s.string().default('on'),
    })
    expect(form.createDefault()).toEqual({ kind: 'on', level: 'x', deep: '' })
  })

  it('uses the else branch when the condition is false', () => {
    const form = f.struct({
      mode: s.string().default('b'),
      choice: f.when('mode == "a"', { x: s.string() }, { y: s.number() }),
    })
    expect(form.createDefault()).toEqual({ mode: 'b', y: 0 })
  })

  it('looks inside layouts and keeps optional fields out, as a plain struct does', () => {
    const form = f.struct({
      row: f.row({ a: s.string(), b: s.string().optional() }),
      shown: f.when('true', { c: s.string() }),
      note: f.heading('not data'),
    })
    expect(form.createDefault()).toEqual({ a: '', c: '' })
  })
})

describe('a key written twice', () => {
  it('is refused when two layouts both define it', () => {
    expect(() => f.struct({ a: f.row({ x: s.string() }), b: f.row({ x: s.number() }) })).toThrow(/Duplicate field "x"/)
  })

  it('is refused when a layout repeats a key of its struct', () => {
    expect(() => f.struct({ x: s.string(), group: f.section('G', { x: s.string() }) })).toThrow(/Duplicate field "x"/)
  })

  it('is refused when a conditional branch repeats a key outside it', () => {
    expect(() => f.struct({ x: s.string(), more: f.when('true', { x: s.string() }) })).toThrow(/Duplicate field "x"/)
  })

  it('is refused when two separate conditionals both define it', () => {
    expect(() =>
      f.struct({ one: f.when('a', { x: s.string() }), two: f.when('b', { x: s.string() }) }),
    ).toThrow(/Duplicate field "x"/)
  })

  it('names both places, so the clash can be found', () => {
    expect(() => f.struct({ top: f.row({ x: s.string() }), other: f.section('S', { x: s.string() }) })).toThrow(
      /"top\/x" and "other\/x"/,
    )
  })

  it('is refused through nested layouts and branches', () => {
    expect(() =>
      f.struct({ x: s.string(), deep: f.row({ inner: f.section('S', { g: f.when('true', { x: s.string() }) }) }) }),
    ).toThrow(/Duplicate field "x"/)
  })

  it('is refused when a later field reuses a key from the else branch (or the when branch)', () => {
    expect(() =>
      f.struct({ pick: f.when('c', { a: s.string() }, { x: s.string() }), x: s.number() }),
    ).toThrow(/Duplicate field "x"/)
    expect(() =>
      f.struct({ pick: f.when('c', { x: s.string() }, { b: s.string() }), x: s.number() }),
    ).toThrow(/Duplicate field "x"/)
  })

  it('is fine in the when and the else of ONE conditional, which are exclusive', () => {
    expect(() => f.struct({ pick: f.when('true', { x: s.string() }, { x: s.number() }) })).not.toThrow()
  })

  it('is fine in a nested form, which is a different object', () => {
    expect(() => f.struct({ x: s.string(), child: f.struct({ x: s.number() }) })).not.toThrow()
    expect(() => f.struct({ x: s.string(), rows: s.array(f.struct({ x: s.string() })) })).not.toThrow()
  })

  it('is fine for UI-only nodes, which hold no data', () => {
    expect(() => f.struct({ d1: f.divider(), d2: f.divider(), h: f.heading('x') })).not.toThrow()
  })
})
