/**
 * Standalone form widget builders (presentation model).
 *
 * A widget describes HOW a field is rendered, never WHAT it accepts. Value
 * constraints (min / max / step / length / pattern ...) live on the schema and
 * are intentionally NOT duplicated here.
 *
 * Every builder is immutable: each chained method returns a new builder and
 * never mutates the receiver. Every builder exposes a public, discriminated
 * `kind` and a frozen, JSON-serializable `props` bag of plain values.
 *
 * Value compatibility is carried by a phantom type parameter so a field API can
 * check that a widget fits the field's value type (see {@link WidgetForValue}
 * and {@link WidgetCompatibleWith}).
 */

import type {
  CardsViewConfig,
  ComboboxViewConfig,
  ListViewConfig,
  TableColumnConfig,
  TableFooterAggregation,
  TableViewConfig,
  TabsViewConfig,
  TagsViewConfig,
} from './types'

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type StringWidgetKind = 'text' | 'textarea'
export type NumericWidgetKind = 'number' | 'slider' | 'range'
export type CollectionWidgetKind = 'table' | 'tags' | 'list' | 'cards' | 'tabs' | 'combobox'
export type FormWidgetKind = StringWidgetKind | NumericWidgetKind | CollectionWidgetKind

export const STRING_WIDGET_KINDS: readonly StringWidgetKind[] = Object.freeze([
  'text',
  'textarea',
])
export const NUMERIC_WIDGET_KINDS: readonly NumericWidgetKind[] = Object.freeze([
  'number',
  'slider',
  'range',
])
export const COLLECTION_WIDGET_KINDS: readonly CollectionWidgetKind[] = Object.freeze([
  'table',
  'tags',
  'list',
  'cards',
  'tabs',
  'combobox',
])

// ---------------------------------------------------------------------------
// Props (plain, JSON-serializable values only)
// ---------------------------------------------------------------------------

export type TextInputType = 'text' | 'email' | 'password' | 'url' | 'tel' | 'search'

export interface TextInputWidgetProps {
  readonly placeholder?: string
  readonly inputType?: TextInputType
}

export interface TextareaWidgetProps {
  readonly placeholder?: string
  /** Visible text rows (positive integer). */
  readonly rows?: number
  /** Visible text columns (positive integer). */
  readonly cols?: number
}

export interface NumberInputWidgetProps {
  readonly placeholder?: string
  /** Render increment / decrement stepper controls. */
  readonly controls?: boolean
}

export type WidgetOrientation = 'horizontal' | 'vertical'

export interface SliderWidgetProps {
  /** Show the current value next to the control. */
  readonly showValue?: boolean
  /** Render tick marks (positions derive from the schema step). */
  readonly showTicks?: boolean
  readonly orientation?: WidgetOrientation
}

export interface RangeWidgetProps {
  /** Show the current value next to the control. */
  readonly showValue?: boolean
  readonly orientation?: WidgetOrientation
}

// ---------------------------------------------------------------------------
// Serialized shape
// ---------------------------------------------------------------------------

/** The plain JSON shape produced by `toJSON()` / `JSON.stringify(widget)`. */
export interface SerializedWidget<K extends FormWidgetKind = FormWidgetKind, P = unknown> {
  readonly kind: K
  readonly props: P
}

// ---------------------------------------------------------------------------
// Base builder
// ---------------------------------------------------------------------------

type DefinedProps<P> = { [K in keyof P]?: P[K] }

