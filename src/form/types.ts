// oxlint-disable typescript/no-explicit-any
import type { BaseSchema } from '../core/base'
import type { TypeDescriptor } from '../types/ast'
import type { Infer, InferInput, Prettify } from '../types/inference'

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

export type FormNodeKind = 'field' | LayoutContainerKind | UIOnlyNodeKind | 'when'

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
  defaultOpen?: boolean
  defaultTab?: string
  icon?: string
  validateOnNext?: boolean
  meta?: Record<string, unknown>
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

export type FlattenFieldOutput<T> = T extends UIOnlyMarker
  ? {}
  : T extends LayoutContainerMarker<infer Inner>
    ? InferFormOutput<Inner>
    : T extends ConditionalMarker<infer Inner, infer Else>
      ? Else extends Record<string, any>
        ? Partial<InferFormOutput<Inner>> & Partial<InferFormOutput<Else>>
        : Partial<InferFormOutput<Inner>>
      : T extends BaseSchema<any, infer O>
        ? O
        : never

export type FlattenFieldInput<T> = T extends UIOnlyMarker
  ? {}
  : T extends LayoutContainerMarker<infer Inner>
    ? InferFormInput<Inner>
    : T extends ConditionalMarker<infer Inner, infer Else>
      ? Else extends Record<string, any>
        ? Partial<InferFormInput<Inner>> & Partial<InferFormInput<Else>>
        : Partial<InferFormInput<Inner>>
      : T extends BaseSchema<infer I, any>
        ? I
        : never

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
            : TShape[K] extends BaseSchema<any, infer O>
              ? { [P in K]: O }
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
            : TShape[K] extends BaseSchema<infer I, any>
              ? { [P in K]: I }
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

export type CollectionViewMode =
  | { mode: 'table'; config?: TableViewConfig }
  | { mode: 'list'; config?: ListViewConfig }
  | { mode: 'cards'; config?: CardsViewConfig }
  | { mode: 'tabs'; config?: TabsViewConfig }
  | { mode: 'tags'; config?: TagsViewConfig }
  | { mode: 'combobox'; config?: ComboboxViewConfig }


// ---------------------------------------------------------------------------
// Form Context & Resolved Node Tree
// ---------------------------------------------------------------------------

export interface FormContext {
  values: Record<string, unknown>
  parentValues?: Record<string, unknown>
  rootValues?: Record<string, unknown>
  path?: string
  index?: number
  stepIndex?: number
  [key: string]: unknown
}

export interface FormFieldNode {
  kind: 'field'
  key: string
  path: string
  label: string
  description?: string
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
  options?: Array<{ value: string | number; label: string }>
  dataSource?: DataSourceConfig
  virtual?: VirtualScrollConfig
  pagination?: AsyncPaginationConfig
  dependsOn?: string[]
}


export interface FormUIOnlyNode {
  kind: 'ui_only'
  key: string
  path: string
  uiKind: UIOnlyNodeKind
  descriptor: UIOnlyDescriptor
  computedValue?: unknown
}

export interface FormLayoutNode {
  kind: 'layout'
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
