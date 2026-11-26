// oxlint-disable typescript/no-explicit-any
import type { BaseSchema } from '../core/base'
import type { TypeDescriptor } from '../types/ast'
import type { Infer, InferInput, Prettify } from '../types/inference'
import type { FormField } from './field'
import type { PathScope } from './paths'

/**
 * Union to intersection helper.
 */
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

// ---------------------------------------------------------------------------
// Node Kinds
// ---------------------------------------------------------------------------

export type UIOnlyNodeKind =
  | 'heading'
  | 'text'
  | 'divider'
  | 'spacer'
  | 'alert'
  | 'button'
  | 'computedDisplay'
  | 'slot'

export type LayoutContainerKind =
  | 'row'
  | 'grid'
  | 'section'
  | 'tabs'
  | 'accordion'
  | 'split'
  | 'steps'

// ---------------------------------------------------------------------------
// Markers & Descriptors
// ---------------------------------------------------------------------------

export interface UIOnlyDescriptor {
  kind: UIOnlyNodeKind
  title?: string
  content?: string
  level?: number
  tone?: 'info' | 'warning' | 'error' | 'success' | 'neutral'
  action?: string | ((ctx: FormContext) => void | Promise<void>)
  variant?: string
  formula?: string
  computedFn?: (values: Record<string, unknown>, ctx?: FormContext) => unknown
  slotName?: string
  size?: number | string
  options?: Record<string, unknown>
}

export interface UIOnlyMarker {
  readonly __formKind: 'ui_only'
  readonly uiKind: UIOnlyNodeKind
  readonly descriptor: UIOnlyDescriptor
}

export interface LayoutContainerOptions {
  label?: string
  title?: string
  description?: string
  spans?: Record<string, number | string>
  columns?: number | string
  gap?: string
  align?: string
  ratio?: [number, number]
  orientation?: 'horizontal' | 'vertical'
  /** Accordion: whether its panels start open. A panel's own `defaultOpen` wins. */
  defaultOpen?: boolean
  /** Tabs: the key of the tab shown first (the first tab when omitted). */
  defaultTab?: string
  /** Steps: check a step before moving past it (default true). */
  validateOnNext?: boolean
}

export interface LayoutContainerMarker<TShape = Record<string, any>> {
  readonly __formKind: 'layout_container'
  readonly layoutKind: LayoutContainerKind
  readonly shape: TShape
  readonly options?: LayoutContainerOptions
}

export type FormConditionRule =
  | {
      field: string
      op?:
        | '>'
        | '>='
        | '<'
        | '<='
        | '=='
        | '!='
        | 'contains'
        | 'not_contains'
        | 'in'
        | 'not_in'
        | 'startsWith'
        | 'endsWith'
        | 'isEmpty'
        | 'isNotEmpty'
      value?: unknown
    }
  | { and: FormCondition[] }
  | { or: FormCondition[] }
  | { not: FormCondition }

export type FormConditionFn = (
  values: Record<string, unknown>,
  ctx?: FormContext,
) => boolean

export type FormCondition = string | boolean | FormConditionRule | FormConditionFn

export interface ConditionalOptions {
  /**
   * Keep the values of the branch that is not active in the parsed output. They are not validated
   * (they may be stale), only carried along; by default they are dropped.
   */
  keepHidden?: boolean
}

export interface ConditionalMarker<TBranch = Record<string, any>, TElse = Record<string, any> | undefined> {
  readonly __formKind: 'conditional'
  readonly condition: FormCondition
  readonly branch: TBranch
  readonly elseBranch?: TElse
  readonly options?: ConditionalOptions
}

// ---------------------------------------------------------------------------
// Type-Level Inference: Stripping UI-only & Flattening Layouts
// ---------------------------------------------------------------------------

export type InferFormOutput<TShape> = Prettify<
  UnionToIntersection<
    {
      [K in keyof TShape]: TShape[K] extends UIOnlyMarker
        ? {}
        : TShape[K] extends LayoutContainerMarker<infer Inner>
          ? InferFormOutput<Inner>
          : TShape[K] extends ConditionalMarker<infer Inner, infer Else>
            ? Else extends Record<string, any>
              ? Partial<InferFormOutput<Inner>> & Partial<InferFormOutput<Else>>
              : Partial<InferFormOutput<Inner>>
            : TShape[K] extends FormField<infer S, any>
              ? S extends BaseSchema<any, infer O>
                ? undefined extends O ? { [P in K]?: O } : { [P in K]: O }
                : {}
              : TShape[K] extends BaseSchema<any, infer O>
                ? undefined extends O ? { [P in K]?: O } : { [P in K]: O }
                : {}
    }[keyof TShape]
  >
>

export type InferFormInput<TShape> = Prettify<
  UnionToIntersection<
    {
      [K in keyof TShape]: TShape[K] extends UIOnlyMarker
        ? {}
        : TShape[K] extends LayoutContainerMarker<infer Inner>
          ? InferFormInput<Inner>
          : TShape[K] extends ConditionalMarker<infer Inner, infer Else>
            ? Else extends Record<string, any>
              ? Partial<InferFormInput<Inner>> & Partial<InferFormInput<Else>>
              : Partial<InferFormInput<Inner>>
            : TShape[K] extends FormField<infer S, any>
              ? S extends BaseSchema<infer I, any>
                ? undefined extends I ? { [P in K]?: I } : { [P in K]: I }
                : {}
              : TShape[K] extends BaseSchema<infer I, any>
                ? undefined extends I ? { [P in K]?: I } : { [P in K]: I }
                : {}
    }[keyof TShape]
  >
