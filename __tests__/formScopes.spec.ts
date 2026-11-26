import { describe, expect, it } from 'vitest'
import { s } from '../src'
import { f } from '../src/form'
import type { FormNode } from '../src/form'

function collectIds(nodes: FormNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.id)
    if (node.kind === 'layout') collectIds(node.children, out)
    if (node.kind === 'field' && node.children) collectIds(node.children, out)
  }
  return out
}

const orderForm = f.struct({
  region: s.string(),
  orders: f.field(
    s.array(
      f.struct({
        name: s.string().min(2),
        lines: f.field(s.array(s.struct({ name: s.string(), qty: s.integer() })), { widget: f.table() }),
      }),
    ),
    { widget: f.table() },
  ),
})

describe('scoped identity in forms', () => {
  it('keeps the same leaf key apart at every nesting level', () => {
    const tree = orderForm.toFormTree()
    expect(Object.keys(tree.fieldsByKey).sort()).toEqual([
      'orders',
      'orders[].lines',
      'orders[].lines[].name',
      'orders[].lines[].qty',
      'orders[].name',
      'region',
    ])
    expect(tree.fieldsByKey['orders[].name'].key).toBe('name')
    expect(tree.fieldsByKey['orders[].lines[].name'].key).toBe('name')
  })

  it('gives layout and decorator nodes ids that cannot collide', () => {
    const form = f.struct({
      wizard: f.steps({
        one: f.section('One', { divider: f.divider(), a: s.string() }),
        two: f.section('Two', { divider: f.divider(), b: s.string() }),
      }),
      tabs: f.tabs({ one: f.section('One', { c: s.string() }) }),
      a2: f.row({ divider: f.divider() }),
    })
    const ids = collectIds(form.toFormTree().nodes)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('/wizard/one/divider')
    expect(ids).toContain('/wizard/two/divider')
    expect(ids).toContain('/tabs/one')
  })

  it('evaluates conditions in a nested object against that object, with $root available', () => {
    const form = f.struct({
      mode: s.string(),
      billing: f.struct({
        kind: s.string(),
        company: f.when('kind == "business"', { vat: s.string() }),
        eu: f.when('$root.mode == "eu"', { vatRate: s.number() }),
      }),
    })
    const keysOf = (values: Record<string, unknown>) => {
      const billing = form.toFormTree(values).nodes.find((n) => n.key === 'billing')
      return billing?.kind === 'field' ? billing.children?.map((n) => n.key) : undefined
    }
    expect(keysOf({ mode: 'us', billing: { kind: 'person' } })).toEqual(['kind'])
    expect(keysOf({ mode: 'us', billing: { kind: 'business' } })).toEqual(['kind', 'vat'])
    expect(keysOf({ mode: 'eu', billing: { kind: 'person' } })).toEqual(['kind', 'vatRate'])
  })
})

describe('controller with scoped paths', () => {
  it('reads and writes the same key in different rows independently', () => {
    const controller = f.createController(orderForm, {
      initialValues: {
        region: 'eu',
        orders: [
          { name: 'A', lines: [{ name: 'x', qty: 1 }] },
          { name: 'B', lines: [{ name: 'y', qty: 2 }] },
        ],
      },
    })
    controller.setValue('orders[1].lines[0].name', 'changed')
    expect(controller.getValue('orders[1].lines[0].name')).toBe('changed')
    expect(controller.getValue('orders.1.lines.0.name')).toBe('changed')
    expect(controller.getValue('orders[0].lines[0].name')).toBe('x')
    expect(controller.isFieldTouched('orders.1.lines.0.name')).toBe(true)
    expect(controller.isFieldTouched('orders[0].lines[0].name')).toBe(false)
  })

  it('reports errors under the row that caused them, in one path format', () => {
    const controller = f.createController(orderForm, {
      initialValues: { region: 'eu', orders: [{ name: 'ok', lines: [] }, { name: 'x', lines: [] }] },
    })
    controller.validate()
    expect(Object.keys(controller.getErrors())).toEqual(['orders[1].name'])
    controller.setValue('orders[1].name', 'fixed')
    expect(controller.getErrors()).toEqual({})
  })

  it('runs list operations on nested lists by path', () => {
    const controller = f.createController(orderForm, {
      initialValues: { region: 'eu', orders: [{ name: 'A', lines: [] }, { name: 'B', lines: [] }] },
    })
    controller.arrayPush('orders[1].lines', { name: 'n', qty: 3 })
    expect(controller.getValue('orders[1].lines')).toEqual([{ name: 'n', qty: 3 }])
    expect(controller.getValue('orders[0].lines')).toEqual([])
    controller.arrayRemove('orders[1].lines', 0)
    expect(controller.getValue('orders[1].lines')).toEqual([])
    expect(controller.scope('orders[1]').get('$root.region')).toBe('eu')
  })
})
