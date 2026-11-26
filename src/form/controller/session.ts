// oxlint-disable typescript/no-explicit-any
import type { FormContext, FormFieldNode, FormLayoutNode, FormNode, FormNodeTree } from '../types'
import { PathScope, formatPath, getAt, parsePath, setAt, startsWithTemplate, type PathSegment } from '../paths'
import { findFieldNode, flattenFieldNodes } from '../relative'
import type { ScopedFormController, ScopedFormOptions } from './scopedController'

/** What a controller needs from a form: its tree for some values, and validation. */
export interface FormSource {
  toFormTree(values: Record<string, unknown>, context?: Partial<FormContext>): FormNodeTree
  safeParse(value: unknown):
    | { success: true; data: any; issues?: undefined }
    | { success: false; issues: FormIssue[] }
}

export interface FormIssue {
  path?: ReadonlyArray<string | number | { key: PropertyKey }>
  message: string
}

export interface FormSessionOptions<T> {
  /**
   * Re-check a field each time it is written (default). When false, writing only clears that
   * field's error, and errors come back with the next explicit `validate()`.
   */
  validateOnChange?: boolean
  onChange?: (values: T, changedPath: string) => void
  /** A step could not be left: `errors` maps each failing field path to its message. */
  onStepError?: (containerId: string, stepKey: string, errors: Record<string, string>) => void
}

export interface FormState<T extends Record<string, unknown> = Record<string, unknown>> {
  values: T
  errors: Record<string, string[]>
  touched: string[]
  dirty: boolean
  isValid: boolean
  isSubmitting: boolean
  currentStep: number
  totalSteps: number
  /** Active step of every `steps` container, by node id. */
  activeSteps: Record<string, number>
  /** Active tab of every `tabs` container, by node id. */
  activeTabs: Record<string, string>
  /** Panels the user has opened or closed in `accordion` containers, by container id then panel key. */
  openPanels: Record<string, Record<string, boolean>>
  /** Messages that stopped the user leaving a step, by container id. */
  stepErrors: Record<string, string[]>
  tree: FormNodeTree
}

export class FormValidationError extends Error {
  constructor(
    public readonly errors: Record<string, string[]>,
    public readonly issues: FormIssue[],
  ) {
    super('Form validation failed')
    this.name = 'FormValidationError'
  }
}

const STEP_KINDS = ['steps', 'wizard']

function issuePath(issue: FormIssue): Array<string | number> {
  return (issue.path ?? []).map((segment) =>
    typeof segment === 'object' && segment !== null ? (segment.key as string | number) : (segment as string | number),
  )
}

/** Paths in `issues` at or below `base`, made relative to it. */
export function issuesUnder(issues: FormIssue[], base: readonly PathSegment[]): FormIssue[] {
  return issues.flatMap((issue) => {
    const path = issuePath(issue)
    const below = base.every((segment, i) => String(path[i]) === String(segment))
    return below ? [{ ...issue, path: path.slice(base.length) }] : []
  })
}

/**
 * State and behaviour shared by the root form controller and the drafts of list rows.
 *
 * A subclass says where its values live, how to read the whole form's current values (so
 * conditions can look anywhere), and how to validate. Everything else is common: path
 * reads and writes, errors, touched fields, steps and tabs of any container, list operations.
 */
export abstract class FormSession<T extends Record<string, unknown> = Record<string, unknown>> {
  protected errors: Record<string, string[]> = {}
  protected touched = new Set<string>()
  protected activeSteps: Record<string, number> = {}
  protected activeTabs: Record<string, string> = {}
  protected openPanels: Record<string, Record<string, boolean>> = {}
  protected stepErrors: Record<string, string[]> = {}
  protected isSubmitting = false
  protected listeners = new Set<(state: FormState<T>) => void>()
  protected watchers = new Set<() => void>()
  protected valueListeners = new Set<(path: string) => void>()
  protected options: FormSessionOptions<T>

  constructor(options: FormSessionOptions<T> = {}) {
    this.options = options
  }

  // --- supplied by the subclass --------------------------------------------------------

