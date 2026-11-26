import { describe, expect, it } from 'vitest'
import { s, toJSONSchema } from '../src'
import { f } from '../src/form'
import type { FormFieldNode } from '../src/form'

const nodeOf = (form: ReturnType<typeof f.struct>, values: Record<string, unknown>, key: string): FormFieldNode =>
  form.toFormTree(values).fieldsByKey[key]

describe('disabledWhen, readonlyWhen and hiddenWhen', () => {
  const form = f.struct({
    plan: s.string(),
    seats: f.field(s.number(), { disabledWhen: 'plan == "free"' }),
    coupon: f.field(s.string().optional(), { readonlyWhen: 'plan == "pro"', hiddenWhen: 'plan == "free"' }),
    always: f.field(s.string().optional(), { disabled: true, disabledWhen: 'false' }),
  })

  it('follow the current values', () => {
    expect(nodeOf(form, { plan: 'free' }, 'seats')).toMatchObject({ disabled: true })
    expect(nodeOf(form, { plan: 'team' }, 'seats')).toMatchObject({ disabled: false })
    expect(nodeOf(form, { plan: 'pro' }, 'coupon')).toMatchObject({ readonly: true, hidden: false })
    expect(nodeOf(form, { plan: 'free' }, 'coupon')).toMatchObject({ readonly: false, hidden: true })
  })

  it('add to a fixed setting rather than replace it', () => {
    expect(nodeOf(form, { plan: 'x' }, 'always').disabled).toBe(true)
  })

  it('never change what is validated or what is returned', () => {
    // a hidden or disabled field still holds data and still obeys its schema
    expect(form.safeParse({ plan: 'free', seats: 'many' }).success).toBe(false)
    expect(form.parse({ plan: 'free', seats: 3, coupon: 'X' })).toMatchObject({ seats: 3, coupon: 'X' })
  })

  it('are judged against the row they sit in, and its parent', () => {
    const rows = f.struct({
      mode: s.string(),
      rows: f.field(
        s.array(
          f.struct({
            kind: s.string(),
            note: f.field(s.string().optional(), { disabledWhen: 'kind == "auto"', hiddenWhen: '$parent.mode == "simple"' }),
          }),
        ),
        { widget: f.table() },
      ),
    })
    const values = { mode: 'simple', rows: [{ kind: 'auto' }, { kind: 'manual' }] }
    const list = rows.toFormTree(values).fieldsByKey.rows
    const note = (i: number) => list.resolveItem!(values, `rows[${i}]`)!.children!.find((c) => c.key === 'note') as FormFieldNode
    expect(note(0)).toMatchObject({ disabled: true, hidden: true })
    expect(note(1)).toMatchObject({ disabled: false, hidden: true })
    const manual = { mode: 'full', rows: [{ kind: 'manual' }] }
    const second = rows.toFormTree(manual).fieldsByKey.rows.resolveItem!(manual, 'rows[0]')!.children!.find((c) => c.key === 'note') as FormFieldNode
    expect(second).toMatchObject({ disabled: false, hidden: false })
  })
})