function freezeProps<P extends object>(props: P): Readonly<P> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(props)) {
    const value = (props as Record<string, unknown>)[key]
    if (value !== undefined) out[key] = value
  }
  return Object.freeze(out) as Readonly<P>
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, received ${String(value)}`)
  }
}

/**
 * Shared behaviour of every widget. `TValue` is a phantom type describing the
 * value the widget produces / consumes; it has no runtime representation.
 */
abstract class WidgetBase<K extends FormWidgetKind, P extends object, TValue> {
  abstract readonly kind: K
  readonly props: Readonly<P>

  /** Phantom value type. Never set at runtime. */
  declare readonly '~value'?: TValue

  protected constructor(props: P) {
    this.props = freezeProps(props)
  }

  /** Creates a new builder of the same class with `patch` merged over props. */
  protected abstract create(props: P): this

  protected with(patch: DefinedProps<P>): this {
    return this.create({ ...this.props, ...patch } as P)
  }

  toJSON(): SerializedWidget<K, Readonly<P>> {
    return { kind: this.kind, props: { ...this.props } }
  }
}

// ---------------------------------------------------------------------------
// String widgets
// ---------------------------------------------------------------------------

export class TextInputWidget<TValue extends string = string> extends WidgetBase<
  'text',
  TextInputWidgetProps,
  TValue
> {
  readonly kind = 'text' as const

  constructor(props: TextInputWidgetProps = {}) {
    super(props)
  }

  protected create(props: TextInputWidgetProps): this {
    return new TextInputWidget<TValue>(props) as this
  }

  placeholder(text: string): TextInputWidget<TValue> {
    return this.with({ placeholder: text })
  }

  inputType(type: TextInputType): TextInputWidget<TValue> {
    return this.with({ inputType: type })
  }
}

export class TextareaWidget<TValue extends string = string> extends WidgetBase<
  'textarea',
  TextareaWidgetProps,
  TValue
> {
  readonly kind = 'textarea' as const

  constructor(props: TextareaWidgetProps = {}) {
    super(props)
    if (props.rows !== undefined) assertPositiveInteger('rows', props.rows)
    if (props.cols !== undefined) assertPositiveInteger('cols', props.cols)
  }

  protected create(props: TextareaWidgetProps): this {
    return new TextareaWidget<TValue>(props) as this
  }

  placeholder(text: string): TextareaWidget<TValue> {
    return this.with({ placeholder: text })
  }

  rows(count: number): TextareaWidget<TValue> {
    return this.with({ rows: count })
  }

  cols(count: number): TextareaWidget<TValue> {
    return this.with({ cols: count })
  }
}

// ---------------------------------------------------------------------------
// Numeric widgets
// ---------------------------------------------------------------------------

export class NumberInputWidget<TValue extends number = number> extends WidgetBase<
  'number',
  NumberInputWidgetProps,
  TValue
> {
  readonly kind = 'number' as const

  constructor(props: NumberInputWidgetProps = {}) {
    super(props)
  }

  protected create(props: NumberInputWidgetProps): this {
    return new NumberInputWidget<TValue>(props) as this
  }

  placeholder(text: string): NumberInputWidget<TValue> {
    return this.with({ placeholder: text })
  }

  controls(enabled = true): NumberInputWidget<TValue> {
    return this.with({ controls: enabled })
  }
}

export class SliderWidget<TValue extends number = number> extends WidgetBase<
  'slider',
  SliderWidgetProps,
  TValue
> {
  readonly kind = 'slider' as const

  constructor(props: SliderWidgetProps = {}) {
    super(props)
  }

  protected create(props: SliderWidgetProps): this {
    return new SliderWidget<TValue>(props) as this
  }

  showValue(enabled = true): SliderWidget<TValue> {
    return this.with({ showValue: enabled })
  }

  showTicks(enabled = true): SliderWidget<TValue> {
    return this.with({ showTicks: enabled })
  }

  orientation(value: WidgetOrientation): SliderWidget<TValue> {
    return this.with({ orientation: value })
  }
}

export class RangeWidget<TValue extends number = number> extends WidgetBase<
  'range',
  RangeWidgetProps,
  TValue
> {
  readonly kind = 'range' as const

  constructor(props: RangeWidgetProps = {}) {
    super(props)
  }

  protected create(props: RangeWidgetProps): this {
    return new RangeWidget<TValue>(props) as this
  }

  showValue(enabled = true): RangeWidget<TValue> {
    return this.with({ showValue: enabled })
  }

  orientation(value: WidgetOrientation): RangeWidget<TValue> {
    return this.with({ orientation: value })
  }
}

// ---------------------------------------------------------------------------
// Collection widgets
//
// Configs come from ./types, minus the function-valued members (those cannot be
// serialized): `computed` / `fn` / item title callbacks accept their string form
// only, and the `custom` aggregation op (which requires `fn`) is excluded.
// ---------------------------------------------------------------------------

export type TableWidgetColumn = Omit<TableColumnConfig, 'computed'> & {
  /** Expression string (callbacks are not serializable). */
  computed?: string
}

export type TableWidgetAggregation = Omit<TableFooterAggregation, 'fn' | 'op'> & {
  op: Exclude<TableFooterAggregation['op'], 'custom'>
}

export type TableWidgetConfig = Omit<TableViewConfig, 'columns' | 'aggregations'> & {
  columns?: TableWidgetColumn[]
  aggregations?: TableWidgetAggregation[]
}

export type ListWidgetConfig = Omit<ListViewConfig, 'itemTitle' | 'itemSubtitle'> & {
  itemTitle?: string
  itemSubtitle?: string
}

export type CardsWidgetConfig = Omit<CardsViewConfig, 'itemTitle' | 'itemSubtitle'> & {
  itemTitle?: string
  itemSubtitle?: string
}

export type TabsWidgetConfig = Omit<TabsViewConfig, 'tabTitle'> & {
  tabTitle?: string
}

export type TagsWidgetConfig = TagsViewConfig
export type ComboboxWidgetConfig = ComboboxViewConfig

/** Deep-clones a config as plain JSON data; rejects non-serializable values. */
function cloneConfig<C extends object>(config: C): C {
  const walk = (value: unknown, path: string): unknown => {
    if (value === undefined) return undefined
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`)
      return value
    }
    if (Array.isArray(value)) {
      return Object.freeze(value.map((v, i) => walk(v, `${path}[${i}]`) ?? null))
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(value)) {
        const v = walk((value as Record<string, unknown>)[key], `${path}.${key}`)
        if (v !== undefined) out[key] = v
      }
      return Object.freeze(out)
    }
    throw new TypeError(`${path} is not JSON serializable (${typeof value})`)
  }
  return walk(config, 'config') as C
}

