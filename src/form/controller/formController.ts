// oxlint-disable typescript/no-explicit-any
import type { FormNodeTree } from '../types'
import type { PathSegment } from '../paths'
import { FormSession, FormValidationError, type FormIssue, type FormSessionOptions, type FormSource } from './session'
import { ScopedFormController, type ScopedFormOptions } from './scopedController'

export type { FormState } from './session'

export interface FormControllerOptions<T extends Record<string, unknown> = Record<string, unknown>>
  extends FormSessionOptions<T> {
  initialValues?: Partial<T>
  /** Called with the parsed output (defaults applied, inactive branches dropped). */
  onSubmit?: (values: T) => void | Promise<void>
}

/**
 * Stateful, framework-agnostic controller for a whole form: path-addressed values, errors,
 * steps and tabs of any container, list operations, and drafts of list rows (`scoped`).
 */
export class HeadlessFormController<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends FormSession<T> {
  public readonly schema: FormSource
  private values: T
  private initialValues: T
  private onSubmitCallback?: (values: T) => void | Promise<void>

  constructor(schema: FormSource, options: FormControllerOptions<T> = {}) {
    super(options)
    this.schema = schema
    this.initialValues = (options.initialValues ? { ...options.initialValues } : {}) as T
    this.values = { ...this.initialValues }
    this.onSubmitCallback = options.onSubmit
  }

  protected read(): T {
    return this.values
  }

  protected write(next: T): void {
    this.values = next
  }

  public get source(): FormSource {
    return this.schema
  }

  public get base(): PathSegment[] {
    return []
  }

  public readRoot(): unknown {
    return this.values
  }

  public getTree(): FormNodeTree {
    return this.schema.toFormTree(this.values)
  }

  protected issues(): FormIssue[] {
    const result = this.schema.safeParse(this.values)
    return result.success ? [] : result.issues
  }

  protected isDirty(): boolean {
    return JSON.stringify(this.values) !== JSON.stringify(this.initialValues)
  }

  /** Replaces every value, and forgets errors and touched fields. */
  public reset(values: Partial<T> = {}): void {
    this.initialValues = { ...values } as T
    this.values = { ...values } as T
    this.errors = {}
    this.touched = new Set()
    this.stepErrors = {}
    this.notify()
  }

  /**
   * A draft of one row of a list, for editing in a dialog. `index` omitted means a new row.
   * Nothing reaches the form until `commit()`.
   */
  public scoped<R extends Record<string, unknown> = Record<string, unknown>>(
    listPath: string,
    index?: number,
    options?: ScopedFormOptions<R>,
  ): ScopedFormController<R> {
    return new ScopedFormController<R>(this, listPath, index, options)
  }

  /** Validates, then returns the parsed output; throws a FormValidationError when invalid. */
  public async submit(): Promise<T> {
    this.isSubmitting = true
    this.notify()
    try {
      const result = this.schema.safeParse(this.values)
      this.errors = {}
      if (!result.success) {
        for (const issue of result.issues) this.addError(issue)
        this.notify()
        throw new FormValidationError(this.errors, result.issues)
      }
      const data = result.data as T
      this.errors = {}
      if (this.onSubmitCallback) await this.onSubmitCallback(data)
      return data
    } finally {
      this.isSubmitting = false
      this.notify()
    }
  }
}

export function createFormController<T extends Record<string, unknown> = Record<string, unknown>>(
  schema: FormSource,
  options?: FormControllerOptions<T>,
): HeadlessFormController<T> {
  return new HeadlessFormController(schema, options)
}
