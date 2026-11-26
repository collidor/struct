// oxlint-disable typescript/no-explicit-any
import type { StructDescriptor, TypeDescriptor } from '../types/ast'
import { inferWidget } from '../dynamic/formInspector'
import type { FormFieldOptions } from './field'
import type { FormFieldNode, FormNode, FormNodeTree } from './types'
import { indexFieldNodes } from './relative'
import {
  normalizeHttpConfig,
  normalizePaginationConfig,
  normalizeProviderConfig,
  normalizeVirtualConfig,
} from './utils/dataSource'

/**
 * Fills in what a data source leaves unsaid (HTTP method) and works out `dependsOn` from the
 * `$values.x` tokens in its url, query, body and params.
 */
function normalizeDataSource(source: FormFieldOptions['dataSource']): FormFieldNode['dataSource'] {
  if (source?.type === 'http') {
    const { type: _type, ...rest } = source
    return normalizeHttpConfig(rest)
  }
  if (source?.type === 'provider') {
    const { type: _type, key, ...rest } = source
    return normalizeProviderConfig(key, rest)
  }
  return source
}

export interface CreateFieldNodeInput {
  key: string
  path: string
  descriptor: TypeDescriptor
  /** Presentation chosen for this field with `f.field`. */
  options?: FormFieldOptions
  /**
   * Use widget hints carried by the descriptor itself. A struct schema takes its presentation from
   * `f.field`, so it ignores them; a descriptor that arrives as plain JSON has nowhere else to say.
   */
  honorDescriptorHints?: boolean
}

/**
 * The one place a data field becomes a form field: which widget, with what props, and the
 * display settings around it. The form tree and descriptor-only forms both build fields here.
 */
export function createFieldNode({
  key,
  path,
  descriptor,
  options,
  honorDescriptorHints = false,
}: CreateFieldNodeInput): FormFieldNode {
  const meta = descriptor.metadata || {}
  const inferred = inferWidget(
    honorDescriptorHints ? descriptor : { ...descriptor, metadata: { ...meta, widget: undefined, widgetProps: undefined } },
  )
  const widget = options?.widget?.kind ?? inferred.widget
  const props = options?.widget
    ? {
        // a chosen widget still needs the schema's bounds and options
        ...(['number', 'integer', 'enum', 'array'].includes(descriptor.kind) ? inferred.props : {}),
        ...options.widget.props,
      }
    : inferred.props

  const dataSource = normalizeDataSource(options?.dataSource)

  return {
    kind: 'field',
    id: path,
    key,
    path,
    label: options?.label ?? meta.label ?? descriptor.title ?? key,
    description: options?.description ?? meta.description ?? descriptor.description,
    placeholder: options?.placeholder ?? (typeof meta.placeholder === 'string' ? meta.placeholder : undefined),
    helpText: options?.helpText,
    widget,
    widgetProps: props,
    options: props.options as FormFieldNode['options'],
    required: !descriptor.optional && descriptor.default === undefined,
    disabled: options?.disabled ?? false,
    readonly: options?.readonly ?? false,
    hidden: options?.hidden ?? false,
    colSpan: options?.colSpan,
    defaultValue: descriptor.default,
    type: descriptor.kind,
    descriptor,
    dataSource,
    virtual: options?.virtual === undefined ? undefined : normalizeVirtualConfig(options.virtual),
    pagination: options?.pagination === undefined ? undefined : normalizePaginationConfig(options.pagination),
    dependsOn: dataSource?.dependsOn,
  }
}

/** Fields for a plain descriptor: nested objects get `children`, lists of objects get a row template. */
export function descriptorFieldNodes(fields: Record<string, TypeDescriptor>, parentPath = ''): FormFieldNode[] {
  return Object.entries(fields).map(([key, descriptor]) =>
    descriptorFieldNode(key, descriptor, parentPath ? `${parentPath}.${key}` : key),
  )
}

function descriptorFieldNode(key: string, descriptor: TypeDescriptor, path: string): FormFieldNode {
  const node = createFieldNode({ key, path, descriptor, honorDescriptorHints: true })
  fill(node, descriptor, path)
  return node
}

function fill(node: FormFieldNode, descriptor: TypeDescriptor, path: string): void {
  if (descriptor.kind === 'struct' && (descriptor as StructDescriptor).fields) {
    node.children = descriptorFieldNodes((descriptor as StructDescriptor).fields!, path)
  } else if (descriptor.kind === 'array' && (descriptor as any).items) {
    const itemPath = `${path}[]`
    const item = createFieldNode({ key: '$item', path: itemPath, descriptor: (descriptor as any).items, honorDescriptorHints: true })
    fill(item, (descriptor as any).items, itemPath)
    node.item = item
  }
}

/**
 * The form tree for a plain descriptor, which has no layout, conditions or presentation of its own.
 * Use a form struct (`f.struct`) when you need those.
 */
export function descriptorToFormTree(descriptor: StructDescriptor): FormNodeTree {
  const nodes: FormNode[] = descriptor.fields ? descriptorFieldNodes(descriptor.fields) : []
  return { nodes, fieldsByKey: indexFieldNodes(nodes) }
}
