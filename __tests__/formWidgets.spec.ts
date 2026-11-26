import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  textInput,
  textarea,
  numberInput,
  slider,
  range,
  table,
  tags,
  list,
  cards,
  tabsWidget,
  combobox,
  isCollectionWidget,
  type CollectionFormWidget,
  type ComboboxFormWidget,
  widgets,
  isFormWidget,
  isStringWidget,
  isNumericWidget,
  type FormWidget,
  type FormWidgetKind,
  type StringFormWidget,
  type NumericFormWidget,
  type WidgetForValue,
  type WidgetCompatibleWith,
  type WidgetValue,
  type TextareaWidget,
} from '../src/form/widgets'

describe('form widgets: kind and props', () => {
  it('exposes kind and plain props for every widget', () => {
    expect(textInput().kind).toBe('text')
    expect(textarea().kind).toBe('textarea')
    expect(numberInput().kind).toBe('number')
    expect(slider().kind).toBe('slider')
    expect(range().kind).toBe('range')

    for (const w of [textInput(), textarea(), numberInput(), slider(), range()]) {
      expect(w.props).toEqual({})
    }
  })

  it('applies chained options for each control', () => {
    expect(textInput().placeholder('Name').inputType('email').props).toEqual({
      placeholder: 'Name',
      inputType: 'email',
    })
    expect(textarea().rows(4).cols(40).placeholder('Bio').props).toEqual({
      rows: 4,
      cols: 40,
      placeholder: 'Bio',
    })
    expect(numberInput().placeholder('0').controls().props).toEqual({
      placeholder: '0',
      controls: true,
    })
    expect(slider().showValue().showTicks(false).orientation('vertical').props).toEqual({
      showValue: true,
      showTicks: false,
      orientation: 'vertical',
    })
    expect(range().showValue().orientation('horizontal').props).toEqual({
      showValue: true,
      orientation: 'horizontal',
    })
  })

  it('accepts initial props through the factory and exposes them via widgets bag', () => {
    expect(textarea({ rows: 3 }).props).toEqual({ rows: 3 })
    expect(widgets.slider({ showValue: true }).props).toEqual({ showValue: true })
    expect(Object.keys(widgets).sort()).toEqual([
      'cards',
      'checkbox',
      'codeInput',
      'colorInput',
      'combobox',
      'dateInput',
      'datetimeInput',
      'fileInput',
      'list',
      'multiselect',
      'numberInput',
      'passwordInput',
      'radio',
      'range',
      'select',
      'slider',
      'switchInput',
      'table',
      'tabsWidget',
      'tags',
      'textInput',
      'textarea',
    ])  })

  it('later calls override earlier ones and undefined props are omitted', () => {
    expect(textarea().rows(2).rows(6).props).toEqual({ rows: 6 })
    expect(textInput({ placeholder: undefined }).props).toEqual({})
    expect('placeholder' in textInput({ placeholder: undefined }).props).toBe(false)
  })

  it('does not duplicate schema constraints in widget props', () => {
    const keys = [slider(), range(), numberInput(), textInput(), textarea()].flatMap((w) =>
      Object.keys(w),
    )
    expect(keys).not.toContain('min')
    expect(keys).not.toContain('max')
    expect(keys).not.toContain('step')
    expect((slider() as unknown as Record<string, unknown>).min).toBeUndefined()
    expect((range() as unknown as Record<string, unknown>).step).toBeUndefined()
  })

  it('validates textarea rows and cols', () => {
    expect(() => textarea().rows(0)).toThrow(RangeError)
    expect(() => textarea().rows(-1)).toThrow(RangeError)
    expect(() => textarea().rows(2.5)).toThrow(RangeError)
    expect(() => textarea().cols(Number.NaN)).toThrow(RangeError)
    expect(() => textarea({ rows: 0 })).toThrow(RangeError)
  })
})

describe('form widgets: immutability', () => {
  it('chaining returns a new builder and leaves the receiver untouched', () => {
    const base = textarea()
    const withRows = base.rows(4)
    const withCols = withRows.cols(20)

    expect(withRows).not.toBe(base)
    expect(withCols).not.toBe(withRows)
    expect(base.props).toEqual({})
    expect(withRows.props).toEqual({ rows: 4 })
    expect(withCols.props).toEqual({ rows: 4, cols: 20 })
  })

  it('branches from a shared base independently', () => {
    const base = slider().showValue()
    const a = base.orientation('vertical')
    const b = base.showTicks()
    expect(a.props).toEqual({ showValue: true, orientation: 'vertical' })
    expect(b.props).toEqual({ showValue: true, showTicks: true })
    expect(base.props).toEqual({ showValue: true })
  })

  it('preserves the concrete class through chaining', () => {
    const w = textarea().placeholder('x').rows(2)
    expect(w.kind).toBe('textarea')
    expect(typeof w.cols).toBe('function')
  })

  it('props is frozen and cannot be mutated', () => {
    const w = textInput().placeholder('hi')
    expect(Object.isFrozen(w.props)).toBe(true)
    expect(() => {
      ;(w.props as { placeholder?: string }).placeholder = 'changed'
    }).toThrow(TypeError)
    expect(w.props.placeholder).toBe('hi')
  })

  it('does not alias the initial props object', () => {
    const init = { rows: 3 }
    const w = textarea(init)
    init.rows = 99
    expect(w.props.rows).toBe(3)
  })
})