describe('requiredWhen', () => {
  const form = f.struct({
    kind: s.string(),
    // the schema says required, but requiredWhen decides
    vat: f.field(s.string().min(3), { requiredWhen: 'kind == "business"' }),
  })

  it('turns an empty value into an error while the condition holds', () => {
    const result = form.safeParse({ kind: 'business' })
    expect(result.success).toBe(false)
    expect(result.issues?.map((i) => i.path?.join('.'))).toEqual(['vat'])
    expect(form.safeParse({ kind: 'business', vat: '' }).success).toBe(false)
  })

  it('accepts an empty value while it does not, even though the schema alone would not', () => {
    expect(form.safeParse({ kind: 'person' }).success).toBe(true)
    expect(form.safeParse({ kind: 'person', vat: '' }).success).toBe(true)
  })

  it('still applies the schema to a value that is given', () => {
    expect(form.safeParse({ kind: 'person', vat: 'ab' }).success).toBe(false)
    expect(form.safeParse({ kind: 'business', vat: 'ABC' }).success).toBe(true)
  })

  it('makes an optional schema required, too', () => {
    const optional = f.struct({ on: s.boolean(), reason: f.field(s.string().optional(), { requiredWhen: 'on' }) })
    expect(optional.safeParse({ on: true }).success).toBe(false)
    expect(optional.safeParse({ on: false }).success).toBe(true)
  })

  it('is reflected in the tree and the exported descriptor', () => {
    expect(nodeOf(form, { kind: 'business' }, 'vat').required).toBe(true)
    expect(nodeOf(form, { kind: 'person' }, 'vat').required).toBe(false)
    expect((toJSONSchema(form.descriptor) as any).required).toEqual(['kind'])
  })

  it('agrees asynchronously', async () => {
    expect((await form.safeParseAsync({ kind: 'business' })).success).toBe(false)
    expect((await form.safeParseAsync({ kind: 'person' })).success).toBe(true)
  })

  it('is judged per row', () => {
    const rows = f.struct({
      rows: s.array(f.struct({ paid: s.boolean(), ref: f.field(s.string(), { requiredWhen: 'paid' }) })),
    })
    const result = rows.safeParse({ rows: [{ paid: true }, { paid: false }, { paid: true, ref: 'R' }] })
    expect(result.issues?.map((i) => i.path?.join('.'))).toEqual(['rows.0.ref'])
  })
})

describe('cascading options', () => {
  const cities = {
    by: 'country',
    map: { DE: ['Berlin', 'Munich'], FR: [{ value: 'PAR', label: 'Paris' }] },
    otherwise: ['Other'],
  }
  const form = f.struct({
    country: s.string(),
    city: f.field(s.string().optional(), { widget: f.combobox(), options: cities }),
  })

  it('offers the choices of the current country', () => {
    expect(nodeOf(form, { country: 'DE' }, 'city').options).toEqual([
      { value: 'Berlin', label: 'Berlin' },
      { value: 'Munich', label: 'Munich' },
    ])
    expect(nodeOf(form, { country: 'FR' }, 'city').options).toEqual([{ value: 'PAR', label: 'Paris' }])
    expect(nodeOf(form, { country: 'XX' }, 'city').options).toEqual([{ value: 'Other', label: 'Other' }])
    expect(nodeOf(form, {}, 'city').options).toEqual([{ value: 'Other', label: 'Other' }])
  })

  it('rejects a choice that belongs to a different country', () => {
    expect(form.safeParse({ country: 'DE', city: 'Berlin' }).success).toBe(true)
    const stale = form.safeParse({ country: 'FR', city: 'Berlin' })
    expect(stale.success).toBe(false)
    expect(stale.issues?.[0]).toMatchObject({ code: 'invalid_option' })
    expect(stale.issues?.map((i) => i.path?.join('.'))).toEqual(['city'])
  })

  it('does not object to an empty choice', () => {
    expect(form.safeParse({ country: 'DE' }).success).toBe(true)
    expect(form.safeParse({ country: 'DE', city: '' }).success).toBe(true)
  })

  it('checks every element of a multiple choice', () => {
    const multi = f.struct({
      country: s.string(),
      cities: f.field(s.array(s.string()), { options: cities }),
    })
    expect(multi.safeParse({ country: 'DE', cities: ['Berlin', 'Munich'] }).success).toBe(true)
    expect(multi.safeParse({ country: 'DE', cities: ['Berlin', 'Paris'] }).success).toBe(false)
  })

  it('accepts a fixed list and a function', () => {
    const fixed = f.struct({ size: f.field(s.string(), { options: ['S', 'M', { value: 'L', label: 'Large' }] }) })
    expect(nodeOf(fixed, {}, 'size').options?.map((o) => o.label)).toEqual(['S', 'M', 'Large'])
    expect(fixed.safeParse({ size: 'L' }).success).toBe(true)
    expect(fixed.safeParse({ size: 'XL' }).success).toBe(false)

    const computed = f.struct({
      max: s.number(),
      pick: f.field(s.number(), { options: (values) => Array.from({ length: Number(values.max) }, (_, i) => i + 1) }),
    })
    expect(nodeOf(computed, { max: 3 }, 'pick').options?.map((o) => o.value)).toEqual([1, 2, 3])
    expect(computed.safeParse({ max: 3, pick: 4 }).success).toBe(false)
    expect(computed.safeParse({ max: 5, pick: 4 }).success).toBe(true)
  })

  it('follows a field of the row it sits in, or any other via $root', () => {
    const rows = f.struct({
      region: s.string(),
      rows: s.array(
        f.struct({
          country: s.string(),
          city: f.field(s.string(), { options: { by: 'country', map: { DE: ['Berlin'], FR: ['Lyon'] } } }),
          zone: f.field(s.string(), { options: { by: '$root.region', map: { eu: ['A'], us: ['B'] } } }),
        }),
      ),
    })
    const good = { region: 'eu', rows: [{ country: 'DE', city: 'Berlin', zone: 'A' }, { country: 'FR', city: 'Lyon', zone: 'A' }] }
    expect(rows.safeParse(good).success).toBe(true)
    const bad = { region: 'eu', rows: [{ country: 'DE', city: 'Lyon', zone: 'B' }] }
    expect(rows.safeParse(bad).issues?.map((i) => i.path?.join('.')).sort()).toEqual(['rows.0.city', 'rows.0.zone'])
  })
})