/**
 * Shared behaviour of collection widgets. The phantom value type defaults to
 * `readonly unknown[]` so any array-valued field is compatible.
 */
abstract class CollectionWidgetBase<
  K extends CollectionWidgetKind,
  C extends object,
  TValue,
> {
  abstract readonly kind: K
  readonly props: Readonly<C>

  /** Phantom value type. Never set at runtime. */
  declare readonly '~value'?: TValue

  protected constructor(config: C) {
    this.props = cloneConfig(config)
  }

  protected abstract create(config: C): this

  /** Returns a new widget whose config is the current one shallow-merged with `patch`. */
  protected merge(patch: Partial<C>): this {
    return this.create({ ...this.props, ...patch } as C)
  }

  toJSON(): SerializedWidget<K, Readonly<C>> {
    return JSON.parse(JSON.stringify({ kind: this.kind, props: this.props }))
  }
}

export class TableWidget<TValue extends readonly unknown[] = readonly unknown[]> extends CollectionWidgetBase<
  'table',
  TableWidgetConfig,
  TValue
> {
  readonly kind = 'table' as const
  constructor(config: TableWidgetConfig = {}) {
    super(config)
  }
  protected create(config: TableWidgetConfig): this {
    return new TableWidget<TValue>(config) as this
  }
  /** Shallow-merge `patch` into the config, returning a new widget. */
  configure(patch: Partial<TableWidgetConfig>): TableWidget<TValue> {
    return this.merge(patch)
  }
}

export class TagsWidget<TValue extends readonly unknown[] = readonly unknown[]> extends CollectionWidgetBase<
  'tags',
  TagsWidgetConfig,
  TValue
> {
  readonly kind = 'tags' as const
  constructor(config: TagsWidgetConfig = {}) {
    super(config)
  }
  protected create(config: TagsWidgetConfig): this {
    return new TagsWidget<TValue>(config) as this
  }
  configure(patch: Partial<TagsWidgetConfig>): TagsWidget<TValue> {
    return this.merge(patch)
  }
}

