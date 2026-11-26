import { describe, expect, it } from 'vitest'
import { s } from '../src'
import { f } from '../src/form'
import type { Infer, InferInput } from '../src/types/inference'

describe('form fields and widgets', () => {
  it('keeps presentation separate from the reusable schema and validates values', async () => {
    const schema = s.string().min(2).max(200)
    const form = f.struct({
      plain: schema,
      bio: f.field(schema, { widget: f.textarea().rows(4), label: 'Biography' }),
      score: f.field(s.number().min(0).max(100).step(5), { widget: f.slider() }),
    })
    const tree = form.toFormTree()
    expect(tree.fieldsByKey.plain.widget).toBe('text')
    expect(tree.fieldsByKey.bio).toMatchObject({ widget: 'textarea', widgetProps: { rows: 4 }, label: 'Biography' })
    expect(tree.fieldsByKey.score).toMatchObject({ widget: 'slider', widgetProps: { min: 0, max: 100, step: 5 } })
    expect(schema.descriptor.metadata?.widget).toBeUndefined()
    expect(form.parse({ plain: 'OK', bio: 'Good', score: 15 })).toEqual({ plain: 'OK', bio: 'Good', score: 15 })
    expect(form.safeParse({ plain: 'OK', bio: 'x', score: 15 }).success).toBe(false)
    expect((await form.safeParseAsync({ plain: 'OK', bio: 'x', score: 15 })).success).toBe(false)
  })

  it('carries every display setting on the field, not on the schema', () => {
    const name = s.string()
    const form = f.struct({
      firstName: f.field(name, { label: 'First Name', colSpan: 6, helpText: 'Legal given name', placeholder: 'Ada' }),
      internalId: f.field(s.string(), { hidden: true, readonly: true }),
      role: f.field(s.string(), { disabled: true }),
      plain: name,
    })
    const { fieldsByKey: n } = form.toFormTree()
    expect(n.firstName).toMatchObject({ label: 'First Name', colSpan: 6, helpText: 'Legal given name', placeholder: 'Ada' })
    expect(n.internalId).toMatchObject({ hidden: true, readonly: true, disabled: false })
    expect(n.role).toMatchObject({ disabled: true, hidden: false })
    // the same schema, used without options, is unaffected
    expect(n.plain).toMatchObject({ label: 'plain', hidden: false, colSpan: undefined })
    expect(name.descriptor.metadata).toBeUndefined()
  })

  it('infers what a data source depends on, and fills in its defaults', () => {
    const form = f.struct({
      country: s.string(),
      city: f.field(s.string(), {
        widget: f.combobox(),
        dataSource: { type: 'http', url: '/cities?country=$values.country' },
        virtual: true,
        pagination: 25,
      }),
    })
    const city = form.toFormTree().fieldsByKey.city
    expect(city.dependsOn).toEqual(['country'])
    expect(city.dataSource).toMatchObject({ type: 'http', method: 'GET' })
    expect(city.virtual).toMatchObject({ enabled: true, itemHeight: 40 })
    expect(city.pagination).toMatchObject({ pageSize: 25 })
  })

  it('exposes nested struct fields, array item templates, and full paths', () => {
    const order = f.struct({
      address: f.struct({
        contact: f.row({ name: s.string() }),
      }),
      items: f.field(s.array(f.struct({
        name: s.string(),
        parts: f.field(s.array(s.struct({ name: s.string(), qty: s.integer() })), { widget: f.table() }),
      })), { widget: f.table() }),
    })
    const tree = order.toFormTree({ address: { name: 'A' } })
    expect(tree.fieldsByKey['address.name'].path).toBe('address.name')
    expect(tree.fieldsByKey['items[].name'].path).toBe('items[].name')
    expect(tree.fieldsByKey['items[].parts[].qty'].path).toBe('items[].parts[].qty')
    expect(tree.fieldsByKey.items.item?.children?.map((node) => node.key)).toEqual(['name', 'parts'])
    expect(tree.fieldsByKey['items[].parts'].item?.children?.map((node) => node.key)).toEqual(['name', 'qty'])
  })

  it('supports wrapped optional values and type-safe widget families', () => {
    const form = f.struct({
      bio: f.field(s.string().optional(), { widget: f.textarea() }),
      count: f.field(s.number().default(2), { widget: f.numberInput() }),
    })
    const input: InferInput<typeof form> = {}
    const output: Infer<typeof form> = { count: 2 }
    expect(form.parse(input)).toEqual(output)

    function typeChecks() {
      // @ts-expect-error A numeric widget cannot edit string input.
      f.field(s.string(), { widget: f.slider() })
      // @ts-expect-error Textareas cannot edit numeric input.
      f.field(s.number(), { widget: f.textarea() })
    }
    expect(typeChecks).toBeDefined()
  })
})