describe('derive', () => {
  const form = f.struct({
    qty: s.number(),
    price: s.number(),
    total: f.field(s.number(), { derive: 'qty * price' }),
    label: f.field(s.string(), { derive: (values) => `x${values.qty}` }),
  })

  it('computes the value in the parsed output and ignores what was sent', () => {
    expect(form.parse({ qty: 3, price: 5 })).toEqual({ qty: 3, price: 5, total: 15, label: 'x3' })
    expect(form.parse({ qty: 3, price: 5, total: 999, label: 'forged' })).toMatchObject({ total: 15, label: 'x3' })
  })

  it('is not required in the input', () => {
    expect(form.safeParse({ qty: 1, price: 1 }).success).toBe(true)
    expect((toJSONSchema(form.descriptor) as any).required).toEqual(['qty', 'price'])
  })

  it('shows the current value in the tree, read-only and not required', () => {
    const total = nodeOf(form, { qty: 2, price: 4 }, 'total')
    expect(total).toMatchObject({ derivedValue: 8, readonly: true, required: false })
    expect(nodeOf(form, { qty: 2, price: 5 }, 'total').derivedValue).toBe(10)
  })

  it('can read other lists, per row', () => {
    const rows = f.struct({
      lines: s.array(f.struct({ n: s.number(), of: f.field(s.string(), { derive: '$index + 1' }) })),
      count: f.field(s.number(), { derive: 'count(lines)' }),
    })
    expect(rows.parse({ lines: [{ n: 1 }, { n: 2 }] })).toEqual({
      lines: [{ n: 1, of: '1' }, { n: 2, of: '2' }].map((l, i) => ({ ...l, of: i + 1 })),
      count: 2,
    })
  })

  it('agrees asynchronously', async () => {
    expect((await form.safeParseAsync({ qty: 4, price: 2 })).data).toMatchObject({ total: 8 })
  })
})

describe('keepHidden', () => {
  const build = (keepHidden?: boolean) =>
    f.struct({
      kind: s.string(),
      branch: f.when('kind == "a"', { a: s.string() }, { b: s.string() }, { keepHidden }),
    })

  it('drops the inactive branch by default', () => {
    expect(build().parse({ kind: 'a', a: 'x', b: 'stale' })).toEqual({ kind: 'a', a: 'x' })
  })

  it('carries its values along, unvalidated, when asked', () => {
    const form = build(true)
    expect(form.parse({ kind: 'a', a: 'x', b: 'stale' })).toEqual({ kind: 'a', a: 'x', b: 'stale' })
    // the inactive branch is not checked: a wrong type there is kept, not rejected
    expect(form.safeParse({ kind: 'a', a: 'x', b: 12 }).success).toBe(true)
    // the active branch still is
    expect(form.safeParse({ kind: 'a', a: 5, b: 'stale' }).success).toBe(false)
  })

  it('does not invent values that were never there', () => {
    expect(build(true).parse({ kind: 'b', b: 'y' })).toEqual({ kind: 'b', b: 'y' })
  })
})

