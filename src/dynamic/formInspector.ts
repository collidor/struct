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
  return { widget: 'text', props }
}

function inferNumberWidget(
  desc: NumberDescriptor,
  props: Record<string, unknown>,
): { widget: WidgetHint; props: Record<string, unknown> } {
  if (desc.min !== undefined) props.min = desc.min
  if (desc.max !== undefined) props.max = desc.max
  if (desc.step !== undefined) props.step = desc.step
  return { widget: 'number', props }
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
    if (desc.kind === 'number' || desc.kind === 'integer') {
      const numDesc = desc as NumberDescriptor
      if (numDesc.min !== undefined && props.min === undefined) props.min = numDesc.min
      if (numDesc.max !== undefined && props.max === undefined) props.max = numDesc.max
      if (numDesc.step !== undefined && props.step === undefined) props.step = numDesc.step
    }
    // A named widget (every EnumSchema names 'select') still needs the values to choose from.
    if (desc.kind === 'enum' && props.options === undefined) {
      props.options = formatEnumOptions(desc as EnumDescriptor)
    }
    if (desc.kind === 'array' && desc.items?.kind === 'enum' && props.options === undefined) {
      props.options = formatEnumOptions(desc.items as EnumDescriptor)
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
