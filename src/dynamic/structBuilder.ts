import type { BaseSchema } from '../core/base'
import { StructSchema, registerStructBuilderFactory } from '../builders/struct'
import type { StructDescriptor, FieldMetadata } from '../types/ast'
import { s } from '../builders'
import { toJSONSchema } from '../bridges/toJSONSchema'

export interface DynamicFieldOptions {
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  default?: unknown
  metadata?: FieldMetadata
}

/**
 * Mutable schema editor designed for interactive UI Form Builders
 * and dynamic runtime schema composition.
 */
export class StructBuilder {
  public name: string
  public title?: string
  public description?: string
  public fields: Map<string, BaseSchema<any, any>> = new Map()
  public fieldOrder: string[] = []
  public metadata: FieldMetadata = {}

  constructor(name = 'CustomStruct') {
    this.name = name
  }

  public static fromSchema(schema: StructSchema<any>): StructBuilder {
    return schema.toBuilder()
  }

  public static fromJSON(descriptor: StructDescriptor): StructBuilder {
    const schema = s.fromDescriptor(descriptor) as StructSchema<any>
    return StructBuilder.fromSchema(schema)
  }

  public addField(
    name: string,
    schema: BaseSchema<any, any>,
    options: DynamicFieldOptions = {},
  ): this {
    let finalSchema = schema

    if (options.label) finalSchema = finalSchema.label(options.label)
    if (options.description) finalSchema = finalSchema.description(options.description)
    if (options.placeholder) finalSchema = finalSchema.placeholder(options.placeholder)
    if (options.default !== undefined) finalSchema = finalSchema.default(options.default)
    if (options.metadata) finalSchema = finalSchema.meta(options.metadata)
    if (options.required === false) finalSchema = finalSchema.optional()

    this.fields.set(name, finalSchema)
    if (!this.fieldOrder.includes(name)) {
      this.fieldOrder.push(name)
    }
    return this
  }

  public removeField(name: string): this {
    this.fields.delete(name)
    this.fieldOrder = this.fieldOrder.filter((f) => f !== name)
    return this
  }

  public renameField(oldName: string, newName: string): this {
    if (!this.fields.has(oldName) || oldName === newName) return this
    const schema = this.fields.get(oldName)!
    this.fields.delete(oldName)
    this.fields.set(newName, schema)

    const index = this.fieldOrder.indexOf(oldName)
    if (index !== -1) {
      this.fieldOrder[index] = newName
    }
    return this
  }

  public setField(name: string, schema: BaseSchema<any, any>): this {
    this.fields.set(name, schema)
    if (!this.fieldOrder.includes(name)) {
      this.fieldOrder.push(name)
    }
    return this
  }

  public setFieldMetadata(name: string, metadata: FieldMetadata): this {
    const current = this.fields.get(name)
    if (current) {
      this.fields.set(name, current.meta(metadata))
    }
    return this
  }

  public setFieldDefault(name: string, defaultValue: unknown): this {
    const current = this.fields.get(name)
    if (current) {
      this.fields.set(name, current.default(defaultValue as any))
    }
    return this
  }

  public reorderFields(order: string[]): this {
    const validKeys = order.filter((k) => this.fields.has(k))
    const remaining = this.fieldOrder.filter((k) => !validKeys.includes(k))
    this.fieldOrder = [...validKeys, ...remaining]
    return this
  }

  /**
   * Compiles current dynamic state into an immutable, type-checked StructSchema.
   */
  public build(): StructSchema<any> {
    const shape: Record<string, BaseSchema<any, any>> = {}
    for (const key of this.fieldOrder) {
      if (this.fields.has(key)) {
        shape[key] = this.fields.get(key)!
      }
    }

    const struct = s.struct(shape, {
      name: this.name,
      title: this.title,
      description: this.description,
      metadata: this.metadata,
    })

    return struct
  }

  /**
   * Serializes current builder definition to AST JSON descriptor.
   */
  public toJSON(): StructDescriptor {
    return this.build().toJSON() as StructDescriptor
  }

  /**
   * Serializes current builder to standard JSON Schema.
   */
  public toJSONSchema(): Record<string, unknown> {
    return toJSONSchema(this.build().descriptor)
  }
}

registerStructBuilderFactory((schema, name) => {
  const builder = new StructBuilder(name ?? schema.descriptor.name ?? 'CustomStruct')
  builder.title = schema.descriptor.title
  builder.description = schema.descriptor.description
  builder.metadata = { ...schema.descriptor.metadata }

  if (schema.shape) {
    for (const [key, fieldSchema] of Object.entries(schema.shape)) {
      builder.addField(key, fieldSchema as BaseSchema<any, any>)
    }
  }
  return builder
})