describe('layout state in the controller', () => {
  const form = f.struct({
    tabs: f.tabs({ one: f.section('One', { a: s.string().optional() }), two: f.section('Two', { b: s.string().optional() }) }, { defaultTab: 'two' }),
    plain: f.tabs({ x: f.section('X', { c: s.string().optional() }), y: f.section('Y', { d: s.string().optional() }) }),
    acc: f.accordion({
      first: f.section({ title: 'First', defaultOpen: true }, { e: s.string().optional() }),
      second: f.section('Second', { g: s.string().optional() }),
    }),
    allOpen: f.accordion({ p: f.section('P', { h: s.string().optional() }) }, { defaultOpen: true }),
  })
  const idOf = (c: ReturnType<typeof f.createController>, key: string) =>
    (c.getTree().nodes.find((n) => n.key === key) as any).id as string

  it('starts on the default tab, else the first, and remembers a choice', () => {
    const c = f.createController(form)
    expect(c.getTab(idOf(c, 'tabs'))).toBe('two')
    expect(c.getTab(idOf(c, 'plain'))).toBe('x')
    c.setTab(idOf(c, 'tabs'), 'one')
    expect(c.getTab(idOf(c, 'tabs'))).toBe('one')
  })

  it('ignores a default tab that does not exist', () => {
    const odd = f.struct({ t: f.tabs({ a: f.section('A', { x: s.string().optional() }) }, { defaultTab: 'nope' }) })
    const c = f.createController(odd)
    expect(c.getTab((c.getTree().nodes[0] as any).id)).toBe('a')
  })

  it('opens accordion panels by their own default, then the accordion default, else closed', () => {
    const c = f.createController(form)
    const acc = idOf(c, 'acc')
    expect(c.isOpen(acc, 'first')).toBe(true)
    expect(c.isOpen(acc, 'second')).toBe(false)
    expect(c.isOpen(idOf(c, 'allOpen'), 'p')).toBe(true)
  })

  it('lets the user open and close panels, per accordion', () => {
    const c = f.createController(form)
    const acc = idOf(c, 'acc')
    c.toggleOpen(acc, 'second')
    c.setOpen(acc, 'first', false)
    expect(c.isOpen(acc, 'second')).toBe(true)
    expect(c.isOpen(acc, 'first')).toBe(false)
    expect(c.isOpen(idOf(c, 'allOpen'), 'p')).toBe(true)
    expect(c.getState().openPanels).toEqual({ [acc]: { second: true, first: false } })
  })
})

