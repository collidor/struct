import type {
  TypeDescriptor,
  TypeKind,
  WidgetHint,
  FieldMetadata,
  StringDescriptor,
  NumberDescriptor,
  ArrayDescriptor,
  EnumDescriptor,
} from '../types/ast'
import type { BaseSchema } from '../core/base'

export interface FormFieldDescriptor {
  key: string
  path: string
  label: string
  description?: string
  placeholder?: string
  helpText?: string
  widget: WidgetHint
  widgetProps: Record<string, unknown>
  required: boolean
  nullable: boolean
  defaultValue?: unknown
  type: string
  order: number
  colSpan?: number
  group?: string
  section?: string
  hidden?: boolean
  disabled?: boolean
  readonly?: boolean
  badge?: string
  icon?: string
  children?: FormFieldDescriptor[]
  itemDescriptor?: FormFieldDescriptor
}

function toTitleCase(camelCase: string): string {
  const result = camelCase.replace(/([A-Z])/g, ' $1')
  return result.charAt(0).toUpperCase() + result.slice(1).trim()
}

function inferStringWidget(
  desc: StringDescriptor,
  props: Record<string, unknown>,
): { widget: WidgetHint; props: Record<string, unknown> } {
  if (desc.format === 'email') return { widget: 'text', props: { ...props, type: 'email' } }
  if (desc.format === 'url') return { widget: 'text', props: { ...props, type: 'url' } }
  if (desc.format === 'password')
    return { widget: 'password', props: { ...props, type: 'password' } }
  if (desc.format === 'file') return { widget: 'file', props }
  if (desc.format === 'color') return { widget: 'color', props }
  if (desc.format === 'date') return { widget: 'date', props }
  if (desc.format === 'datetime') return { widget: 'datetime', props }
  if (desc.maxLength && desc.maxLength > 100)
    return { widget: 'textarea', props: { ...props, rows: 4 } }
  return { widget: 'text', props }
}

function inferNumberWidget(
  desc: NumberDescriptor,
  props: Record<string, unknown>,
): { widget: WidgetHint; props: Record<string, unknown> } {
  if (desc.min !== undefined) props.min = desc.min
  if (desc.max !== undefined) props.max = desc.max
  if (desc.step !== undefined) props.step = desc.step
  if (desc.min !== undefined && desc.max !== undefined && desc.max - desc.min <= 100) {
    return { widget: 'slider', props }
  }
  return { widget: desc.kind === 'integer' ? 'stepper' : 'number', props }
}

function formatEnumOptions(
  desc: EnumDescriptor,
): Array<{ value: string | number; label: string }> {
  return desc.values.map((val) => ({
    value: val,
    label: desc.labels?.[String(val)] || toTitleCase(String(val)),
  }))
}

function inferArrayWidget(
  desc: ArrayDescriptor,
  props: Record<string, unknown>,
): { widget: WidgetHint; props: Record<string, unknown> } {
  if (desc.items) {
    // Array of structs -> table widget with columns
    if (desc.items.kind === 'struct') {
      const columns = desc.items.fields
        ? Object.entries(desc.items.fields).map(([k, f]) => ({
            key: k,
            label: f.metadata?.label || f.title || toTitleCase(k),
            type: f.kind,
          }))
        : []
      return { widget: 'table', props: { ...props, columns } }
    }

    // Array of records -> list widget
    if (desc.items.kind === 'record') {
      return { widget: 'list', props }
    }

    // Array of enums -> multiselect widget with options
    if (desc.items.kind === 'enum') {
      const enumDesc = desc.items as EnumDescriptor
      const options = formatEnumOptions(enumDesc)
      return { widget: 'multiselect', props: { ...props, options } }
    }
  }
  return { widget: 'tags', props }
}

type DescriptorOfKind<K extends TypeKind> = TypeDescriptor extends infer T
  ? T extends { kind: TypeKind }
    ? K extends T['kind']
      ? T
      : never
    : never
  : never

type WidgetInferrer<K extends TypeKind> = (
  desc: DescriptorOfKind<K>,
  props: Record<string, unknown>,
) => { widget: WidgetHint; props: Record<string, unknown> }

type WidgetInferrersMap = {
  [K in TypeKind]: WidgetInferrer<K>
}

/**
 * Dispatch map for type-specific widget inference.
 */
