// oxlint-disable typescript/no-explicit-any
import type { FormStructSchema } from '../builders/formStruct'
import type { FormNodeTree, FormNode, FormLayoutNode } from '../types'
import { isLayoutContainerNode } from '../nodes/layout'

export interface FormControllerOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  initialValues?: Partial<T>
  onSubmit?: (values: T) => void | Promise<void>
  onChange?: (values: T, changedPath: string) => void
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
  tree: FormNodeTree
}

/**
 * Stateful, framework-agnostic form controller managing reactive state,
 * path mutations, array item operations, wizard step navigation, and validation.
 */
export class HeadlessFormController<T extends Record<string, unknown> = Record<string, unknown>> {
  public readonly schema: FormStructSchema<any>
  private values: T
  private initialValues: T
  private errors: Record<string, string[]> = {}
  private touched = new Set<string>()
  private isSubmitting = false
  private currentStep = 0
  private listeners = new Set<(state: FormState<T>) => void>()
  private onSubmitCallback?: (values: T) => void | Promise<void>
  private onChangeCallback?: (values: T, changedPath: string) => void

  constructor(schema: FormStructSchema<any>, options: FormControllerOptions<T> = {}) {
    this.schema = schema
    this.initialValues = (options.initialValues ? { ...options.initialValues } : {}) as T
    this.values = { ...this.initialValues }
    this.onSubmitCallback = options.onSubmit
    this.onChangeCallback = options.onChange
  }

  public getValues(): T {
    return { ...this.values }
  }

  public getValue(path: string): unknown {
    const parts = path.split('.')
    let current: unknown = this.values
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }
    return current
  }

  public setValue(path: string, value: unknown): void {
    const parts = path.split('.')
    const root = { ...this.values } as Record<string, unknown>
    let current: Record<string, unknown> = root

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {}
      } else {
        current[part] = { ...(current[part] as Record<string, unknown>) }
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts[parts.length - 1]] = value
    this.values = root as T
    this.touched.add(path)

    // Re-validate field
    this.validatePath(path)

    this.onChangeCallback?.(this.values, path)
    this.notify()
  }

  public setValues(newValues: Partial<T>): void {
    this.values = { ...this.values, ...newValues }
    this.notify()
  }

  public getErrors(): Record<string, string[]> {
    return { ...this.errors }
  }

  public isFieldTouched(path: string): boolean {
    return this.touched.has(path)
  }

  public isDirty(): boolean {
    return JSON.stringify(this.values) !== JSON.stringify(this.initialValues)
  }

  public isValid(): boolean {
    return Object.keys(this.errors).length === 0
  }

  public getCurrentStep(): number {
    return this.currentStep
  }

  public getTotalSteps(): number {
    const stepsNode = this._findStepsNode()
    if (!stepsNode) return 1
    return Object.keys(stepsNode.shape).length
  }

  private _findStepsNode(): { shape: Record<string, any> } | undefined {
    for (const item of Object.values(this.schema.shape)) {
      if (isLayoutContainerNode(item) && item.layoutKind === 'steps') {
        return item
      }
    }
    return undefined
  }

  public nextStep(): boolean {
    const total = this.getTotalSteps()
    if (this.currentStep < total - 1) {
      const valid = this.validateStep(this.currentStep)
      if (valid) {
        this.currentStep++
        this.notify()
        return true
      }
      return false
    }
    return false
  }

  public prevStep(): boolean {
    if (this.currentStep > 0) {
      this.currentStep--
      this.notify()
      return true
    }
    return false
  }

  public goToStep(stepIndex: number): boolean {
    const total = this.getTotalSteps()
    if (stepIndex >= 0 && stepIndex < total) {
      this.currentStep = stepIndex
      this.notify()
      return true
    }
    return false
  }

  public validate(): boolean {
    const result = this.schema.safeParse(this.values)
    this.errors = {}
    if (!result.success) {
      for (const issue of result.issues) {
        const p = issue.path?.join('.') || '_root'
        if (!this.errors[p]) this.errors[p] = []
        this.errors[p].push(issue.message)
      }
    }
    this.notify()
    return result.success
  }

  public validatePath(path: string): boolean {
    const result = this.schema.safeParse(this.values)
    delete this.errors[path]
    if (!result.success) {
      for (const issue of result.issues) {
        const p = issue.path?.join('.') || '_root'
        if (p === path) {
          if (!this.errors[path]) this.errors[path] = []
          this.errors[path].push(issue.message)
        }
      }
    }
    return !this.errors[path]
  }

  public validateStep(stepIndex: number): boolean {
    const stepsNode = this._findStepsNode()
    if (!stepsNode) return this.validate()

    const stepKeys = Object.keys(stepsNode.shape)
    const targetKey = stepKeys[stepIndex]
    if (!targetKey) return true

    const stepItem = stepsNode.shape[targetKey]
    const stepFields: string[] = []

    const collectKeys = (shape: Record<string, any>) => {
      for (const [k, val] of Object.entries(shape)) {
        if (isLayoutContainerNode(val)) {
          collectKeys(val.shape)
        } else {
          stepFields.push(k)
        }
      }
    }

    if (isLayoutContainerNode(stepItem)) {
      collectKeys(stepItem.shape)
    }

    const result = this.schema.safeParse(this.values)
    let stepValid = true

    for (const f of stepFields) {
      delete this.errors[f]
    }

    if (!result.success) {
      for (const issue of result.issues) {
        const p = issue.path?.join('.') || ''
        if (stepFields.includes(p)) {
          if (!this.errors[p]) this.errors[p] = []
          this.errors[p].push(issue.message)
          stepValid = false
        }
      }
    }

    this.notify()
    return stepValid
  }

  // -------------------------------------------------------------------------
  // Collection / Array Operations
  // -------------------------------------------------------------------------

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
    if (
      fromIndex >= 0 &&
      fromIndex < arr.length &&
      toIndex >= 0 &&
      toIndex < arr.length &&
      fromIndex !== toIndex
    ) {
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

  // -------------------------------------------------------------------------
  // State Snapshot & Subscriptions
  // -------------------------------------------------------------------------

  public getState(): FormState<T> {
    const tree = this.schema.toFormTree(this.values)
    return {
      values: this.getValues(),
      errors: this.getErrors(),
      touched: Array.from(this.touched),
      dirty: this.isDirty(),
      isValid: this.isValid(),
      isSubmitting: this.isSubmitting,
      currentStep: this.currentStep,
      totalSteps: this.getTotalSteps(),
      tree,
    }
  }

  public subscribe(listener: (state: FormState<T>) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    const state = this.getState()
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  public async submit(): Promise<T> {
    this.isSubmitting = true
    this.notify()

    try {
      const valid = this.validate()
      if (!valid) {
        throw new Error('Form validation failed')
      }
      if (this.onSubmitCallback) {
        await this.onSubmitCallback(this.values)
      }
      return this.values
    } finally {
      this.isSubmitting = false
      this.notify()
    }
  }
}

export function createFormController<T extends Record<string, unknown> = Record<string, unknown>>(
  schema: FormStructSchema<any>,
  options?: FormControllerOptions<T>,
): HeadlessFormController<T> {
  return new HeadlessFormController(schema, options)
}
