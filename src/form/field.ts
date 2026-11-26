import type { BaseSchema } from '../core/base'
import type { DataSourceConfig, VirtualScrollConfig, AsyncPaginationConfig } from '../types/ast'

import type { FormWidget, WidgetForValue } from './widgets'
import type { OptionsSpec } from './options'
import type { FormCondition, FormContext } from './types'

/** Presentation settings attached to a field rather than its data schema. */
export interface FormFieldOptions<TWidget extends FormWidget = FormWidget> {
  widget?: TWidget
  label?: string
  description?: string
  placeholder?: string
  helpText?: string
  disabled?: boolean
  readonly?: boolean
  hidden?: boolean
  colSpan?: number
  /**
   * Conditions, in the same language as `f.when` and scoped the same way (a bare name is a sibling,
   * `$root` / `$parent` / `$item` reach outward). They are evaluated against the current values.
   */
  disabledWhen?: FormCondition
  readonlyWhen?: FormCondition
  hiddenWhen?: FormCondition
  /**
   * Decides whether the field is required, replacing what the schema says: while true an empty value
   * is an error, while false an empty value is fine.
   */
  requiredWhen?: FormCondition
  /**
   * The choices for a select, radio or combobox. A value outside the current choices is invalid, so
   * with `{ by: 'country', map }` a city left over from another country is rejected.
   */
  options?: OptionsSpec
  /**
   * Makes the field a computed value: an expression over the other fields, or a function. The
   * parsed output always holds the computed value; the input value is ignored. Shown read-only.
   */
  derive?: string | ((values: Record<string, unknown>, context?: FormContext) => unknown)
  dataSource?: DataSourceConfig
  /** `true` for sensible defaults, or a partial config. */
  virtual?: Partial<VirtualScrollConfig> | boolean
  pagination?: Partial<AsyncPaginationConfig> | number
}

export class FormField<TSchema extends BaseSchema<any, any>, TWidget extends FormWidget = FormWidget> {
  public readonly __formKind = 'field' as const

  constructor(
    public readonly schema: TSchema,
    public readonly options: FormFieldOptions<TWidget> = {},
  ) {}
}

export function field<TSchema extends BaseSchema<any, any>>(
  schema: TSchema,
  options: FormFieldOptions<WidgetForValue<TSchema['_input']>> = {},
): FormField<TSchema, WidgetForValue<TSchema['_input']>> {
  return new FormField(schema, options)
}

export function isFormField(value: unknown): value is FormField<BaseSchema<any, any>> {
  return value instanceof FormField
}