export class ListWidget<TValue extends readonly unknown[] = readonly unknown[]> extends CollectionWidgetBase<
  'list',
  ListWidgetConfig,
  TValue
> {
  readonly kind = 'list' as const
  constructor(config: ListWidgetConfig = {}) {
    super(config)
  }
  protected create(config: ListWidgetConfig): this {
    return new ListWidget<TValue>(config) as this
  }
  configure(patch: Partial<ListWidgetConfig>): ListWidget<TValue> {
    return this.merge(patch)
  }
}

export class CardsWidget<TValue extends readonly unknown[] = readonly unknown[]> extends CollectionWidgetBase<
  'cards',
  CardsWidgetConfig,
  TValue
> {
  readonly kind = 'cards' as const
  constructor(config: CardsWidgetConfig = {}) {
    super(config)
  }
  protected create(config: CardsWidgetConfig): this {
    return new CardsWidget<TValue>(config) as this
  }
  configure(patch: Partial<CardsWidgetConfig>): CardsWidget<TValue> {
    return this.merge(patch)
  }
}

export class TabsWidget<TValue extends readonly unknown[] = readonly unknown[]> extends CollectionWidgetBase<
  'tabs',
  TabsWidgetConfig,
  TValue
> {
  readonly kind = 'tabs' as const
  constructor(config: TabsWidgetConfig = {}) {
    super(config)
  }
  protected create(config: TabsWidgetConfig): this {
    return new TabsWidget<TValue>(config) as this
  }
  configure(patch: Partial<TabsWidgetConfig>): TabsWidget<TValue> {
    return this.merge(patch)
  }
}

/** A combobox edits a single string (async lookup) or an array (`multiple`). */
export type ComboboxValue = string | readonly unknown[]

export class ComboboxWidget<TValue extends ComboboxValue = ComboboxValue> extends CollectionWidgetBase<
  'combobox',
  ComboboxWidgetConfig,
  TValue
> {
  readonly kind = 'combobox' as const
  constructor(config: ComboboxWidgetConfig = {}) {
    super(config)
  }
  protected create(config: ComboboxWidgetConfig): this {
    return new ComboboxWidget<TValue>(config) as this
  }
  configure(patch: Partial<ComboboxWidgetConfig>): ComboboxWidget<TValue> {
    return this.merge(patch)
  }
}

// ---------------------------------------------------------------------------
// Unions & compatibility types
// ---------------------------------------------------------------------------

/** Widgets that edit a string value. */
export type StringFormWidget = TextInputWidget<string> | TextareaWidget<string>

/** Widgets that edit a numeric value. */
export type NumericFormWidget = NumberInputWidget<number> | SliderWidget<number> | RangeWidget<number>

/** Combobox widget: compatible with both string and array fields. */
export type ComboboxFormWidget = ComboboxWidget<ComboboxValue>

/** Widgets that edit an array value (a combobox is included, for `multiple`). */
export type CollectionFormWidget =
  | TableWidget<readonly unknown[]>
  | TagsWidget<readonly unknown[]>
  | ListWidget<readonly unknown[]>
  | CardsWidget<readonly unknown[]>
  | TabsWidget<readonly unknown[]>
  | ComboboxFormWidget

/** Discriminated (on `kind`) union of every standalone form widget. */
export type FormWidget = StringFormWidget | NumericFormWidget | CollectionFormWidget

/** Extracts the widget with a given `kind`. */
export type FormWidgetOfKind<K extends FormWidgetKind> = Extract<FormWidget, { readonly kind: K }>

/** Union of widgets that can edit a field of value type `TValue` (nullish ignored). */
export type WidgetForValue<TValue> = [NonNullable<TValue>] extends [never]
  ? never
  : [NonNullable<TValue>] extends [string]
    ? StringFormWidget | ComboboxFormWidget
    : [NonNullable<TValue>] extends [number]
      ? NumericFormWidget
      : [NonNullable<TValue>] extends [readonly unknown[]]
        ? CollectionFormWidget
        : never