const WIDGET_INFERRERS: WidgetInferrersMap = {
  string: inferStringWidget,
  number: inferNumberWidget,
  integer: inferNumberWidget,
  boolean: (_desc, props) => ({ widget: 'switch', props }),
  date: (_desc, props) => ({ widget: 'date', props }),
  bigint: (_desc, props) => ({ widget: 'number', props: { ...props, step: 1 } }),
  enum: (desc: EnumDescriptor, props) => {
    const options = formatEnumOptions(desc)
    return { widget: 'select', props: { ...props, options } }
  },
  array: inferArrayWidget,
  struct: (_desc, props) => ({ widget: 'custom', props }),
  record: (_desc, props) => ({ widget: 'custom', props }),
  tuple: (_desc, props) => ({ widget: 'custom', props }),
  union: (_desc, props) => ({ widget: 'select', props }),
  literal: (_desc, props) => ({ widget: 'text', props }),
  null: (_desc, props) => ({ widget: 'text', props }),
  any: (_desc, props) => ({ widget: 'text', props }),
}

/**
 * Automatically infers the most suitable UI widget hint and props for a field descriptor.
 */
export function inferWidget(desc: TypeDescriptor): {
  widget: WidgetHint
  props: Record<string, unknown>
} {
  const meta = desc.metadata || {}
  const props: Record<string, unknown> = { ...meta.widgetProps }

  if (meta.widget) {
    if (meta.widget === 'password' && !props.type) {
      props.type = 'password'
    }
    return { widget: meta.widget, props }
  }

  const inferrer = WIDGET_INFERRERS[desc.kind] as (
    desc: TypeDescriptor,
    props: Record<string, unknown>,
  ) => { widget: WidgetHint; props: Record<string, unknown> }
  if (inferrer) {
    return inferrer(desc, props)
  }

  return { widget: 'text', props }
}

/**
 * Recursively inspects a StructSchema and produces a tree of FormFieldDescriptors
 * suitable for auto-generating dynamic forms and UIs.
 */
export function getFormFields(
  schemaOrDescriptor: BaseSchema<any, any> | TypeDescriptor,
  parentPath = '',
): FormFieldDescriptor[] {
  const desc: TypeDescriptor =
    'descriptor' in schemaOrDescriptor ? schemaOrDescriptor.descriptor : schemaOrDescriptor

  if (desc.kind !== 'struct' || !desc.fields) {
    return []
  }

  const fields: FormFieldDescriptor[] = []
  let autoOrder = 0

  for (const [key, fieldDesc] of Object.entries(desc.fields)) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    const meta: FieldMetadata = fieldDesc.metadata || {}
    const { widget, props } = inferWidget(fieldDesc)
    const label = meta.label || fieldDesc.title || toTitleCase(key)
    const order = meta.order !== undefined ? meta.order : autoOrder++

    const fieldDescriptor: FormFieldDescriptor = {
      key,
      path: currentPath,
      label,
      description: meta.description || fieldDesc.description,
      placeholder: meta.placeholder,
      helpText: meta.helpText,
      widget,
      widgetProps: props,
      required: !fieldDesc.optional,
      nullable: !!fieldDesc.nullable,
      defaultValue: fieldDesc.default,
      type: fieldDesc.kind,
      order,
      colSpan: meta.colSpan,
      group: meta.group,
      section: meta.section,
      hidden: meta.hidden,
      disabled: meta.disabled,
      readonly: meta.readonly,
      badge: meta.badge,
      icon: meta.icon,
    }

    if (fieldDesc.kind === 'struct' && fieldDesc.fields) {
      fieldDescriptor.children = getFormFields(fieldDesc, currentPath)
    }

    if (fieldDesc.kind === 'array' && fieldDesc.items) {
      const itemDesc = fieldDesc.items
      const itemWidgetInfo = inferWidget(itemDesc)
      fieldDescriptor.itemDescriptor = {
        key: `${key}Item`,
        path: `${currentPath}[]`,
        label: itemDesc.metadata?.label || `${label} Item`,
        widget: itemWidgetInfo.widget,
        widgetProps: itemWidgetInfo.props,
        required: !itemDesc.optional,
        nullable: !!itemDesc.nullable,
        type: itemDesc.kind,
        order: 0,
      }

      // If array items are structs, expose children for table column/row inspection
      if (itemDesc.kind === 'struct' && itemDesc.fields) {
        fieldDescriptor.children = getFormFields(itemDesc, `${currentPath}[]`)
      } else if (itemDesc.kind === 'record' && itemDesc.values) {
        // Expose nested children for record item value inspection
        const valDesc = itemDesc.values
        const valWidget = inferWidget(valDesc)
        fieldDescriptor.children = [
          {
            key: 'value',
            path: `${currentPath}[].value`,
            label: valDesc.metadata?.label || 'Value',
            widget: valWidget.widget,
            widgetProps: valWidget.props,
            required: !valDesc.optional,
            nullable: !!valDesc.nullable,
            type: valDesc.kind,
            order: 0,
            ...(valDesc.kind === 'struct' && valDesc.fields
              ? { children: getFormFields(valDesc, `${currentPath}[].value`) }
              : {}),
          },
        ]
      }
    }

    fields.push(fieldDescriptor)
  }

  return fields.sort((a, b) => a.order - b.order)
}
