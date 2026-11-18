import type { NumberSchema } from '../builders/primitives'

/**
 * Exclusive number bounds (`> x`, `< x`) shared by the Zod and JSON Schema bridges.
 *
 * The struct only has inclusive `min`/`max`, so an exclusive bound is expressed as the closest thing it can say:
 * `positive()` / `negative()` for zero, `x ± 1` for an integer, and a refinement for any other number.
 * The refinement keeps validation exact; the descriptor then carries no bound for a form to show.
 */
export function exclusiveMin(
  schema: NumberSchema<any>,
  bound: number,
  message?: string,
): NumberSchema<any> {
  if (bound === 0) return schema.positive(message)
  if (schema.descriptor.integer === true) return schema.min(Math.floor(bound) + 1, message)
  return schema.refine((v: number) => v > bound, message ?? `Number must be greater than ${bound}`)
}

export function exclusiveMax(
  schema: NumberSchema<any>,
  bound: number,
  message?: string,
): NumberSchema<any> {
  if (bound === 0) return schema.negative(message)
  if (schema.descriptor.integer === true) return schema.max(Math.ceil(bound) - 1, message)
  return schema.refine((v: number) => v < bound, message ?? `Number must be less than ${bound}`)
}

/** A lower or upper limit read from a schema. `inclusive: false` means strictly above (or below) `value`. */
export interface Bound {
  value: number
  inclusive?: boolean
  message?: string
}

/**
 * Zod and JSON Schema keep every bound that is written (`.min(5).min(1)` still means at least 5), but a struct has one `min` and
 * one `max`, and the last call wins. So of several bounds only the strictest is passed on; on a tie an exclusive one is stricter.
 */
export function strictestLower(bounds: readonly Bound[]): Bound | undefined {
  return bounds.reduce<Bound | undefined>((best, next) => {
    if (best === undefined || next.value > best.value) return next
    return next.value === best.value && best.inclusive !== false && next.inclusive === false ? next : best
  }, undefined)
}

export function strictestUpper(bounds: readonly Bound[]): Bound | undefined {
  return bounds.reduce<Bound | undefined>((best, next) => {
    if (best === undefined || next.value < best.value) return next
    return next.value === best.value && best.inclusive !== false && next.inclusive === false ? next : best
  }, undefined)
}

/** Applies the strictest of the lower and of the upper bounds to a number schema. */
export function applyNumberBounds(
  schema: NumberSchema<any>,
  lowers: readonly Bound[],
  uppers: readonly Bound[],
): NumberSchema<any> {
  const lower = strictestLower(lowers)
  const upper = strictestUpper(uppers)

  if (lower) {
    schema =
      lower.inclusive === false
        ? exclusiveMin(schema, lower.value, lower.message)
        : schema.min(lower.value, lower.message)
  }
  if (upper) {
    schema =
      upper.inclusive === false
        ? exclusiveMax(schema, upper.value, upper.message)
        : schema.max(upper.value, upper.message)
  }
  return schema
}