describe('hidden fields take no part in validation', () => {
  const paths = (result: { issues?: Array<{ path?: ReadonlyArray<unknown> }> }) =>
    (result.issues ?? []).map((i) => i.path?.join('.'))

  it('a hidden field that is required and empty does not block, and is absent from the output', () => {
    const form = f.struct({
      name: s.string(),
      internal: f.field(s.string().min(3), { hidden: true }),
    })
    expect(form.safeParse({ name: 'a' }).success).toBe(true)
    expect(form.parse({ name: 'a' })).toEqual({ name: 'a' })
  })

  it('a hidden field with an invalid value does not block either, and its value passes through', () => {
    const form = f.struct({ name: s.string(), internal: f.field(s.string().min(3), { hidden: true }) })
    const result = form.safeParse({ name: 'a', internal: 'x' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: 'a', internal: 'x' })
    // a value of the wrong type is not reported either
    expect(form.safeParse({ name: 'a', internal: 42 }).success).toBe(true)
  })

  it('follows hiddenWhen: exempt while hidden, enforced again the moment it is shown', () => {
    const form = f.struct({
      plan: s.string(),
      coupon: f.field(s.string().min(3), { hiddenWhen: 'plan == "free"' }),
    })
    expect(form.safeParse({ plan: 'free' }).success).toBe(true)
    expect(form.safeParse({ plan: 'free', coupon: 'x' }).success).toBe(true)
    expect(paths(form.safeParse({ plan: 'pro' }))).toEqual(['coupon'])
    expect(paths(form.safeParse({ plan: 'pro', coupon: 'x' }))).toEqual(['coupon'])
    expect(form.safeParse({ plan: 'pro', coupon: 'abc' }).success).toBe(true)
  })

  it('hiding wins over requiredWhen, options and the schema', () => {
    const form = f.struct({
      on: s.boolean(),
      a: f.field(s.string(), { hidden: true, requiredWhen: 'on' }),
      b: f.field(s.string(), { hiddenWhen: 'on', options: ['x'] }),
    })
    expect(form.safeParse({ on: true, b: 'not-an-option' }).success).toBe(true)
    expect(paths(form.safeParse({ on: false, b: 'not-an-option' }))).toEqual(['b'])
  })

  it('exempts a hidden group and a hidden table with bad rows', () => {
    const form = f.struct({
      show: s.boolean(),
      address: f.field(f.struct({ street: s.string().min(5) }), { hiddenWhen: '!show' }),
      rows: f.field(s.array(f.struct({ ref: s.string().min(2) })), { widget: f.table(), hiddenWhen: '!show' }),
    })
    expect(form.safeParse({ show: false, address: { street: 'x' }, rows: [{ ref: '' }] }).success).toBe(true)
    expect(paths(form.safeParse({ show: true, address: { street: 'x' }, rows: [{ ref: '' }] })).sort()).toEqual([
      'address.street',
      'rows.0.ref',
    ])
  })

  it('is judged per row', () => {
    const form = f.struct({
      rows: s.array(f.struct({ auto: s.boolean(), ref: f.field(s.string().min(2), { hiddenWhen: 'auto' }) })),
    })
    const result = form.safeParse({ rows: [{ auto: true }, { auto: false }, { auto: false, ref: 'ok' }] })
    expect(paths(result)).toEqual(['rows.1.ref'])
  })

  it('still computes a derived value that is hidden', () => {
    const form = f.struct({ qty: s.number(), total: f.field(s.number(), { derive: 'qty * 2', hidden: true }) })
    expect(form.parse({ qty: 4 })).toEqual({ qty: 4, total: 8 })
  })

  it('shows in the tree as hidden and not required', () => {
    const form = f.struct({ x: f.field(s.string(), { hidden: true }), y: f.field(s.string(), { hiddenWhen: 'false' }) })
    const { fieldsByKey: n } = form.toFormTree({})
    expect(n.x).toMatchObject({ hidden: true, required: false })
    expect(n.y).toMatchObject({ hidden: false, required: true })
  })

  it('exports as optional, since a plain descriptor cannot say "required unless hidden"', () => {
    const form = f.struct({ a: s.string(), b: f.field(s.string(), { hidden: true }), c: f.field(s.string(), { hiddenWhen: 'a' }) })
    expect((toJSONSchema(form.descriptor) as any).required).toEqual(['a'])
  })

  it('agrees asynchronously', async () => {
    const form = f.struct({ x: f.field(s.string().min(3), { hidden: true }), y: s.string() })
    expect((await form.safeParseAsync({ y: 'a' })).success).toBe(true)
    expect((await form.safeParseAsync({ y: 'a', x: 'x' })).data).toEqual({ y: 'a', x: 'x' })
  })

  it('never blocks a wizard step', () => {
    const form = f.struct({
      wizard: f.steps({
        one: f.section('One', { a: s.string(), secret: f.field(s.string().min(5), { hidden: true }) }),
        two: f.section('Two', { b: s.string() }),
      }),
    })
    const c = f.createController(form, { initialValues: { a: 'x' } })
    const id = (c.getTree().nodes[0] as any).id
    expect(c.setStep(1, id)).toBe(true)
    expect(c.getErrors()).toEqual({})
  })
})
