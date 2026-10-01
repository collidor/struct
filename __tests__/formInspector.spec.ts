import { describe, it, expect } from 'vitest'
import { s, getFormFields, inferWidget } from '../src'

describe('Form Inspector & UI Widget Inference', () => {
  it('infers widgets correctly based on type and constraints', () => {
    expect(inferWidget(s.string().descriptor).widget).toBe('text')
    expect(inferWidget(s.string().format('color').descriptor).widget).toBe('color')
    expect(inferWidget(s.string().max(200).descriptor).widget).toBe('textarea')
    expect(inferWidget(s.number().min(0).max(100).descriptor).widget).toBe('slider')
    expect(inferWidget(s.integer().descriptor).widget).toBe('stepper')
    expect(inferWidget(s.boolean().descriptor).widget).toBe('switch')
    expect(inferWidget(s.enum(['a', 'b']).descriptor).widget).toBe('select')
  })

  it('extracts structured FormFieldDescriptor hierarchy from struct schemas', () => {
    const CharacterForm = s.struct({
      heroName: s.string().min(1).label('Hero Name').placeholder('Enter hero name...'),
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

    const fields = getFormFields(CharacterForm)

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
