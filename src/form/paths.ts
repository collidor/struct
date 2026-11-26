/**
 * Scoped path resolution for form values.
 *
 * Inside a list the same field exists once per row, so a bare key is ambiguous:
 * `ref` could mean the root's `ref`, the current row's, or an outer row's. Every
 * lookup therefore goes through a {@link PathScope}: the concrete location of the
 * object being edited, plus rules for resolving references from it.
 *
 * Paths come in two forms that these helpers convert between:
 *  - concrete: `orders[2].lines[0].sku`  (what values and validation issues use)
 *  - template: `orders[].lines[].sku`    (what a form tree describes, one per field)
 *
 * References resolved by a scope:
 *  - `ref`            relative to the scope's own object (a sibling)
 *  - `$root.ref`      the form's root object
 *  - `$parent.ref`    the object that contains the scope's object (repeatable)
 *  - `$item.ref`      the nearest enclosing list row
 */

/** Stands for "any index" in a template path (`[]`). */
export const ITEM: unique symbol = Symbol.for('@collidor/struct/item')

export type PathSegment = string | number | typeof ITEM
export type PathInput = string | readonly PathSegment[]

const TOKEN = /\[(\d*)\]|([^.[\]]+)/g

/**
 * Parses `a.b[2].c`, `a.b.2.c` and `a[].b` into segments. A segment made only of
 * digits is a list index, which is how validators report issue paths when joined.
 */
export function parsePath(input: PathInput): PathSegment[] {
  if (typeof input !== 'string') return [...input]
  const out: PathSegment[] = []
  for (const match of input.matchAll(TOKEN)) {
    if (match[2] !== undefined) {
      out.push(/^\d+$/.test(match[2]) ? Number(match[2]) : match[2])
    } else {
      out.push(match[1] === '' ? ITEM : Number(match[1]))
    }
  }
  return out
}

/** Formats segments as `orders[2].lines[0].sku`. */
export function formatPath(input: PathInput): string {
  let out = ''
  for (const segment of parsePath(input)) {
    if (segment === ITEM) out += '[]'
    else if (typeof segment === 'number') out += `[${segment}]`
    else out += out === '' ? segment : `.${segment}`
  }
  return out
}

/** `orders[2].lines[0].sku` -> `orders[].lines[].sku`. */
export function toTemplatePath(input: PathInput): string {
  return formatPath(parsePath(input).map((s) => (typeof s === 'number' ? ITEM : s)))
}

/** True when `concrete` is an instance of `template` (indices match `[]`). */
export function matchesTemplate(concrete: PathInput, template: PathInput): boolean {
  const a = parsePath(concrete)
  const b = parsePath(template)
  return (
    a.length === b.length &&
    a.every((s, i) => b[i] === s || (b[i] === ITEM && typeof s === 'number'))
  )
}

/** True when `path` equals or lies below `prefix`, compared as templates. */
export function startsWithTemplate(path: PathInput, prefix: PathInput): boolean {
  const a = parsePath(toTemplatePath(path))
  const b = parsePath(toTemplatePath(prefix))
  return b.length <= a.length && b.every((segment, i) => a[i] === segment)
}