describe('form widgets: serialization', () => {
  it('toJSON returns kind and props only', () => {
    expect(textarea().rows(4).placeholder('Bio').toJSON()).toEqual({
      kind: 'textarea',
      props: { rows: 4, placeholder: 'Bio' },
    })
  })

  it('round-trips through JSON.stringify as plain data', () => {
    const all: FormWidget[] = [
      textInput().placeholder('a').inputType('url'),
      textarea().rows(4).cols(10),
      numberInput().controls(),
      slider().showValue().showTicks().orientation('vertical'),
      range().showValue(),
    ]
    const json = JSON.stringify(all)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual([
      { kind: 'text', props: { placeholder: 'a', inputType: 'url' } },
      { kind: 'textarea', props: { rows: 4, cols: 10 } },
      { kind: 'number', props: { controls: true } },
      { kind: 'slider', props: { showValue: true, showTicks: true, orientation: 'vertical' } },
      { kind: 'range', props: { showValue: true } },
    ])
    expect(JSON.stringify(parsed)).toBe(json)
  })

  it('serialized output is detached from the builder', () => {
    const w = textarea().rows(4)
    const out = w.toJSON()
    expect(Object.isFrozen(out.props)).toBe(false)
    ;(out.props as { rows?: number }).rows = 1
    expect(w.props.rows).toBe(4)
  })

  it('props contain only JSON primitives', () => {
    const w = slider().showValue().orientation('horizontal')
    for (const v of Object.values(w.props)) {
      expect(['string', 'number', 'boolean']).toContain(typeof v)
    }
  })
})

describe('form widgets: guards', () => {
  it('classifies widgets', () => {
    expect(isFormWidget(textInput())).toBe(true)
    expect(isFormWidget({ kind: 'text', props: {} })).toBe(false)
    expect(isFormWidget(null)).toBe(false)
    expect(isStringWidget(textarea())).toBe(true)
    expect(isStringWidget(slider())).toBe(false)
    expect(isNumericWidget(range())).toBe(true)
    expect(isNumericWidget(numberInput())).toBe(true)
    expect(isNumericWidget(textInput())).toBe(false)
  })

  it('narrows the union on kind', () => {
    const w: FormWidget = textarea().rows(3) as FormWidget
    if (w.kind === 'textarea') {
      expectTypeOf(w).toEqualTypeOf<TextareaWidget<string>>()
      expect(w.props.rows).toBe(3)
    } else {
      throw new Error('expected textarea')
    }
  })
})

describe('form widgets: types', () => {
  it('discriminates kinds and value families', () => {
    expectTypeOf<FormWidget['kind']>().toEqualTypeOf<FormWidgetKind>()
    expectTypeOf<StringFormWidget['kind']>().toEqualTypeOf<'text' | 'textarea'>()
    expectTypeOf<NumericFormWidget['kind']>().toEqualTypeOf<'number' | 'slider' | 'range'>()
  })

  it('supports explicit value generics', () => {
    const w = textInput<'a' | 'b'>()
    expectTypeOf<WidgetValue<typeof w>>().toEqualTypeOf<'a' | 'b'>()
    expectTypeOf(w).toExtend<StringFormWidget>()
    const n = slider<1 | 2 | 3>().showValue()
    expectTypeOf<WidgetValue<typeof n>>().toEqualTypeOf<1 | 2 | 3>()
    expectTypeOf(n).toExtend<NumericFormWidget>()
    const _neverCalled = () => {
      // @ts-expect-error string widget cannot carry a numeric value
      textInput<number>()
      // @ts-expect-error numeric widget cannot carry a string value
      slider<string>()
    }
    void _neverCalled
  })

  it('maps field value types to compatible widgets', () => {
    expectTypeOf<WidgetForValue<string>>().toEqualTypeOf<StringFormWidget | ComboboxFormWidget>()
    expectTypeOf<WidgetForValue<string | undefined>>().toEqualTypeOf<StringFormWidget | ComboboxFormWidget>()
    expectTypeOf<WidgetForValue<'a' | 'b'>>().toEqualTypeOf<StringFormWidget | ComboboxFormWidget>()
    expectTypeOf<WidgetForValue<number>>().toEqualTypeOf<NumericFormWidget>()
    expectTypeOf<WidgetForValue<boolean>>().toEqualTypeOf<never>()
    expectTypeOf<WidgetForValue<string | number>>().toEqualTypeOf<never>()

    // Field-API style check
    const useWidget = <TValue, W extends FormWidget>(_w: WidgetCompatibleWith<W, TValue>) => _w
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof slider>, number>>().not.toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof slider>, string>>().toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof textarea>, string>>().not.toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof textarea>, number>>().toBeNever()
    // combobox fits both string and array fields, but not numbers
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof combobox>, string>>().not.toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof combobox>, string[]>>().not.toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof combobox>, number>>().toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof tags>, string>>().toBeNever()
    expectTypeOf(combobox<string>()).toExtend<ComboboxFormWidget>()
    expectTypeOf(combobox<string[]>()).toExtend<ComboboxFormWidget>()
    expect(typeof useWidget).toBe('function')
  })

  it('exposes only methods appropriate to each control', () => {
    const _neverCalled = () => {
      // @ts-expect-error rows belongs to textarea only
      textInput().rows(2)
      // @ts-expect-error showTicks belongs to slider only
      range().showTicks()
      // @ts-expect-error min is a schema constraint, not a widget option
      slider().min(0)
      // @ts-expect-error unknown prop
      textarea({ min: 1 })
      // @ts-expect-error invalid input type
      textInput().inputType('number')
    }
    void _neverCalled
    expect(true).toBe(true)
  })
})

