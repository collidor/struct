/**
 * Deep clones an AST TypeDescriptor or nested descriptor property,
 * safely preserving functions (such as dynamic default generators),
 * RegExp instances, Date instances, and primitive values
 * without JSON.stringify data loss.
 */
export function cloneDescriptor<T>(val: T): T {
  if (val === null || typeof val !== 'object') {
    return val
  }
  if (typeof val === 'function') {
    return val
  }
  if (val instanceof RegExp) {
    return new RegExp(val.source, val.flags) as unknown as T
  }
  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T
  }
  if (Array.isArray(val)) {
    return val.map((item) => cloneDescriptor(item)) as unknown as T
  }
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(val)) {
    copy[key] = cloneDescriptor(value)
  }
  return copy as T
}