/**
 * Resolves to `W` when widget `W` can edit a field of value type `TValue`,
 * otherwise `never`. Use as a parameter type for compile-time checks, e.g.
 * `widget<TValue, W extends FormWidget>(w: WidgetCompatibleWith<W, TValue>)`.
 */
export type WidgetCompatibleWith<W extends FormWidget, TValue> = W extends WidgetForValue<TValue>
  ? W
  : never

/** The value type a widget produces (the phantom parameter). */
export type WidgetValue<W extends FormWidget> = NonNullable<W['~value']>

/** The props type of a widget. */
export type WidgetProps<W extends FormWidget> = W['props']

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function textInput<TValue extends string = string>(
  props: TextInputWidgetProps = {},
): TextInputWidget<TValue> {
  return new TextInputWidget<TValue>(props)
}

export function textarea<TValue extends string = string>(
  props: TextareaWidgetProps = {},
): TextareaWidget<TValue> {
  return new TextareaWidget<TValue>(props)
}

export function numberInput<TValue extends number = number>(
  props: NumberInputWidgetProps = {},
): NumberInputWidget<TValue> {
  return new NumberInputWidget<TValue>(props)
}

export function slider<TValue extends number = number>(
  props: SliderWidgetProps = {},
): SliderWidget<TValue> {
  return new SliderWidget<TValue>(props)
}

export function table<TValue extends readonly unknown[] = readonly unknown[]>(
  config: TableWidgetConfig = {},
): TableWidget<TValue> {
  return new TableWidget<TValue>(config)
}

export function tags<TValue extends readonly unknown[] = readonly unknown[]>(
  config: TagsWidgetConfig = {},
): TagsWidget<TValue> {
  return new TagsWidget<TValue>(config)
}

export function list<TValue extends readonly unknown[] = readonly unknown[]>(
  config: ListWidgetConfig = {},
): ListWidget<TValue> {
  return new ListWidget<TValue>(config)
}

export function cards<TValue extends readonly unknown[] = readonly unknown[]>(
  config: CardsWidgetConfig = {},
): CardsWidget<TValue> {
  return new CardsWidget<TValue>(config)
}

/** Named `tabsWidget` to avoid clashing with the `tabs` layout node. */
export function tabsWidget<TValue extends readonly unknown[] = readonly unknown[]>(
  config: TabsWidgetConfig = {},
): TabsWidget<TValue> {
  return new TabsWidget<TValue>(config)
}

export function combobox<TValue extends ComboboxValue = ComboboxValue>(
  config: ComboboxWidgetConfig = {},
): ComboboxWidget<TValue> {
  return new ComboboxWidget<TValue>(config)
}

export function range<TValue extends number = number>(
  props: RangeWidgetProps = {},
): RangeWidget<TValue> {
  return new RangeWidget<TValue>(props)
}

/** Namespace-style bag of all widget factories (`widgets.textInput()` ...). */
export const widgets = Object.freeze({
  textInput,
  textarea,
  numberInput,
  slider,
  range,
  table,
  tags,
  list,
  cards,
  tabsWidget,
  combobox,
})

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const WIDGET_CLASSES = [
  TextInputWidget,
  TextareaWidget,
  NumberInputWidget,
  SliderWidget,
  RangeWidget,
  TableWidget,
  TagsWidget,
  ListWidget,
  CardsWidget,
  TabsWidget,
  ComboboxWidget,
] as const

export function isFormWidget(value: unknown): value is FormWidget {
  return WIDGET_CLASSES.some((cls) => value instanceof cls)
}

export function isStringWidget(value: unknown): value is StringFormWidget {
  return isFormWidget(value) && (STRING_WIDGET_KINDS as readonly string[]).includes(value.kind)
}

export function isNumericWidget(value: unknown): value is NumericFormWidget {
  return isFormWidget(value) && (NUMERIC_WIDGET_KINDS as readonly string[]).includes(value.kind)
}

export function isCollectionWidget(value: unknown): value is CollectionFormWidget {
  return isFormWidget(value) && (COLLECTION_WIDGET_KINDS as readonly string[]).includes(value.kind)
}
