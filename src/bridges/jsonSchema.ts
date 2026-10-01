// oxlint-disable typescript/no-explicit-any
import type { StringFormat } from '../types/ast'
import type { BaseSchema } from '../core/base'
import {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  NullSchema,
  AnySchema,
} from '../builders/primitives'
import { StructSchema } from '../builders/struct'
import { ArraySchema } from '../builders/array'
import { RecordSchema } from '../builders/record'
import { EnumSchema, LiteralSchema } from '../builders/enum'
import { UnionSchema, TupleSchema } from '../builders/union'

export { toJSONSchema } from './toJSONSchema'

/**
 * Dispatch map converting JSON Schema primary types to Struct BaseSchema instances.
 */
const FROM_JSON_SCHEMA_TYPE_HANDLERS: Record<
  string,
  (jsonSchema: Record<string, unknown>) => BaseSchema<any, any>
> = {
  string: (jsonSchema) => {
    let strBuilder = new StringSchema()
    if (typeof jsonSchema.minLength === 'number')
      strBuilder = strBuilder.min(jsonSchema.minLength)
    if (typeof jsonSchema.maxLength === 'number')
      strBuilder = strBuilder.max(jsonSchema.maxLength)
    if (typeof jsonSchema.pattern === 'string')
      strBuilder = strBuilder.regex(new RegExp(jsonSchema.pattern))
    if (typeof jsonSchema.format === 'string')
      strBuilder = strBuilder.format(jsonSchema.format as StringFormat)
    return strBuilder
  },

  number: (jsonSchema) => {
    let numBuilder = new NumberSchema()
    if (typeof jsonSchema.minimum === 'number') numBuilder = numBuilder.min(jsonSchema.minimum)
    if (typeof jsonSchema.maximum === 'number') numBuilder = numBuilder.max(jsonSchema.maximum)
    if (typeof jsonSchema.multipleOf === 'number')
      numBuilder = numBuilder.step(jsonSchema.multipleOf)
    return numBuilder
  },

  integer: (jsonSchema) => {
    let intBuilder = new NumberSchema({ integer: true, kind: 'integer' })
    if (typeof jsonSchema.minimum === 'number') intBuilder = intBuilder.min(jsonSchema.minimum)
    if (typeof jsonSchema.maximum === 'number') intBuilder = intBuilder.max(jsonSchema.maximum)
    if (typeof jsonSchema.multipleOf === 'number')
      intBuilder = intBuilder.step(jsonSchema.multipleOf)
    return intBuilder
  },

  boolean: () => new BooleanSchema(),

  null: () => new NullSchema(),

  array: (jsonSchema) => {
    if (Array.isArray(jsonSchema.items)) {
      return new TupleSchema(jsonSchema.items.map(fromJSONSchema))
    }
    if (jsonSchema.items && typeof jsonSchema.items === 'object') {
      let arrBuilder = new ArraySchema(fromJSONSchema(jsonSchema.items as Record<string, unknown>))
      if (typeof jsonSchema.minItems === 'number')
        arrBuilder = arrBuilder.min(jsonSchema.minItems)
      if (typeof jsonSchema.maxItems === 'number')
        arrBuilder = arrBuilder.max(jsonSchema.maxItems)
      return arrBuilder
    }
    return new ArraySchema(new AnySchema())
  },

  object: (jsonSchema) => {
    if (jsonSchema.properties && typeof jsonSchema.properties === 'object') {
      const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : []
      const fields: Record<string, BaseSchema<any, any>> = {}

      for (const [key, propSchema] of Object.entries(
        jsonSchema.properties as Record<string, Record<string, unknown>>,
      )) {
        let field = fromJSONSchema(propSchema)
        if (!required.includes(key)) {
          field = field.optional()
        }
        fields[key] = field
      }

      let structBuilder = new StructSchema(fields)
      if (jsonSchema.additionalProperties === false) {
        structBuilder = structBuilder.strict()
      }
      return structBuilder
    }
    if (
      jsonSchema.additionalProperties &&
      typeof jsonSchema.additionalProperties === 'object'
    ) {
      return new RecordSchema(
        fromJSONSchema(jsonSchema.additionalProperties as Record<string, unknown>),
      )
    }
    return new AnySchema()
  },
}

export function fromJSONSchema(jsonSchema: Record<string, unknown>): BaseSchema<any, any> {
  const type = jsonSchema.type
  const xUi = (jsonSchema['x-ui'] || jsonSchema.metadata || {}) as Record<string, unknown>
  const title = (jsonSchema.title || xUi.label) as string | undefined
  const description = (jsonSchema.description || xUi.description) as string | undefined
  const isNullable = Array.isArray(type) ? type.includes('null') : type === 'null'

  let schema: BaseSchema<any, any>

  // Handle const / literal
  if ('const' in jsonSchema) {
    schema = new LiteralSchema(jsonSchema.const as string | number | boolean | null)
  }
  // Handle enum
  else if (Array.isArray(jsonSchema.enum)) {
    schema = new EnumSchema(jsonSchema.enum as [string | number, ...(string | number)[]])
  }
  // Handle union (anyOf / oneOf)
  else if (Array.isArray(jsonSchema.oneOf) || Array.isArray(jsonSchema.anyOf)) {
    const variants = (jsonSchema.oneOf || jsonSchema.anyOf) as Record<string, unknown>[]
    schema = new UnionSchema(variants.map(fromJSONSchema))
  }
  // Handle primitives and structures based on type
  else {
    const primaryType = (
      Array.isArray(type) ? type.find((t) => t !== 'null') : type
    ) as string | undefined

    const handler = (primaryType && FROM_JSON_SCHEMA_TYPE_HANDLERS[primaryType]) || FROM_JSON_SCHEMA_TYPE_HANDLERS.object
    schema = handler(jsonSchema)
  }

  if (title) schema = schema.label(title)
  if (description) schema = schema.description(description)
  if (jsonSchema.default !== undefined) schema = schema.default(jsonSchema.default)
  if (Object.keys(xUi).length > 0) schema = schema.meta(xUi)
  if (isNullable && schema.descriptor.kind !== 'null') schema = schema.nullable()

  return schema
}