  /** The values this session edits, uncopied. */
  protected abstract read(): T
  protected abstract write(next: T): void
  /** Issues for this session's values, with paths relative to them. */
  protected abstract issues(): FormIssue[]
  /** The tree for this session's values. */
  public abstract getTree(): FormNodeTree
  /** The whole form's current values, including any open drafts. */
  public abstract readRoot(): unknown
  /** Where this session's object sits in the whole form. */
  public abstract get base(): PathSegment[]
  protected abstract isDirty(): boolean
  /** The whole form's source: what validates and builds trees. */
  public abstract get source(): FormSource
  /** A draft of one row of a list in this form, for editing in a dialog. Omit `index` for a new row. */
  public abstract scoped<R extends Record<string, unknown> = Record<string, unknown>>(
    listPath: string,
    index?: number,
    options?: ScopedFormOptions<R>,
  ): ScopedFormController<R>

  // --- values --------------------------------------------------------------------------

  public getValues(): T {
    return { ...this.read() }
  }

  public getValue(path: string): unknown {
    return getAt(this.read(), path)
  }

  /** A scope at `path` in the whole form: resolves `$root`, `$parent` and `$item` from there. */
  public scope(path: string = ''): PathScope {
    return new PathScope(this.readRoot(), [...this.base, ...parsePath(path)])
  }

  public setValue(path: string, value: unknown): void {
    // `orders[1].lines[0].sku` and `orders.1.lines.0.sku` name the same value.
    const key = formatPath(path)
    this.write(setAt(this.read(), key, value) as T)
    this.touched.add(key)
    if (this.options.validateOnChange === false) delete this.errors[key]
    else this.validatePath(key)
    this.options.onChange?.(this.read(), key)
    for (const listener of this.valueListeners) listener(key)
    this.notify()
  }

  public setValues(newValues: Partial<T>): void {
    this.write({ ...this.read(), ...newValues })
    this.notify()
  }

  public isFieldTouched(path: string): boolean {
    return this.touched.has(formatPath(path))
  }

  // --- errors --------------------------------------------------------------------------

  public getErrors(): Record<string, string[]> {
    return { ...this.errors }
  }

  /** The first message for a field, if it has any. */
  public getFieldError(path: string): string | undefined {
    return this.errors[formatPath(path)]?.[0]
  }

  public setErrors(errors: Record<string, string[]>): void {
    this.errors = { ...errors }
    this.notify()
  }

  public isValid(): boolean {
    return Object.keys(this.errors).length === 0
  }

  public validate(): boolean {
    const issues = this.issues()
    this.errors = {}
    for (const issue of issues) this.addError(issue)
    this.notify()
    return issues.length === 0
  }

  public validatePath(path: string): boolean {
    const key = formatPath(path)
    delete this.errors[key]
    for (const issue of this.issues()) {
      if (formatPath(issuePath(issue)) === key) this.addError(issue)
    }
    return !this.errors[key]
  }

  protected addError(issue: FormIssue): void {
    const path = issuePath(issue)
    const key = path.length ? formatPath(path) : '_root'
    ;(this.errors[key] ??= []).push(issue.message)
  }

  // --- tree and layout containers ------------------------------------------------------

  /** The field node with exactly this path, wherever it sits in layouts or nested objects. */
  public findField(path: string): FormFieldNode | undefined {
    return findFieldNode(this.getTree().nodes, path)
  }

  /** The layout node (`steps`, `tabs`, ...) with this id. */
  public findContainer(id: string, kinds?: string[]): FormLayoutNode | undefined {
    const walk = (nodes: FormNode[]): FormLayoutNode | undefined => {
      for (const node of nodes) {
        if (node.kind === 'layout') {
          if (node.id === id && (!kinds || kinds.includes(node.layoutKind))) return node
          const inner = walk(node.children)
          if (inner) return inner
        } else if (node.kind === 'field' && node.children) {
          const inner = walk(node.children)
          if (inner) return inner
        }
      }
      return undefined
    }
    return walk(this.getTree().nodes)
  }

  /** The first `steps` container, which the single-wizard API (no id) refers to. */
  protected firstStepsId(): string | undefined {
    const walk = (nodes: FormNode[]): string | undefined => {
      for (const node of nodes) {
        if (node.kind === 'layout') {
          if (STEP_KINDS.includes(node.layoutKind)) return node.id
          const inner = walk(node.children)
          if (inner) return inner
        }
      }
      return undefined
    }
    return walk(this.getTree().nodes)
  }

