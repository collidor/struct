import { describe, expect, expectTypeOf, it } from 'vitest'
import { s } from '../src'
import { f, descriptorToFormTree, isFormWidget } from '../src/form'

// Type-checked by `pnpm test:types`: the @ts-expect-error lines are the compile-time half.

describe('input widgets', () => {
  it('serialize with their kind and options', () => {
    expect(f.passwordInput().placeholder('secret').toJSON()).toEqual({ kind: 'password', props: { placeholder: 'secret' } })
    expect(f.colorInput().toJSON()).toEqual({ kind: 'color', props: {} })
    expect(f.fileInput().accept('.png,image/*').toJSON()).toEqual({ kind: 'file', props: { accept: '.png,image/*' } })
    expect(f.codeInput().rows(8).language('json').toJSON()).toEqual({ kind: 'code', props: { rows: 8, language: 'json' } })
    expect(f.dateInput().toJSON().kind).toBe('date')
    expect(f.datetimeInput().toJSON().kind).toBe('datetime')
    expect(f.select().placeholder('Pick').toJSON()).toEqual({ kind: 'select', props: { placeholder: 'Pick' } })
    expect(f.radio().orientation('vertical').toJSON()).toEqual({ kind: 'radio', props: { orientation: 'vertical' } })
    expect(f.checkbox().toJSON().kind).toBe('checkbox')
    expect(f.switchInput().toJSON().kind).toBe('switch')
    expect(f.multiselect().searchable().toJSON()).toEqual({ kind: 'multiselect', props: { searchable: true } })
  })

  it('are immutable and recognised as widgets', () => {
    const base = f.radio()
    const vertical = base.orientation('vertical')
    expect(base.props).toEqual({})
    expect(vertical).not.toBe(base)
    expect(isFormWidget(vertical)).toBe(true)
    expect(() => f.codeInput({ rows: 0 })).toThrow(RangeError)
  })

  it('reach the form tree under their own name', () => {
    const form = f.struct({
      secret: f.field(s.string(), { widget: f.passwordInput() }),
      accept: f.field(s.boolean(), { widget: f.checkbox() }),
      mode: f.field(s.enum(['a', 'b']), { widget: f.radio().orientation('vertical') }),
      tags: f.field(s.array(s.string()), { widget: f.multiselect(), options: ['x', 'y'] }),
      born: f.field(s.date(), { widget: f.dateInput() }),
      on: f.field(s.boolean(), { widget: f.switchInput() }),
    })
    const { fieldsByKey: n } = form.toFormTree()
    expect(n.secret.widget).toBe('password')
    expect(n.accept.widget).toBe('checkbox')
    expect(n.mode).toMatchObject({ widget: 'radio', widgetProps: { orientation: 'vertical' } })
    expect(n.mode.options?.map((o) => o.value)).toEqual(['a', 'b'])
    expect(n.tags).toMatchObject({ widget: 'multiselect' })
    expect(n.born.widget).toBe('date')
    expect(n.on.widget).toBe('switch')
  })

  it('are only offered for the values they can edit', () => {
    // each of these compiles
    f.field(s.string(), { widget: f.passwordInput() })
    f.field(s.string(), { widget: f.dateInput() }) // a string holding a date
    f.field(s.date(), { widget: f.dateInput() })
    f.field(s.date().optional(), { widget: f.datetimeInput() })
    f.field(s.boolean(), { widget: f.checkbox() })
    f.field(s.boolean(), { widget: f.switchInput() })
    f.field(s.enum(['a', 'b']), { widget: f.radio() })
    f.field(s.number(), { widget: f.select() }) // a number picked from a list
    f.field(s.array(s.string()), { widget: f.multiselect() })

    // each of these does not
    // @ts-expect-error a checkbox edits a boolean
    f.field(s.string(), { widget: f.checkbox() })
    // @ts-expect-error a password is a string
    f.field(s.number(), { widget: f.passwordInput() })
    // @ts-expect-error a date input needs a date or a string
    f.field(s.boolean(), { widget: f.dateInput() })
    // @ts-expect-error a multiselect edits a list
    f.field(s.string(), { widget: f.multiselect() })
    // @ts-expect-error a slider edits a number
    f.field(s.boolean(), { widget: f.slider() })
    // @ts-expect-error radio chooses a string or number
    f.field(s.boolean(), { widget: f.radio() })
    expectTypeOf(f.checkbox()).toHaveProperty('kind')
    expect(true).toBe(true)
  })
})

describe('display settings declared in a descriptor', () => {
  it('are honoured when the descriptor is the only place to say them', () => {
    const descriptor = s.struct({
      a: s.string().meta({ hidden: true, helpText: 'about a', colSpan: 6 }),
      b: s.string().meta({ disabled: true, readonly: true }),
      c: s.string(),
    }).descriptor
    const [a, b, c] = descriptorToFormTree(descriptor).nodes as any[]
    expect(a).toMatchObject({ hidden: true, helpText: 'about a', colSpan: 6 })
    expect(b).toMatchObject({ disabled: true, readonly: true, hidden: false })
    expect(c).toMatchObject({ hidden: false, disabled: false, readonly: false, colSpan: undefined })
  })

  it('do not leak into a form struct, whose presentation comes from f.field', () => {
    const form = f.struct({ a: s.string().meta({ hidden: true }) })
    expect(form.toFormTree().fieldsByKey.a.hidden).toBe(false)
    const withOption = f.struct({ a: f.field(s.string().meta({ hidden: true }), { hidden: false }) })
    expect(withOption.toFormTree().fieldsByKey.a.hidden).toBe(false)
  })
})
