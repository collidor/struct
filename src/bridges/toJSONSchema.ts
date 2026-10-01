import type { BaseSchema } from '../core/base'
import type {
  TypeDescriptor,
  TypeKind,
  StringDescriptor,
  NumberDescriptor,
  StructDescriptor,
  ArrayDescriptor,
  RecordDescriptor,
  EnumDescriptor,
  LiteralDescriptor,
  UnionDescriptor,
  TupleDescriptor,
} from '../types/ast'

type DescriptorOfKind<K extends TypeKind> = TypeDescriptor extends infer T
  ? T extends { kind: TypeKind }
    ? K extends T['kind']
      ? T
      : never
    : never
  : never

type ToJSONSchemaHandlers = {
  [K in TypeKind]: (descriptor: DescriptorOfKind<K>, result: Record<string, unknown>) => void
}

/**
 * Dispatch map converting TypeDescriptors to JSON Schema representations.
 */
function applyJSONSchemaNumberBounds(desc: NumberDescriptor, result: Record<string, unknown>) {
  if (desc.min !== undefined) result.minimum = desc.min
  if (desc.max !== undefined) result.maximum = desc.max
  if (desc.step !== undefined) result.multipleOf = desc.step
}

const TO_JSON_SCHEMA_HANDLERS: ToJSONSchemaHandlers = {
  string: (desc: StringDescriptor, result) => {
    result.type = desc.nullable ? ['string', 'null'] : 'string'
    if (desc.minLength !== undefined) result.minLength = desc.minLength
    if (desc.maxLength !== undefined) result.maxLength = desc.maxLength
    if (desc.pattern !== undefined) result.pattern = desc.pattern
    if (desc.format !== undefined) result.format = desc.format
  },

  number: (desc: NumberDescriptor, result) => {
    result.type = desc.nullable ? ['number', 'null'] : 'number'
    applyJSONSchemaNumberBounds(desc, result)
  },

  integer: (desc: NumberDescriptor, result) => {
    result.type = desc.nullable ? ['integer', 'null'] : 'integer'
    applyJSONSchemaNumberBounds(desc, result)
  },

  boolean: (desc, result) => {
    result.type = desc.nullable ? ['boolean', 'null'] : 'boolean'
  },

  date: (desc, result) => {
    result.type = desc.nullable ? ['string', 'null'] : 'string'
    result.format = 'date-time'
  },

  bigint: (desc, result) => {
    result.type = desc.nullable ? ['integer', 'null'] : 'integer'
    result.format = 'int64'
  },

  null: (_desc, result) => {
    result.type = 'null'
  },

  any: () => {
    // Empty object represents any in JSON Schema
  },

  struct: (desc: StructDescriptor, result) => {
    result.type = desc.nullable ? ['object', 'null'] : 'object'
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    if (desc.fields) {
      for (const [key, fieldDesc] of Object.entries(desc.fields)) {
        properties[key] = toJSONSchema(fieldDesc)
        if (!fieldDesc.optional) {
          required.push(key)
        }
      }
    }

    result.properties = properties
    if (required.length > 0) {
      result.required = required
    }
    if (desc.strict) {
      result.additionalProperties = false
    }
  },

  array: (desc: ArrayDescriptor, result) => {
    result.type = desc.nullable ? ['array', 'null'] : 'array'
    result.items = toJSONSchema(desc.items)
    if (desc.minItems !== undefined) result.minItems = desc.minItems
    if (desc.maxItems !== undefined) result.maxItems = desc.maxItems
    if (desc.uniqueItems !== undefined) result.uniqueItems = desc.uniqueItems
  },

  record: (desc: RecordDescriptor, result) => {
    result.type = desc.nullable ? ['object', 'null'] : 'object'
    result.additionalProperties = toJSONSchema(desc.values)
  },

  enum: (desc: EnumDescriptor, result) => {
    result.enum = desc.values
    if (desc.values.length > 0) {
      const first = desc.values[0]
      result.type = typeof first === 'number' ? 'number' : 'string'
    }
  },

  literal: (desc: LiteralDescriptor, result) => {
    result.const = desc.value
  },

  union: (desc: UnionDescriptor, result) => {
    result.oneOf = desc.variants.map(toJSONSchema)
  },

  tuple: (desc: TupleDescriptor, result) => {
    result.type = desc.nullable ? ['array', 'null'] : 'array'
    result.items = desc.items.map(toJSONSchema)
    result.minItems = desc.items.length
    result.maxItems = desc.items.length
  },
}

export function toJSONSchema(
  schemaOrDescriptor: BaseSchema<any, any> | TypeDescriptor,
): Record<string, unknown> {
  const descriptor: TypeDescriptor =
    typeof schemaOrDescriptor === 'object' &&
    schemaOrDescriptor !== null &&
    'descriptor' in schemaOrDescriptor
      ? (schemaOrDescriptor as BaseSchema<any, any>).descriptor
      : (schemaOrDescriptor as TypeDescriptor)

  const result: Record<string, unknown> = {}

  if (descriptor.title || descriptor.metadata?.label) {
    result.title = descriptor.title || descriptor.metadata?.label
  }
  if (descriptor.description) {
    result.description = descriptor.description
  }
  if (descriptor.default !== undefined && typeof descriptor.default !== 'function') {
    result.default = descriptor.default
  }
  if (descriptor.metadata) {
    result['x-ui'] = descriptor.metadata
  }

  const handler = TO_JSON_SCHEMA_HANDLERS[descriptor.kind] as (
    descriptor: TypeDescriptor,
    result: Record<string, unknown>,
  ) => void
  if (handler) {
    handler(descriptor, result)
  }

  return result
}