>

// ---------------------------------------------------------------------------
// Collection View Configurations
// ---------------------------------------------------------------------------

export interface TableColumnConfig {
  key: string
  label?: string
  width?: string | number
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  widget?: string
  widgetProps?: Record<string, unknown>
  computed?: string | ((row: Record<string, unknown>) => unknown)
}

export interface TableFooterAggregation {
  column: string
  op: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'custom'
  fn?: (values: unknown[]) => unknown
  label?: string
}

import type {
  HttpDataSourceConfig,
  ProviderDataSourceConfig,
  DataSourceConfig,
  VirtualScrollConfig,
  AsyncPaginationConfig,
} from '../types/ast'

export type {
  HttpDataSourceConfig,
  ProviderDataSourceConfig,
  DataSourceConfig,
  VirtualScrollConfig,
  AsyncPaginationConfig,
}

export interface TableViewConfig {
  columns?: TableColumnConfig[]
  sortable?: boolean
  reorderable?: boolean
  inlineEdit?: boolean
  paginate?: boolean
  pageSize?: number
  virtual?: VirtualScrollConfig | boolean
  aggregations?: TableFooterAggregation[]
  allowAdd?: boolean
  allowRemove?: boolean
  addLabel?: string
}

export interface ListViewConfig {
  itemTitle?: string | ((item: Record<string, unknown>, index: number) => string)
  itemSubtitle?: string | ((item: Record<string, unknown>, index: number) => string)
  reorderable?: boolean
  collapsible?: boolean
  virtual?: VirtualScrollConfig | boolean
  allowAdd?: boolean
  allowRemove?: boolean
  addLabel?: string
  maxItems?: number
  minItems?: number
}

export interface CardsViewConfig extends ListViewConfig {
  columns?: number | string
  gap?: string
}

export interface TabsViewConfig {
  tabTitle?: string | ((item: Record<string, unknown>, index: number) => string)
  allowAdd?: boolean
  allowRemove?: boolean
}

export interface TagsViewConfig {
  creatable?: boolean
  maxTags?: number
}

export interface ComboboxViewConfig {
  searchable?: boolean
  creatable?: boolean
  multiple?: boolean
  placeholder?: string
  virtual?: VirtualScrollConfig | boolean
}

// ---------------------------------------------------------------------------
// Form Context & Resolved Node Tree
// ---------------------------------------------------------------------------

export interface FormContext {
  values: Record<string, unknown>
  parentValues?: Record<string, unknown>
  rootValues?: Record<string, unknown>
  path?: string
  index?: number
  /** Where the object being built sits in the root values; resolves $root/$parent/$item. */
  scope?: PathScope
  stepIndex?: number
  [key: string]: unknown
}

export interface FormFieldNode {
  kind: 'field'
  /** Unique in the tree. For a field this is its template path. */
  id: string
  /** Where this field sat before its path was made relative to a row (see relativizeNodes). */
  absPath?: string
  key: string
  path: string
  label: string
  description?: string
  placeholder?: string
  helpText?: string
  widget: string
  widgetProps: Record<string, unknown>
  required: boolean
  disabled: boolean
  readonly: boolean
  hidden: boolean
  colSpan?: number
  defaultValue?: unknown
  type: string
  descriptor: TypeDescriptor
  /** For a field with `derive`: its value right now. */
  derivedValue?: unknown
  /** Nested object fields; their paths are relative to this form's root. */
  children?: FormNode[]
  /** Template for an array item; [] in paths denotes the item index. */
  item?: FormFieldNode
  /**
   * Builds `item` for one real row, so `when` conditions in the row see its values and the
   * rest of the form. `rowPath` is the row's concrete path, e.g. `orders[2]`. Not enumerable:
   * it is dropped when the tree is serialized.
   */
  resolveItem?: (root: unknown, rowPath: string | readonly (string | number | symbol)[]) => FormFieldNode | undefined
  options?: Array<{ value: string | number; label: string }>
  dataSource?: DataSourceConfig
  virtual?: VirtualScrollConfig
  pagination?: AsyncPaginationConfig
  dependsOn?: string[]
}


export interface FormUIOnlyNode {
  kind: 'ui_only'
  /** Unique in the tree: the chain of containing nodes plus this key. */
  id: string
  key: string
  path: string
  uiKind: UIOnlyNodeKind
  descriptor: UIOnlyDescriptor
  computedValue?: unknown
}

export interface FormLayoutNode {
  kind: 'layout'
  /** Unique in the tree: the chain of containing nodes plus this key. */
  id: string
  key: string
  path: string
  layoutKind: LayoutContainerKind
  options?: LayoutContainerOptions
  children: FormNode[]
  activeStep?: number
  activeTab?: string
}

export type FormNode = FormFieldNode | FormUIOnlyNode | FormLayoutNode

export interface FormNodeTree {
  nodes: FormNode[]
  fieldsByKey: Record<string, FormFieldNode>
  activeSteps?: Array<{ key: string; label: string; valid: boolean; active: boolean }>
}
