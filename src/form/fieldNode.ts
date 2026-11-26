// oxlint-disable typescript/no-explicit-any
import type { StructDescriptor, TypeDescriptor } from '../types/ast'
import { inferWidget } from '../dynamic/formInspector'
import type { FormFieldOptions } from './field'
import type { FormContext, FormFieldNode, FormNode, FormNodeTree } from './types'
import { evaluateCondition } from './nodes/conditional'
import { evaluateExpression } from '../computed/astEvaluator'
import { resolveOptions } from './options'
import { indexFieldNodes } from './relative'
import type { FormCondition } from './types'
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
  /** Where the field sits in the form's values, so the reactive options can be evaluated. */
  context?: FormContext
}

/** The value a `derive` option gives, from an expression or a function. */
export function evaluateDerive(
  derive: NonNullable<FormFieldOptions['derive']>,
  values: Record<string, unknown>,
  context?: FormContext,
): unknown {
  try {
    if (typeof derive === 'function') return derive(values, context)
    return evaluateExpression(derive, context?.scope ? context.scope.context() : values)
  } catch {
    return undefined
  }
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
  context,
}: CreateFieldNodeInput): FormFieldNode {
  const meta = descriptor.metadata || {}
  const inferred = inferWidget(
    honorDescriptorHints ? descriptor : { ...descriptor, metadata: { ...meta, widget: undefined, widgetProps: undefined } },
  )
  const widget = options?.widget?.kind ?? inferred.widget
  const props = options?.widget
    ? {
        // a chosen widget still needs the schema's bounds, options and value type
        ...(['number', 'integer', 'enum', 'array', 'record'].includes(descriptor.kind) ? inferred.props : {}),
        ...options.widget.props,
      }
    : inferred.props

  const dataSource = normalizeDataSource(options?.dataSource)

  // Reactive options need the values; a descriptor-only tree has none and keeps the static settings.
  const holds = (condition: FormCondition | undefined): boolean | undefined =>
    condition === undefined || !context ? undefined : evaluateCondition(condition, context.values, context)
  const derived = options?.derive !== undefined && context ? evaluateDerive(options.derive, context.values, context) : undefined
  const choices = options?.options !== undefined && context ? resolveOptions(options.options, context.values, context) : undefined
  const requiredNow = holds(options?.requiredWhen)
  // A descriptor that arrives as plain JSON carries its display settings in `metadata`; a form
  // struct takes them from `f.field` instead.
  const hint = <T>(key: string, kind: 'boolean' | 'number' | 'string'): T | undefined =>
    honorDescriptorHints && typeof meta[key] === kind ? (meta[key] as T) : undefined
  const isHidden = (options?.hidden ?? hint<boolean>('hidden', 'boolean') ?? false) || (holds(options?.hiddenWhen) ?? false)

  return {
    kind: 'field',
    id: path,
    key,
    path,
    label: options?.label ?? meta.label ?? descriptor.title ?? key,
    description: options?.description ?? meta.description ?? descriptor.description,
    placeholder: options?.placeholder ?? (typeof meta.placeholder === 'string' ? meta.placeholder : undefined),
    helpText: options?.helpText ?? hint<string>('helpText', 'string'),
    widget,
    widgetProps: props,
    options: choices ?? (props.options as FormFieldNode['options']),
    // a hidden field is never required: validation leaves it alone
    required: isHidden
      ? false
      : (requiredNow ?? (options?.derive === undefined && !descriptor.optional && descriptor.default === undefined)),
    disabled: (options?.disabled ?? hint<boolean>('disabled', 'boolean') ?? false) || (holds(options?.disabledWhen) ?? false),
    // a computed value is shown, not edited
    readonly:
      (options?.readonly ?? hint<boolean>('readonly', 'boolean') ?? false) ||
      (holds(options?.readonlyWhen) ?? false) ||
      options?.derive !== undefined,
    hidden: isHidden,
    ...(options?.derive !== undefined ? { derivedValue: derived } : {}),
    colSpan: options?.colSpan ?? hint<number>('colSpan', 'number'),
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
