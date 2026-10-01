// oxlint-disable typescript/no-explicit-any
import type { BaseSchema } from '../core/base'
import type { TypeDescriptor, TypeKind } from '../types/ast'

export interface AxonPortContract {
  id?: string
  name: string
  dataType: string
  descriptor: TypeDescriptor
  defaultValue?: unknown
  validate: (value: unknown) => boolean
  schema: BaseSchema<any, any>
}

/**
 * Dispatch lookup for Axon data-type identifier generation.
 */
const AXON_DATA_TYPE_DISPATCH: Record<TypeKind, (desc: TypeDescriptor) => string> = {
  string: (desc) => (desc.kind === 'string' && desc.format ? `string:${desc.format}` : 'string'),
  integer: () => 'integer',
  number: () => 'number',
  boolean: () => 'boolean',
  date: () => 'date',
  bigint: () => 'bigint',
  null: () => 'null',
  any: () => 'any',
  struct: (desc) => (desc.kind === 'struct' && desc.name ? `struct:${desc.name}` : 'struct'),
  array: (desc) =>
    desc.kind === 'array' && desc.items ? `array:${getAxonDataType(desc.items)}` : 'array:any',
  tuple: (desc) =>
    `tuple:[${(desc.kind === 'tuple' && desc.items ? desc.items : []).map(getAxonDataType).join(',')}]`,
  record: (desc) =>
    desc.kind === 'record' && desc.values ? `record:${getAxonDataType(desc.values)}` : 'record:any',
  enum: () => 'enum',
  literal: (desc) => `literal:${typeof (desc.kind === 'literal' ? desc.value : undefined)}`,
  union: () => 'union',
}

/**
 * Maps a schema or descriptor to an Axon standard data-type string identifier.
 */
export function getAxonDataType(
  schemaOrDescriptor: BaseSchema<any, any> | TypeDescriptor | undefined | null,
): string {
  if (!schemaOrDescriptor) return 'any'
  const desc: TypeDescriptor =
    'descriptor' in schemaOrDescriptor ? schemaOrDescriptor.descriptor : schemaOrDescriptor

  if (!desc || !desc.kind) return 'any'
  const handler = AXON_DATA_TYPE_DISPATCH[desc.kind]
  return handler ? handler(desc) : 'any'
}

/**
 * Creates an Axon-compatible port definition contract.
 */
export function toAxonPort(
  portName: string,
  schema: BaseSchema<any, any>,
  options: { id?: string } = {},
): AxonPortContract {
  return {
    id: options.id,
    name: portName,
    dataType: getAxonDataType(schema),
    descriptor: schema.descriptor,
    defaultValue: schema.descriptor.default,
    validate: (val: unknown) => schema.safeParse(val).success,
    schema,
  }
}

/**
 * Checks type assignability from an output port (source) to an input port (target).
 * Returns true if data from source can legally flow into target.
 */
