import { describe, it, expect } from 'vitest'
import { s, getFormFields, inferWidget } from '../src'

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

    const fields = getFormFields(InventorySchema)
    expect(fields).toHaveLength(1)

    const itemsField = fields[0]
    expect(itemsField.key).toBe('items')
    expect(itemsField.widget).toBe('table')
    expect(itemsField.widgetProps.columns).toEqual([
      { key: 'name', label: 'Item Name', type: 'string' },
      { key: 'quantity', label: 'Qty', type: 'integer' },
      { key: 'price', label: 'Price', type: 'number' },
    ])

    // Nested children descriptors are available
    expect(itemsField.children).toHaveLength(3)
    expect(itemsField.children![0].key).toBe('name')
    expect(itemsField.children![0].path).toBe('items[].name')
    expect(itemsField.children![1].key).toBe('quantity')
    expect(itemsField.children![2].key).toBe('price')
  })

  it('infers list widget for arrays of records', () => {
    const ConfigSchema = s.struct({
      metadataList: s.array(s.record(s.string())),
    })

    const fields = getFormFields(ConfigSchema)
    expect(fields[0].widget).toBe('list')
  })

  it('infers multiselect widget with options for arrays of enums', () => {
    const TaggedSchema = s.struct({
      roles: s.array(s.enum(['admin', 'editor', 'viewer'] as const)),
    })

    const fields = getFormFields(TaggedSchema)
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

    const fields = getFormFields(SimpleSchema)
    expect(fields[0].widget).toBe('tags')
  })

  it('infers password and file widgets from string formats', () => {
    const AccountSchema = s.struct({
      password: s.string().password('Password required'),
      avatar: s.string().file(),
    })

    const fields = getFormFields(AccountSchema)
    expect(fields[0].widget).toBe('password')
    expect(fields[0].widgetProps.type).toBe('password')

    expect(fields[1].widget).toBe('file')
  })

  it('infers date widget from DateSchema and date formats', () => {
    const EventSchema = s.struct({
      eventDate: s.date(),
      stringDate: s.string().format('date'),
    })

    const fields = getFormFields(EventSchema)
    expect(fields[0].widget).toBe('date')
    expect(fields[1].widget).toBe('date')
  })

  it('infers number widget with step: 1 for BigIntSchema', () => {
    const BigIntStruct = s.struct({
      credits: s.bigint(),
    })

    const fields = getFormFields(BigIntStruct)
    expect(fields[0].widget).toBe('number')
    expect(fields[0].widgetProps.step).toBe(1)
  })

  it('honors layout metadata (colSpan, section, group, helpText, hidden, disabled, readonly)', () => {
    const FormLayoutSchema = s.struct({
      firstName: s
        .string()
        .label('First Name')
        .colSpan(6)
        .section('Personal Info')
        .group('name_group')
        .helpText('Enter legal given name'),
      lastName: s
        .string()
        .label('Last Name')
        .colSpan(6)
        .section('Personal Info')
        .group('name_group'),
      internalId: s
        .string()
        .hidden()
        .readonly(),
      role: s
        .string()
        .disabled(),
    })

    const fields = getFormFields(FormLayoutSchema)
    expect(fields[0].key).toBe('firstName')
    expect(fields[0].colSpan).toBe(6)
    expect(fields[0].section).toBe('Personal Info')
    expect(fields[0].group).toBe('name_group')
    expect(fields[0].helpText).toBe('Enter legal given name')

    expect(fields[1].key).toBe('lastName')
    expect(fields[1].colSpan).toBe(6)
    expect(fields[1].section).toBe('Personal Info')

    expect(fields[2].key).toBe('internalId')
    expect(fields[2].hidden).toBe(true)
    expect(fields[2].readonly).toBe(true)

    expect(fields[3].key).toBe('role')
    expect(fields[3].disabled).toBe(true)
  })
})