  /** Field paths in `node`, by template. A step owns these and everything below them. */
  protected fieldPathsIn(node: FormNode): string[] {
    return flattenFieldNodes(node.kind === 'field' ? [node] : node.kind === 'layout' ? node.children : []).map(
      (field) => field.path,
    )
  }

  // --- steps ---------------------------------------------------------------------------

  public getStep(containerId?: string): number {
    const id = containerId ?? this.firstStepsId()
    return id === undefined ? 0 : (this.activeSteps[id] ?? 0)
  }

  public getCurrentStep(): number {
    return this.getStep()
  }

  public getTotalSteps(containerId?: string): number {
    const id = containerId ?? this.firstStepsId()
    const node = id === undefined ? undefined : this.findContainer(id, STEP_KINDS)
    return node ? node.children.length : 1
  }

  /**
   * Validates step `index` of a container. Only the fields inside that step are checked, and
   * only their errors are replaced. Returns whether the step is fine to leave.
   */
  public validateStep(index: number, containerId?: string): boolean {
    return this.checkStep(index, containerId, () => this.issues())
  }

  /**
   * `issues` is a thunk so a caller that checks several steps in a row (a jump forward) can hand
   * every check the same result, parsing the whole form once instead of once per step.
   */
  private checkStep(index: number, containerId: string | undefined, issues: () => FormIssue[]): boolean {
    const id = containerId ?? this.firstStepsId()
    const container = id === undefined ? undefined : this.findContainer(id, STEP_KINDS)
    if (!container) return this.validate()
    const step = container.children[index]
    if (!step) return true

    const fields = this.fieldPathsIn(step)
    const inStep = (path: string) => fields.some((field) => startsWithTemplate(path, field))

    for (const existing of Object.keys(this.errors)) {
      if (inStep(existing)) delete this.errors[existing]
    }
    const failing: Record<string, string> = {}
    for (const issue of issues()) {
      const path = formatPath(issuePath(issue))
      if (path && inStep(path)) {
        this.addError(issue)
        failing[path] ??= issue.message
      }
    }

    if (Object.keys(failing).length > 0) {
      this.stepErrors = { ...this.stepErrors, [container.id]: Object.values(failing) }
      this.options.onStepError?.(container.id, step.key, failing)
      this.notify()
      return false
    }
    const { [container.id]: _cleared, ...rest } = this.stepErrors
    this.stepErrors = rest
    this.notify()
    return true
  }

  /**
   * Moves a container to step `target`. Going forward checks each step on the way unless the
   * container opts out (`validateOnNext: false`); a failing step stops the move and becomes the
   * active step. Returns whether the target was reached.
   */
  public setStep(target: number, containerId?: string): boolean {
    const id = containerId ?? this.firstStepsId()
    const container = id === undefined ? undefined : this.findContainer(id, STEP_KINDS)
    if (!container || id === undefined) return false
    if (target < 0 || target >= container.children.length) return false

    const current = this.activeSteps[id] ?? 0
    if (target > current && container.options?.validateOnNext !== false) {
      // the values do not change while we check, so one parse serves every step on the way
      let parsed: FormIssue[] | undefined
      const issues = () => (parsed ??= this.issues())
      for (let i = current; i < target; i++) {
        if (!this.checkStep(i, id, issues)) {
          this.activeSteps = { ...this.activeSteps, [id]: i }
          this.notify()
          return false
        }
      }
    }
    const { [id]: _cleared, ...rest } = this.stepErrors
    this.stepErrors = rest
    this.activeSteps = { ...this.activeSteps, [id]: target }
    this.notify()
    return true
  }

  public nextStep(containerId?: string): boolean {
    const id = containerId ?? this.firstStepsId()
    if (id === undefined) return false
    const current = this.activeSteps[id] ?? 0
    return current < this.getTotalSteps(id) - 1 ? this.setStep(current + 1, id) : false
  }

  public prevStep(containerId?: string): boolean {
    const id = containerId ?? this.firstStepsId()
    if (id === undefined) return false
    const current = this.activeSteps[id] ?? 0
    return current > 0 ? this.setStep(current - 1, id) : false
  }

  public goToStep(stepIndex: number, containerId?: string): boolean {
    return this.setStep(stepIndex, containerId)
  }

  // --- accordions ----------------------------------------------------------------------