export function isAssignable(
  source: BaseSchema<any, any> | TypeDescriptor | null | undefined,
  target: BaseSchema<any, any> | TypeDescriptor | null | undefined,
): boolean {
  if (!source || !target) return false

  const sDesc: TypeDescriptor =
    typeof source === 'object' && 'descriptor' in source
      ? source.descriptor
      : (source as TypeDescriptor)
  const tDesc: TypeDescriptor =
    typeof target === 'object' && 'descriptor' in target
      ? target.descriptor
      : (target as TypeDescriptor)

  if (!sDesc || !tDesc || !sDesc.kind || !tDesc.kind) return false

  // Target is any -> accepts everything
  if (tDesc.kind === 'any') return true

  // Check strict nullability soundness:
  // If source is nullable (and not already the 'null' primitive), decompose into:
  // (1) Target must accept null, AND (2) Non-nullable base source must be assignable to target.
  if (sDesc.nullable && sDesc.kind !== 'null') {
    const targetAcceptsNull =
      !!tDesc.nullable ||
      tDesc.kind === 'null' ||
      (tDesc.kind === 'union' &&
        (tDesc.variants || []).some((v) => isAssignable({ kind: 'null' }, v)))
    if (!targetAcceptsNull) return false

    const nonNullableSource: TypeDescriptor = { ...sDesc, nullable: false }
    return isAssignable(nonNullableSource, target)
  }

  // Check strict optionality soundness:
  // If source is optional, decompose into:
  // (1) Target must accept undefined/optional, AND (2) Required base source must be assignable to target.
  if (sDesc.optional) {
    const targetAcceptsUndefined =
      !!tDesc.optional ||
      (tDesc.kind === 'union' && (tDesc.variants || []).some((v) => !!v.optional))
    if (!targetAcceptsUndefined) return false

    const requiredSource: TypeDescriptor = { ...sDesc, optional: false }
    return isAssignable(requiredSource, target)
  }

  // Source is null primitive
  if (sDesc.kind === 'null') {
    return (
      !!tDesc.nullable ||
      tDesc.kind === 'null' ||
      (tDesc.kind === 'union' &&
        (tDesc.variants || []).some((variant) => isAssignable(sDesc, variant)))
    )
  }

  // Handle Source Union (all source variants must be assignable to target)
  if (sDesc.kind === 'union') {
    const variants = sDesc.variants || []
    return variants.length > 0 && variants.every((variant) => isAssignable(variant, tDesc))
  }

  // Handle Target Union (source must be assignable to at least one target variant)
  if (tDesc.kind === 'union') {
    const variants = tDesc.variants || []
    return variants.some((variant) => isAssignable(sDesc, variant))
  }

  // Literal to Primitive or Literal
  if (sDesc.kind === 'literal') {
    if (tDesc.kind === 'literal') return sDesc.value === tDesc.value
    if (typeof sDesc.value === 'string') return tDesc.kind === 'string'
    if (typeof sDesc.value === 'number')
      return tDesc.kind === 'number' || (Number.isInteger(sDesc.value) && tDesc.kind === 'integer')
    if (typeof sDesc.value === 'boolean') return tDesc.kind === 'boolean'
    if (typeof sDesc.value === 'bigint') return tDesc.kind === 'bigint'
    if ((sDesc.value as unknown) instanceof Date) return tDesc.kind === 'date'
  }

  // Enum to Enum
  if (sDesc.kind === 'enum' && tDesc.kind === 'enum') {
    return (sDesc.values || []).every((v) => (tDesc.values || []).includes(v))
  }

  // Number / Integer subtyping
  if (sDesc.kind === 'integer' && (tDesc.kind === 'number' || tDesc.kind === 'integer')) return true
  if (sDesc.kind === 'number' && tDesc.kind === 'number') return true
  if (sDesc.kind === 'number' && tDesc.kind === 'integer') return false

  // String subtyping
  if (sDesc.kind === 'string' && tDesc.kind === 'string') {
    if (tDesc.format && sDesc.format !== tDesc.format) return false
    return true
  }

  // Boolean subtyping
  if (sDesc.kind === 'boolean' && tDesc.kind === 'boolean') return true

  // Date subtyping
  if (sDesc.kind === 'date' && tDesc.kind === 'date') return true

  // BigInt subtyping
  if (sDesc.kind === 'bigint' && tDesc.kind === 'bigint') return true

  // Array subtyping
  if (sDesc.kind === 'array' && tDesc.kind === 'array') {
    if (!tDesc.items) return true
    if (!sDesc.items) return false
    return isAssignable(sDesc.items, tDesc.items)
  }

  // Tuple to Tuple subtyping
  if (sDesc.kind === 'tuple' && tDesc.kind === 'tuple') {
    const sItems = sDesc.items || []
    const tItems = tDesc.items || []
    if (sItems.length !== tItems.length) return false
    return sItems.every((sItem, idx) => isAssignable(sItem, tItems[idx]))
  }

  // Tuple to Array subtyping: a fixed-length tuple can flow into an array if all elements are assignable
  if (sDesc.kind === 'tuple' && tDesc.kind === 'array') {
    if (!tDesc.items) return true
    const sItems = sDesc.items || []
    return sItems.every((sItem) => isAssignable(sItem, tDesc.items))
  }

  // Record subtyping
  if (sDesc.kind === 'record' && tDesc.kind === 'record') {
    if (!tDesc.values) return true
    if (!sDesc.values) return false
    return isAssignable(sDesc.values, tDesc.values)
  }

  // Struct structural subtyping (source must have all required fields of target, and each must be assignable)
  if (sDesc.kind === 'struct' && tDesc.kind === 'struct') {
    const sFields = sDesc.fields || {}
    const tFields = tDesc.fields || {}

    for (const [key, tField] of Object.entries(tFields)) {
      const sField = sFields[key]
      if (!sField) {
        // If target field is not optional, source must provide it
        if (!tField.optional) return false
        continue
      }
      if (!isAssignable(sField, tField)) return false
    }
    return true
  }

  return false
}
