import type { BaseSchema } from '../core/base'
import type { DataSourceConfig, VirtualScrollConfig, AsyncPaginationConfig } from '../types/ast'

import type { FormWidget, WidgetForValue } from './widgets'

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
