import type { FormContext } from './types'

/** One choice. A bare string or number is its own value and label. */
export type OptionItem = string | number | { value: string | number; label?: string; description?: string }

/** Choices that depend on another field: `by` names it, `map` is keyed by its value. */
export interface DependentOptions {
  /** The field whose value picks the list. Resolved like any reference (`country`, `$root.country`). */
  by: string
  map: Record<string, OptionItem[]>
  /** Used when `by` has no entry in `map` (or no value yet). Empty when omitted. */
  otherwise?: OptionItem[]
}

/** A fixed list, a list that follows another field, or a function of the current values. */
export type OptionsSpec =
  | OptionItem[]
  | DependentOptions
  | ((values: Record<string, unknown>, context?: FormContext) => OptionItem[])

export interface ResolvedOption {
  value: string | number
  label: string
  description?: string
}

export function normalizeOptionItems(items: readonly OptionItem[] | undefined): ResolvedOption[] {
  return (items ?? []).map((item) =>
    typeof item === 'object' && item !== null
      ? { value: item.value, label: item.label ?? String(item.value), ...(item.description ? { description: item.description } : {}) }
      : { value: item, label: String(item) },
  )
}

/** The choices available right now, given the form's values. */
export function resolveOptions(
  spec: OptionsSpec,
  values: Record<string, unknown>,
  context?: FormContext,
): ResolvedOption[] {
  if (typeof spec === 'function') return normalizeOptionItems(spec(values, context))
  if (Array.isArray(spec)) return normalizeOptionItems(spec)
  const chosen = context?.scope ? context.scope.get(spec.by) : values[spec.by]
  const key = chosen === undefined || chosen === null ? undefined : String(chosen)
  return normalizeOptionItems((key !== undefined ? spec.map[key] : undefined) ?? spec.otherwise)
}

/** Whether `value` (or every element of an array value) is one of `options`. */
export function isAvailable(options: readonly ResolvedOption[], value: unknown): boolean {
  const has = (v: unknown) => options.some((option) => String(option.value) === String(v))
  return Array.isArray(value) ? value.every(has) : has(value)
}
