import { describe, it, expect } from 'vitest'
import { fieldsOf } from './support/fields'
import { s, inferWidget } from '../src'

describe('Form Inspector Heuristics and Rich Widgets', () => {
  it('infers table widget with columns and children for arrays of structs', () => {
    const InventorySchema = s.struct({
      items: s.array(
        s.struct({
          name: s.string().label('Item Name'),
          quantity: s.integer().min(1).label('Qty'),
          price: s.number().label('Price'),
        })
      ).label('Inventory Items'),
    })

    const fields = fieldsOf(InventorySchema)
    expect(fields).toHaveLength(1)

    const itemsField = fields[0]
    expect(itemsField.key).toBe('items')
    expect(itemsField.widget).toBe('table')
    expect(itemsField.widgetProps.columns).toEqual([
      { key: 'name', label: 'Item Name', type: 'string' },
      { key: 'quantity', label: 'Qty', type: 'integer' },
      { key: 'price', label: 'Price', type: 'number' },
    ])

    // each row is described once, as a template whose paths stand for every row
    const row = itemsField.item!.children!
    expect(row).toHaveLength(3)
    expect(row.map((c) => c.key)).toEqual(['name', 'quantity', 'price'])
    expect(row[0].path).toBe('items[].name')
  })

  it('infers list widget for arrays of records', () => {
    const ConfigSchema = s.struct({
      metadataList: s.array(s.record(s.string())),
    })

    const fields = fieldsOf(ConfigSchema)
    expect(fields[0].widget).toBe('list')
  })

  it('infers multiselect widget with options for arrays of enums', () => {
    const TaggedSchema = s.struct({
      roles: s.array(s.enum(['admin', 'editor', 'viewer'] as const)),
    })

    const fields = fieldsOf(TaggedSchema)
    expect(fields[0].widget).toBe('multiselect')
    expect(fields[0].widgetProps.options).toEqual([
      { value: 'admin', label: 'Admin' },
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Viewer' },
    ])
  })

  it('infers tags widget for arrays of primitive strings/numbers', () => {
    const SimpleSchema = s.struct({
      tags: s.array(s.string()),
    })

    const fields = fieldsOf(SimpleSchema)
    expect(fields[0].widget).toBe('tags')
  })

  it('infers password and file widgets from string formats', () => {
    const AccountSchema = s.struct({
      password: s.string().password('Password required'),
      avatar: s.string().file(),
    })

    const fields = fieldsOf(AccountSchema)
    expect(fields[0].widget).toBe('password')
    expect(fields[0].widgetProps.type).toBe('password')

    expect(fields[1].widget).toBe('file')
  })

  it('infers date widget from DateSchema and date formats', () => {
    const EventSchema = s.struct({
      eventDate: s.date(),
      stringDate: s.string().format('date'),
    })

    const fields = fieldsOf(EventSchema)
    expect(fields[0].widget).toBe('date')
    expect(fields[1].widget).toBe('date')
  })

  it('infers number widget with step: 1 for BigIntSchema', () => {
    const BigIntStruct = s.struct({
      credits: s.bigint(),
    })

    const fields = fieldsOf(BigIntStruct)
    expect(fields[0].widget).toBe('number')
    expect(fields[0].widgetProps.step).toBe(1)
  })
})
