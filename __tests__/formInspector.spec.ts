import { describe, it, expect } from 'vitest'
import { fieldsOf } from './support/fields'
import { s, inferWidget } from '../src'
import { f } from '../src/form'

describe('Form Inspector & UI Widget Inference', () => {
  it('infers widgets correctly based on type and constraints', () => {
    expect(inferWidget(s.string().descriptor).widget).toBe('text')
    expect(inferWidget(s.string().format('color').descriptor).widget).toBe('color')
    // Long strings no longer imply a textarea; it must be requested explicitly.
    expect(inferWidget(s.string().max(200).descriptor).widget).toBe('text')
    expect(
      f
        .struct({ bio: f.field(s.string().max(200), { widget: f.textarea().rows(4) }) })
        .toFormTree({}).fieldsByKey.bio?.widget,
    ).toBe('textarea')
    expect(inferWidget(s.number().min(0).max(100).descriptor).widget).toBe('number')
    const levels = f
      .struct({
        range: f.field(s.number().min(0).max(100), { widget: f.range() }),
        slider: f.field(s.number().min(0).max(100), { widget: f.slider() }),
      })
      .toFormTree({}).fieldsByKey
    expect(levels.range?.widget).toBe('range')
    expect(levels.slider?.widget).toBe('slider')
    expect(levels.slider?.widgetProps).toMatchObject({ min: 0, max: 100 })
    expect(
      inferWidget(s.number().integer().min(18).max(120).describe('User age').descriptor).widget
    ).toBe('number')
    expect(inferWidget(s.boolean().descriptor).widget).toBe('switch')
    expect(inferWidget(s.enum(['a', 'b']).descriptor).widget).toBe('select')
  })

  it('describes a plain schema as a hierarchy of form fields', () => {
    const CharacterForm = s.struct({
      heroName: s.string().min(1).label('Hero Name').meta({ placeholder: 'Enter hero name...' }),
      level: s.integer().min(1).max(20).default(1),
      isAlive: s.boolean().default(true).label('Alive'),
      alignment: s.enum(['lawful', 'neutral', 'chaotic']).labels({
        lawful: 'Lawful Good',
        neutral: 'True Neutral',
        chaotic: 'Chaotic Evil',
      }),
      attributes: s.struct({
        strength: s.integer().min(1).max(30).default(10).label('Strength'),
        agility: s.integer().min(1).max(30).default(10).label('Agility'),
      }),
    })

    const fields = fieldsOf(CharacterForm)

    expect(fields.length).toBe(5)

    const heroField = fields.find((f) => f.key === 'heroName')!
    expect(heroField.label).toBe('Hero Name')
    expect(heroField.placeholder).toBe('Enter hero name...')
    expect(heroField.required).toBe(true)

    const alignField = fields.find((f) => f.key === 'alignment')!
    expect(alignField.widget).toBe('select')
    expect(alignField.widgetProps.options).toEqual([
      { value: 'lawful', label: 'Lawful Good' },
      { value: 'neutral', label: 'True Neutral' },
      { value: 'chaotic', label: 'Chaotic Evil' },
    ])

    const attrField = fields.find((f) => f.key === 'attributes')!
    expect(attrField.children).toBeDefined()
    expect(attrField.children!.length).toBe(2)
    expect(attrField.children?.[0]?.path).toBe('attributes.strength')
  })
})
