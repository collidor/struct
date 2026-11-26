import { describe, expect, it } from 'vitest'
import {
  ITEM,
  PathScope,
  formatPath,
  getAt,
  matchesTemplate,
  parsePath,
  setAt,
  toTemplatePath,
} from '../src/form/paths'

const values = {
  region: 'eu',
  orders: [
    { ref: 'A', lines: [{ sku: 'a1' }, { sku: 'a2' }] },
    { ref: 'B', lines: [{ sku: 'b1' }] },
  ],
}

describe('form paths', () => {
  it('parses and formats concrete, dotted-numeric and template paths', () => {
    expect(parsePath('orders[2].lines[0].sku')).toEqual(['orders', 2, 'lines', 0, 'sku'])
    expect(parsePath('orders.2.lines.0.sku')).toEqual(['orders', 2, 'lines', 0, 'sku'])
    expect(parsePath('orders[].lines[].sku')).toEqual(['orders', ITEM, 'lines', ITEM, 'sku'])
    expect(formatPath('orders.2.lines.0.sku')).toBe('orders[2].lines[0].sku')
    expect(formatPath(['orders', ITEM, 'ref'])).toBe('orders[].ref')
  })

  it('maps concrete paths onto their template, and back', () => {
    expect(toTemplatePath('orders[1].lines[0].sku')).toBe('orders[].lines[].sku')
    expect(matchesTemplate('orders[1].lines[0].sku', 'orders[].lines[].sku')).toBe(true)
    expect(matchesTemplate('orders[1].ref', 'orders[].lines[].sku')).toBe(false)
    expect(matchesTemplate('orders[].ref', 'orders[].ref')).toBe(true)
  })

  it('reads and immutably writes by path', () => {
    expect(getAt(values, 'orders[1].lines[0].sku')).toBe('b1')
    expect(getAt(values, 'orders[5].ref')).toBeUndefined()
    expect(getAt(values, 'orders[].ref')).toBeUndefined()

    const next = setAt(values, 'orders[0].lines[1].sku', 'changed')
    expect(next.orders[0].lines[1].sku).toBe('changed')
    expect(values.orders[0].lines[1].sku).toBe('a2')
    // untouched branches are shared, touched ones are copied
    expect(next.orders[1]).toBe(values.orders[1])
    expect(next.orders[0]).not.toBe(values.orders[0])

    expect(setAt({}, 'a.rows[1].x', 1)).toEqual({ a: { rows: [undefined, { x: 1 }] } })
    expect(() => setAt({}, 'orders[].ref', 1)).toThrow(TypeError)
  })

  it('keeps the same key in different rows apart', () => {
    const row0 = new PathScope(values, 'orders[0]')
    const row1 = new PathScope(values, 'orders[1]')
    expect(row0.get('ref')).toBe('A')
    expect(row1.get('ref')).toBe('B')
    expect(row0.index).toBe(0)
    expect(row1.index).toBe(1)
    expect(row1.set('ref', 'B2').orders[1].ref).toBe('B2')
  })

  it('resolves $root, $parent and $item from a nested row', () => {
    const line = new PathScope(values, 'orders[0].lines[1]')
    expect(line.get('sku')).toBe('a2')
    expect(line.get('$root.region')).toBe('eu')
    expect(line.get('$item.sku')).toBe('a2') // nearest row is the line itself
    expect(line.get('$parent.ref')).toBe('A') // the order that owns the lines
    expect(line.get('$parent.$parent.region')).toBe('eu')
    expect(line.parent.base).toEqual(['orders', 0])
    expect(line.item?.base).toEqual(['orders', 0, 'lines', 1])

    // inside an object nested in a row, $item still means the row
    const address = new PathScope({ orders: [{ address: { city: 'X' }, ref: 'R' }] }, 'orders[0].address')
    expect(address.get('$item.ref')).toBe('R')
    expect(address.get('city')).toBe('X')
    expect(address.parent.base).toEqual(['orders', 0])
  })

  it('exposes a scope to expressions', () => {
    const ctx = new PathScope(values, 'orders[1]').context()
    expect(ctx.ref).toBe('B')
    expect(ctx.$index).toBe(1)
    expect((ctx.$root as typeof values).region).toBe('eu')
    expect((ctx.$item as { ref: string }).ref).toBe('B')
    expect(new PathScope(values).context().$index).toBeUndefined()
  })

  it('treats a missing scope as an empty object', () => {
    expect(new PathScope({}, 'orders[3]').value).toEqual({})
    expect(new PathScope({}, 'orders[].x').get('y')).toBeUndefined()
  })
})