  /**
   * Whether a panel of an accordion is open: what the user chose, else the panel's own
   * `defaultOpen`, else the accordion's, else closed.
   */
  public isOpen(containerId: string, panelKey: string): boolean {
    const chosen = this.openPanels[containerId]?.[panelKey]
    if (chosen !== undefined) return chosen
    const container = this.findContainer(containerId, ['accordion'])
    const panel = container?.children.find((child) => child.key === panelKey)
    const own = panel?.kind === 'layout' ? panel.options?.defaultOpen : undefined
    return own ?? container?.options?.defaultOpen ?? false
  }

  public setOpen(containerId: string, panelKey: string, open: boolean): void {
    this.openPanels = { ...this.openPanels, [containerId]: { ...this.openPanels[containerId], [panelKey]: open } }
    this.notify()
  }

  public toggleOpen(containerId: string, panelKey: string): void {
    this.setOpen(containerId, panelKey, !this.isOpen(containerId, panelKey))
  }

  /** Messages that stopped the user leaving a step of this container. */
  public getStepErrors(containerId: string): string[] {
    return this.stepErrors[containerId] ?? []
  }

  // --- tabs ----------------------------------------------------------------------------

  /** The active tab key of a container: the chosen one, else its `defaultTab`, else the first tab. */
  public getTab(containerId: string): string | undefined {
    if (this.activeTabs[containerId] !== undefined) return this.activeTabs[containerId]
    const container = this.findContainer(containerId, ['tabs'])
    const wanted = container?.options?.defaultTab
    return container?.children.some((child) => child.key === wanted) ? wanted : container?.children[0]?.key
  }

  public setTab(containerId: string, key: string): void {
    this.activeTabs = { ...this.activeTabs, [containerId]: key }
    this.notify()
  }

  // --- lists ---------------------------------------------------------------------------

  public arrayPush(path: string, item: unknown): void {
    const arr = (this.getValue(path) as unknown[]) || []
    this.setValue(path, [...arr, item])
  }

  public arrayRemove(path: string, index: number): void {
    const arr = (this.getValue(path) as unknown[]) || []
    if (index >= 0 && index < arr.length) {
      const next = [...arr]
      next.splice(index, 1)
      this.setValue(path, next)
    }
  }

  public arrayMove(path: string, fromIndex: number, toIndex: number): void {
    const arr = (this.getValue(path) as unknown[]) || []
    if (fromIndex >= 0 && fromIndex < arr.length && toIndex >= 0 && toIndex < arr.length && fromIndex !== toIndex) {
      const next = [...arr]
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      this.setValue(path, next)
    }
  }

  public arrayDuplicate(path: string, index: number): void {
    const arr = (this.getValue(path) as unknown[]) || []
    if (index >= 0 && index < arr.length) {
      const item = arr[index]
      const cloned = typeof item === 'object' && item !== null ? JSON.parse(JSON.stringify(item)) : item
      const next = [...arr]
      next.splice(index + 1, 0, cloned)
      this.setValue(path, next)
    }
  }

  // --- state and subscriptions ---------------------------------------------------------

  public getState(): FormState<T> {
    return {
      values: this.getValues(),
      errors: this.getErrors(),
      touched: Array.from(this.touched),
      dirty: this.isDirty(),
      isValid: this.isValid(),
      isSubmitting: this.isSubmitting,
      currentStep: this.getCurrentStep(),
      totalSteps: this.getTotalSteps(),
      activeSteps: { ...this.activeSteps },
      activeTabs: { ...this.activeTabs },
      openPanels: { ...this.openPanels },
      stepErrors: { ...this.stepErrors },
      tree: this.getTree(),
    }
  }

  public subscribe(listener: (state: FormState<T>) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Calls `listener` with the path of each value written through `setValue`. Returns an unsubscribe. */
  public onValueChange(listener: (path: string) => void): () => void {
    this.valueListeners.add(listener)
    return () => {
      this.valueListeners.delete(listener)
    }
  }

  /** Calls `listener` whenever anything changes, without building the state. Returns an unsubscribe. */
  public watch(listener: () => void): () => void {
    this.watchers.add(listener)
    return () => {
      this.watchers.delete(listener)
    }
  }

  protected notify(): void {
    for (const watcher of this.watchers) watcher()
    if (this.listeners.size === 0) return
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}