describe('form widgets: collection widgets', () => {
  it('exposes kind and serializable config as props', () => {
    expect(table({ pageSize: 10, columns: [{ key: 'a', computed: 'x * 2' }] }).toJSON()).toEqual({
      kind: 'table',
      props: { pageSize: 10, columns: [{ key: 'a', computed: 'x * 2' }] },
    })
    expect(tags({ creatable: true, maxTags: 5 }).kind).toBe('tags')
    expect(list({ itemTitle: 'name', maxItems: 3 }).props).toEqual({ itemTitle: 'name', maxItems: 3 })
    expect(cards({ columns: 3, gap: '1rem' }).kind).toBe('cards')
    expect(tabsWidget({ tabTitle: 'name' }).kind).toBe('tabs')
    expect(combobox({ searchable: true, virtual: { enabled: true, itemHeight: 32 } }).props).toEqual({
      searchable: true,
      virtual: { enabled: true, itemHeight: 32 },
    })
    for (const w of [table(), tags(), list(), cards(), tabsWidget(), combobox()]) {
      expect(w.props).toEqual({})
      expect(isCollectionWidget(w)).toBe(true)
      expect(isFormWidget(w)).toBe(true)
      expect(JSON.parse(JSON.stringify(w))).toEqual({ kind: w.kind, props: {} })
    }
    expect(isCollectionWidget(textInput())).toBe(false)
  })

  it('configure() is immutable and shallow-merges', () => {
    const base = table({ pageSize: 5 })
    const next = base.configure({ sortable: true, pageSize: 20 })
    expect(next).not.toBe(base)
    expect(base.props).toEqual({ pageSize: 5 })
    expect(next.props).toEqual({ pageSize: 20, sortable: true })
    expect(next.kind).toBe('table')
  })

  it('deep-clones and freezes config', () => {
    const cols = [{ key: 'a' }]
    const w = table({ columns: cols })
    cols[0].key = 'changed'
    expect(w.props.columns?.[0].key).toBe('a')
    expect(Object.isFrozen(w.props)).toBe(true)
    expect(Object.isFrozen(w.props.columns)).toBe(true)
    const out = w.toJSON()
    ;(out.props.columns as { key: string }[])[0].key = 'x'
    expect(w.props.columns?.[0].key).toBe('a')
  })

  it('rejects non-serializable config at runtime', () => {
    expect(() => list({ itemTitle: (() => 'x') as unknown as string })).toThrow(TypeError)
    expect(() => tags({ maxTags: Number.NaN })).toThrow(TypeError)
  })

  it('types: array compatibility and function-valued members excluded', () => {
    type Row = { id: number }
    expectTypeOf<WidgetForValue<Row[]>>().toEqualTypeOf<CollectionFormWidget>()
    expectTypeOf<WidgetForValue<string[] | undefined>>().toEqualTypeOf<CollectionFormWidget>()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof table>, Row[]>>().not.toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof table>, string>>().toBeNever()
    expectTypeOf<WidgetCompatibleWith<ReturnType<typeof slider>, Row[]>>().toBeNever()
    const t = table<Row[]>()
    expectTypeOf<WidgetValue<typeof t>>().toEqualTypeOf<Row[]>()
    const _neverCalled = () => {
      // @ts-expect-error callbacks are not serializable
      list({ itemTitle: () => 'x' })
      // @ts-expect-error custom aggregation needs fn, which is not serializable
      table({ aggregations: [{ column: 'a', op: 'custom' }] })
      // @ts-expect-error array widget cannot carry a scalar value
      table<string>()
      // @ts-expect-error combobox cannot carry a number
      combobox<number>()
    }
    void _neverCalled
  })
})
