// oxlint-disable typescript/no-explicit-any
import type { FormNode, FormNodeTree } from '../types'
import { formatPath, parsePath, setAt, type PathSegment } from '../paths'
import { indexFieldNodes, relativizeNodes, rowDefaults } from '../relative'
import { FormSession, issuesUnder, type FormIssue, type FormSessionOptions, type FormSource } from './session'

export interface ScopedFormOptions<T> extends FormSessionOptions<T> {
  /** Fields to use when the list field carries no row template (for example a hand-written tree). */
  fallbackNodes?: () => FormNode[]
}

/**
 * A draft of one row of a list. Edits stay in the draft until `commit()` writes the row back to
 * its parent; `discard()` (or just dropping it) leaves the form untouched.
 *
 * Validation runs on the WHOLE form with this draft substituted in, then keeps the issues under
 * the row. So a condition that looks at another list, at `$root`, or at the row's parent behaves
 * exactly as it does for the form itself. A draft can open drafts of its own lists, to any depth.
 */
export class ScopedFormController<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends FormSession<T> {
  public readonly isNew: boolean
  /** Row position in its list. For a new row, where it will be added. */
  public readonly index: number
  private draft: T
  private readonly initial: string
  private readonly rowPath: string
  private readonly fallbackNodes?: () => FormNode[]

  constructor(
    public readonly parent: FormSession<any>,
    public readonly listPath: string,
    index?: number,
    options: ScopedFormOptions<T> = {},
  ) {
    super(options)
    const list = formatPath(listPath)
    const rows = parent.getValue(list)
    this.isNew = index === undefined
    this.index = index ?? (Array.isArray(rows) ? rows.length : 0)
    this.rowPath = `${list}[${this.index}]`
    this.fallbackNodes = options.fallbackNodes
    this.draft = {} as T
    if (this.isNew) {
      this.draft = rowDefaults(this.getTree().nodes) as T
    } else {
      const existing = Array.isArray(rows) ? rows[this.index] : undefined
      this.draft = (existing && typeof existing === 'object' ? structuredClone(existing) : {}) as T
    }
    this.initial = JSON.stringify(this.draft)
  }

  protected read(): T {
    return this.draft
  }

  protected write(next: T): void {
    this.draft = next
  }

  public get source(): FormSource {
    return this.parent.source
  }

  public get base(): PathSegment[] {
    return [...this.parent.base, ...parsePath(this.rowPath)]
  }

  public readRoot(): unknown {
    return setAt(this.parent.readRoot(), this.base, this.draft)
  }

  /** This row's fields, with paths relative to the row. */
  public getTree(): FormNodeTree {
    const list = this.parent.findField(formatPath(this.listPath))
    const resolved = list?.resolveItem?.(this.readRoot(), formatPath(this.base))
    const item = resolved ?? list?.item
    let nodes: FormNode[] = []
    if (list && item?.children?.length) {
      // A resolved subtree has paths from the form root. The static template was already made
      // relative to the parent row, if the parent is a draft too.
      const prefix = `${resolved ? (list.absPath ?? list.path) : list.path}[].`
      nodes = relativizeNodes(item.children, prefix)
    } else if (this.fallbackNodes) {
      nodes = this.fallbackNodes()
    }
    return { nodes, fieldsByKey: indexFieldNodes(nodes) }
  }

  protected issues(): FormIssue[] {
    const result = this.source.safeParse(this.readRoot())
    return result.success ? [] : issuesUnder(result.issues, this.base)
  }

  protected isDirty(): boolean {
    return JSON.stringify(this.draft) !== this.initial
  }

  /** The draft of a list inside this row. */
  public scoped<R extends Record<string, unknown> = Record<string, unknown>>(
    listPath: string,
    index?: number,
    options?: ScopedFormOptions<R>,
  ): ScopedFormController<R> {
    return new ScopedFormController<R>(this, listPath, index, options)
  }

  /** Validates the row and, if it is fine, writes it back to the list. Returns whether it did. */
  public commit(): boolean {
    if (!this.validate()) return false
    this.parent.setValue(this.rowPath, this.draft)
    return true
  }

  /** Drops the draft. The form is unchanged. */
  public discard(): void {
    this.listeners.clear()
    this.watchers.clear()
    this.valueListeners.clear()
    this.draft = JSON.parse(this.initial) as T
  }
}
