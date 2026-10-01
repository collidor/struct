/**
 * Abstract Syntax Tree (AST) descriptors for serializable schemas.
 */

export type WidgetHint =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'stepper'
  | 'switch'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'color'
  | 'code'
  | 'tags'
  | 'date'
  | 'datetime'
  | 'password'
  | 'file'
  | 'table'
  | 'list'
  | 'custom'
  | (string & {})

export interface FieldMetadata {
  label?: string
  description?: string
  placeholder?: string
  helpText?: string
  widget?: WidgetHint
  widgetProps?: Record<string, unknown>
  order?: number
  colSpan?: number
  group?: string
  section?: string
  hidden?: boolean
  disabled?: boolean
  readonly?: boolean
  badge?: string
  icon?: string
  [key: string]: unknown
}

export type StringFormat =
  | 'email'
  | 'url'
  | 'uuid'
  | 'datetime'
  | 'date'
  | 'password'
  | 'file'
  | 'color'
  | 'json'
  | (string & {})

export interface StringConstraints {
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: StringFormat
  trim?: boolean
  toLowerCase?: boolean
  toUpperCase?: boolean
}

export interface NumberConstraints {
  min?: number
  max?: number
  step?: number
  integer?: boolean
  positive?: boolean
  nonnegative?: boolean
  negative?: boolean
}

export interface ArrayConstraints {
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

export interface StructConstraints {
  strict?: boolean
  passthrough?: boolean
}

export type TypeKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'bigint'
  | 'null'
  | 'any'
  | 'struct'
  | 'array'
  | 'record'
  | 'enum'
  | 'union'
  | 'literal'
  | 'tuple'

export interface BaseDescriptor {
  kind: TypeKind
  id?: string
  name?: string
  title?: string
  description?: string
  metadata?: FieldMetadata
  default?: unknown
  optional?: boolean
  nullable?: boolean
  messages?: Record<string, string>
  coerce?: boolean
}

export interface StringDescriptor extends BaseDescriptor, StringConstraints {
  kind: 'string'
  default?: string
}

export interface NumberDescriptor extends BaseDescriptor, NumberConstraints {
  kind: 'number' | 'integer'
  default?: number
}

export interface BooleanDescriptor extends BaseDescriptor {
  kind: 'boolean'
  default?: boolean
}

export interface DateConstraints {
  min?: Date | string | number
  max?: Date | string | number
}

export interface DateDescriptor extends BaseDescriptor, DateConstraints {
  kind: 'date'
  default?: Date | string | number
}

export interface BigIntConstraints {
  min?: bigint | string | number
  max?: bigint | string | number
  positive?: boolean
  nonnegative?: boolean
  negative?: boolean
}

export interface BigIntDescriptor extends BaseDescriptor, BigIntConstraints {
  kind: 'bigint'
  default?: bigint | string | number
}

export interface NullDescriptor extends BaseDescriptor {
  kind: 'null'
}

export interface AnyDescriptor extends BaseDescriptor {
  kind: 'any'
}

export interface StructDescriptor extends BaseDescriptor, StructConstraints {
  kind: 'struct'
  fields: Record<string, TypeDescriptor>
  default?: Record<string, unknown>
}

export interface ArrayDescriptor extends BaseDescriptor, ArrayConstraints {
  kind: 'array'
  items: TypeDescriptor
  default?: unknown[]
}

export interface RecordDescriptor extends BaseDescriptor {
  kind: 'record'
  values: TypeDescriptor
  keys?: TypeDescriptor
  default?: Record<string, unknown>
}

export interface EnumDescriptor extends BaseDescriptor {
  kind: 'enum'
  values: (string | number)[]
  labels?: Record<string, string>
  default?: string | number
}

export interface LiteralDescriptor extends BaseDescriptor {
  kind: 'literal'
  value: string | number | boolean | null
}

export interface UnionDescriptor extends BaseDescriptor {
  kind: 'union'
  variants: TypeDescriptor[]
  discriminator?: string
}

export interface TupleDescriptor extends BaseDescriptor {
  kind: 'tuple'
  items: TypeDescriptor[]
}

export type TypeDescriptor =
  | StringDescriptor
  | NumberDescriptor
  | BooleanDescriptor
  | DateDescriptor
  | BigIntDescriptor
  | NullDescriptor
  | AnyDescriptor
  | StructDescriptor
  | ArrayDescriptor
  | RecordDescriptor
  | EnumDescriptor
  | LiteralDescriptor
  | UnionDescriptor
  | TupleDescriptor