function isContainer(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the value at `path`; `undefined` when any step is missing or a template `[]`. */
export function getAt(root: unknown, path: PathInput): unknown {
  let current = root
  for (const segment of parsePath(path)) {
    if (segment === ITEM || !isContainer(current)) return undefined
    current = (current as Record<PropertyKey, unknown>)[segment as string | number]
  }
  return current
}

/**
 * Every value a path reaches, fanning out over `[]`: `getAll(order, 'lines[].sku')` is the
 * sku of each line. Rows where a step is missing contribute nothing.
 */
export function getAll(root: unknown, path: PathInput): unknown[] {
  let level: unknown[] = [root]
  for (const segment of parsePath(path)) {
    const next: unknown[] = []
    for (const node of level) {
      if (segment === ITEM) {
        if (Array.isArray(node)) next.push(...node)
      } else if (isContainer(node)) {
        const value = (node as Record<PropertyKey, unknown>)[segment as string | number]
        if (value !== undefined) next.push(value)
      }
    }
    level = next
  }
  return level
}

/**
 * Returns a copy of `root` with `value` written at `path`. Only the containers on
 * the way are copied. Missing containers become arrays before an index, else objects.
 */
export function setAt(root: unknown, path: PathInput, value: unknown): any {
  const segments = parsePath(path)
  if (segments.some((s) => s === ITEM)) {
    throw new TypeError(`Cannot write to template path "${formatPath(segments)}"`)
  }
  const write = (node: unknown, index: number): unknown => {
    if (index === segments.length) return value
    const key = segments[index] as string | number
    const base = isContainer(node)
      ? node
      : typeof key === 'number'
        ? []
        : {}
    const next = write((base as Record<PropertyKey, unknown>)[key], index + 1)
    if (Array.isArray(base)) {
      const copy: unknown[] = [...(base as unknown[])]
      copy[key as number] = next
      return copy
    }
    return { ...base, [key]: next }
  }
  return write(root, 0)
}

/**
 * The location of one object in the form values, and how to resolve references from it.
 * Immutable: moving to a row or a nested object returns a new scope over the same root.
 */
export class PathScope {
  readonly base: readonly PathSegment[]

  constructor(
    readonly root: unknown,
    base: PathInput = [],
  ) {
    this.base = parsePath(base)
  }

  /** The object this scope points at (`{}` when it does not exist yet). */
  get value(): Record<string, unknown> {
    const v = getAt(this.root, this.base)
    return isContainer(v) ? (v as Record<string, unknown>) : {}
  }

  /** Index of the nearest enclosing list row, if any. */
  get index(): number | undefined {
    for (let i = this.base.length - 1; i >= 0; i--) {
      const s = this.base[i]
      if (typeof s === 'number') return s
    }
    return undefined
  }

  /** Scope of the nearest enclosing list row (this scope when already at a row). */
  get item(): PathScope | undefined {
    for (let i = this.base.length - 1; i >= 0; i--) {
      if (typeof this.base[i] === 'number') return new PathScope(this.root, this.base.slice(0, i + 1))
    }
    return undefined
  }

  /** Scope of the object that contains this one; a row's parent is the object owning the list. */
  get parent(): PathScope {
    const next = this.base.slice(0, -1)
    if (typeof this.base[this.base.length - 1] === 'number') next.pop()
    return new PathScope(this.root, next)
  }

  child(...segments: PathSegment[]): PathScope {
    return new PathScope(this.root, [...this.base, ...segments])
  }

  /** Same location, different root values. */
  withRoot(root: unknown): PathScope {
    return new PathScope(root, this.base)
  }

  /** Resolves a reference to an absolute, concrete (or template) path. */
  resolve(ref: PathInput): PathSegment[] {
    const segments = parsePath(ref)
    let scope: PathScope = this
    let i = 0
    for (; i < segments.length; i++) {
      const s = segments[i]
      if (s === '$root') scope = new PathScope(this.root, [])
      else if (s === '$parent') scope = scope.parent
      else if (s === '$item') scope = scope.item ?? scope
      else break
    }
    return [...scope.base, ...segments.slice(i)]
  }

  get(ref: PathInput): unknown {
    return getAt(this.root, this.resolve(ref))
  }

  /** Returns new root values with `value` written at `ref`. */
  set(ref: PathInput, value: unknown): any {
    return setAt(this.root, this.resolve(ref), value)
  }

  /**
   * Names available to condition and formula expressions at this scope. `$parent` and
   * `$item` are themselves scopes of the same shape, built on first use, so any depth can
   * be reached: `$parent.$parent.$root.region`.
   */
  context(): Record<string, unknown> {
    const value = this.value
    const ctx: Record<string, unknown> = {
      ...value,
      $values: value,
      $root: isContainer(this.root) ? this.root : {},
      $index: this.index,
    }
    Object.defineProperty(ctx, '$parent', { enumerable: true, get: () => this.parent.context() })
    Object.defineProperty(ctx, '$item', { enumerable: true, get: () => this.item?.context() })
    return ctx
  }
}
