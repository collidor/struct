import type { TypeDescriptor, TypeKind } from '../types/ast'

type DescriptorOfKind<K extends TypeKind> = TypeDescriptor extends infer T
  ? T extends { kind: TypeKind }
    ? K extends T['kind']
      ? T
      : never
    : never
  : never

type DefaultValueHandlers = {
  [K in TypeKind]: (desc: DescriptorOfKind<K>) => unknown
}

/**
 * Dispatch map generating default values based on descriptor kind.
 */
const DEFAULT_VALUE_HANDLERS: DefaultValueHandlers = {
  string: () => '',
  number: (desc) => (desc.min !== undefined && desc.min > 0 ? desc.min : 0),
  integer: (desc) => (desc.min !== undefined && desc.min > 0 ? desc.min : 0),
  boolean: () => false,
  date: () => new Date(),
  bigint: () => 0n,
  null: () => null,
  any: () => undefined,
  struct: (desc) => {
    const result: Record<string, unknown> = {}
    if (desc.fields) {
      for (const [key, fieldDesc] of Object.entries(desc.fields)) {
        const val = generateDefaultValue(fieldDesc)
        if (val !== undefined || !fieldDesc.optional) {
          result[key] = val
        }
      }
    }
    return result
  },
  array: () => [],
  tuple: (desc) => (desc.items ? desc.items.map(generateDefaultValue) : []),
  record: () => ({}),
  enum: (desc) => (desc.values && desc.values.length > 0 ? desc.values[0] : ''),
  literal: (desc) => desc.value,
  union: (desc) =>
    desc.variants && desc.variants.length > 0
      ? generateDefaultValue(desc.variants[0])
      : undefined,
}

/**
 * Generates an initial or fallback default value for a schema descriptor.
 */
export function generateDefaultValue(descriptor: TypeDescriptor): unknown {
  if (descriptor.default !== undefined) {
    try {
      if (typeof descriptor.default === 'function') {
        return (descriptor.default as () => unknown)()
      }
      return structuredClone(descriptor.default)
    } catch {
      return descriptor.default
    }
  }

  if (descriptor.optional) {
    return undefined
  }

  const handler = DEFAULT_VALUE_HANDLERS[descriptor.kind] as (desc: TypeDescriptor) => unknown
  return handler ? handler(descriptor) : undefined
}
