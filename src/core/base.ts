import type { StandardSchemaV1 } from '../types/standard'
import type { TypeDescriptor, FieldMetadata, WidgetHint } from '../types/ast'
import { StructValidationError, type StructIssue } from './errors'
import { generateDefaultValue } from '../utils/defaults'
import { cloneDescriptor } from '../utils/clone'
import type { TransformSchema, PipeSchema, TransformFn } from '../builders/transform'

export type { TransformFn }

type TransformCreator = <TInput, TOutput, TNext>(
  inner: BaseSchema<TInput, TOutput>,
  fn: (value: TOutput) => TNext | Promise<TNext>,
) => TransformSchema<TInput, TNext>

type PipeCreator = <TInput, TIntermediate, TNextOutput>(
  a: BaseSchema<TInput, TIntermediate>,
  b: BaseSchema<TIntermediate, TNextOutput>,
) => PipeSchema<TInput, TNextOutput>

let _transformCreator: TransformCreator | undefined
let _pipeCreator: PipeCreator | undefined

export function registerTransformCreators(
  transformCreator: TransformCreator,
  pipeCreator: PipeCreator,
): void {
  _transformCreator = transformCreator
  _pipeCreator = pipeCreator
}

export type RefinementIssue = { message?: string; path?: (string | number)[] }

export type RefinementFn<T> = (
  value: T,
) =>
  | boolean
  | Promise<boolean>
  | string
  | undefined
  | void
  | RefinementIssue
  | RefinementIssue[]
  | Promise<boolean | string | undefined | void | RefinementIssue | RefinementIssue[]>

export interface Refinement<T> {
  fn: RefinementFn<T>
  message?: string
  path?: (string | number)[]
}

export type ValidateResult<T> =
  | { value: T; issues?: undefined }
  | { value?: undefined; issues: StructIssue[] }

export type ValidateAsyncResult<T> = Promise<ValidateResult<T>>

export type SafeParseResult<T> =
  | { success: true; data: T; issues?: undefined }
  | {
      success: false
      data?: undefined
      error: StructValidationError
      issues: StructIssue[]
    }

function deduplicateIssues(issues: StructIssue[]): StructIssue[] {
  const seen = new Set<string>()
  const result: StructIssue[] = []
  for (const issue of issues) {
    const pathStr = JSON.stringify(issue.path ?? [])
    const key = `${pathStr}|${issue.code ?? ''}|${issue.message}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(issue)
    }
  }
  return result
}

function processRefinementResult(
  res: unknown,
  refinement: Refinement<any>,
  path: ReadonlyArray<string | number>,
  defaultFallback = 'Validation refinement failed',
): StructIssue[] {
  const targetPath = refinement.path ? [...path, ...refinement.path] : path
  const issues: StructIssue[] = []

  if (res === false) {
    issues.push({
      path: targetPath,
      message: refinement.message ?? defaultFallback,
      code: 'custom_refinement',
    })
  } else if (typeof res === 'string') {
    issues.push({
      path: targetPath,
      message: res,
      code: 'custom_refinement',
    })
  } else if (Array.isArray(res)) {
    for (const item of res) {
      issues.push({
        path: item.path ? [...path, ...item.path] : targetPath,
        message: item.message ?? refinement.message ?? defaultFallback,
        code: 'custom_refinement',
      })
    }
  } else if (typeof res === 'object' && res !== null && ('message' in res || 'path' in res)) {
    const item = res as { path?: (string | number)[]; message?: string }
    issues.push({
      path: item.path ? [...path, ...item.path] : targetPath,
      message: item.message ?? refinement.message ?? defaultFallback,
      code: 'custom_refinement',
    })
  }
  return issues
}

function createRefinementErrorIssue(
  err: unknown,
  refinement: Refinement<any>,
  path: ReadonlyArray<string | number>,
): StructIssue {
  const targetPath = refinement.path ? [...path, ...refinement.path] : path
  return {
    path: targetPath,
    message: err instanceof Error ? err.message : String(err),
    code: 'custom_refinement',
  }
}

export abstract class BaseSchema<
  TInput,
  TOutput
> {
  declare readonly _input: TInput
  declare readonly _output: TOutput

  public descriptor: TypeDescriptor
  protected refinements: Refinement<TOutput>[] = []

  constructor(descriptor: TypeDescriptor) {
    this.descriptor = descriptor
  }

  public get ['~standard'](): StandardSchemaV1.Props<TInput, TOutput> {
    return {
      version: 1,
      vendor: 'collidor-struct',
      validate: (value: unknown) => {
        const result = this.safeParse(value)
        if (result.success) {
          return { value: result.data }
        }
        return {
          issues: result.issues.map((iss) => ({
            message: iss.message,
            path: iss.path?.map((p) => ({ key: p })),
          })),
        }
      },
      types: {
        input: undefined as unknown as TInput,
        output: undefined as unknown as TOutput,
      },
    }
  }

  /**
   * Internal validation method implemented by each concrete schema.
   */
  abstract _validate(
    value: unknown,
    path?: ReadonlyArray<string | number>,
  ): ValidateResult<TOutput>

  /**
   * Internal asynchronous validation method, overridden by container and transform schemas.
   */
  public async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<TOutput> {
    return this._validate(value, path)
  }

  /**
   * Validates data synchronously, returning typed output or throwing StructValidationError.
   */
  public parse(value: unknown): TOutput {
    const res = this.safeParse(value)
    if (!res.success) {
      throw res.error
    }
    return res.data
  }

  /**
   * Checks required, optional, and nullable preconditions before full validation.
   */
  private _checkRequiredOrNullable(
    value: unknown,
    path: ReadonlyArray<string | number>,
  ): { value: TOutput; issues?: undefined } | { value?: undefined; issues: StructIssue[] } | undefined {
    if (value === undefined) {
      if (this.descriptor.optional) {
        return { value: undefined as unknown as TOutput }
      }
      if (this.descriptor.messages?.required || path.length > 0) {
        const key = path.length > 0 ? path[path.length - 1] : undefined
        const defaultMsg =
          typeof key === 'string' ? `Field "${key}" is required` : 'Value is required'
        return {
          issues: [
            {
              path,
              message: this.descriptor.messages?.required ?? defaultMsg,
              code: 'required',
            },
          ],
        }
      }
    }

    if (value === null) {
      if (this.descriptor.nullable || this.descriptor.kind === 'null') {
        return { value: null as unknown as TOutput }
      }
    }

    return undefined
  }

  /**
   * Internal validation runner that executes _validate and evaluates registered refinements,
   * propagating path hierarchy for nested structures.
   */
  public _validateWithRefinements(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<TOutput> {
    if (value === undefined && this.descriptor.default !== undefined) {
      const def =
        typeof this.descriptor.default === 'function'
          ? this.descriptor.default()
          : cloneDescriptor(this.descriptor.default)
      return { value: def as TOutput }
    }

    const preamble = this._checkRequiredOrNullable(value, path)
    if (preamble) return preamble

    const validation = this._validate(value, path)
    if (validation.issues && validation.issues.length > 0) {
      return { issues: validation.issues }
    }

    const validatedVal = validation.value as TOutput

    // Run synchronous refinements
    if (this.refinements.length > 0) {
      const issues: StructIssue[] = []
      for (const refinement of this.refinements) {
        try {
          const res = refinement.fn(validatedVal)
          issues.push(
            ...processRefinementResult(res, refinement, path, 'Validation refinement failed'),
          )
        } catch (err) {
          issues.push(createRefinementErrorIssue(err, refinement, path))
        }
      }

      if (issues.length > 0) {
        return { issues: deduplicateIssues(issues) }
      }
    }

    return { value: validatedVal }
  }

  /**
   * Internal asynchronous validation runner supporting async transforms and async refinements.
   */
  public async _validateWithRefinementsAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<TOutput> {
    if (value === undefined && this.descriptor.default !== undefined) {
      const def =
        typeof this.descriptor.default === 'function'
          ? await this.descriptor.default()
          : cloneDescriptor(this.descriptor.default)
      return { value: def as TOutput }
    }

    const preamble = this._checkRequiredOrNullable(value, path)
    if (preamble) return preamble

    const validation = await this._validateAsync(value, path)
    if (validation.issues && validation.issues.length > 0) {
      return { issues: validation.issues }
    }

    const validatedVal = validation.value as TOutput

    // Run refinements (awaiting each)
    if (this.refinements.length > 0) {
      const issues: StructIssue[] = []
      for (const refinement of this.refinements) {
        try {
          const res = await refinement.fn(validatedVal)
          issues.push(
            ...processRefinementResult(res, refinement, path, 'Async validation refinement failed'),
          )
        } catch (err) {
          issues.push(createRefinementErrorIssue(err, refinement, path))
        }
      }

      if (issues.length > 0) {
        return { issues: deduplicateIssues(issues) }
      }
    }

    return { value: validatedVal }
  }

  /**
   * Validates data synchronously, returning a result object.
   */
  public safeParse(value: unknown): SafeParseResult<TOutput> {
    const res = this._validateWithRefinements(value, [])
    if (res.issues) {
      return {
        success: false,
        issues: res.issues,
        error: new StructValidationError(res.issues),
      }
    }
    return { success: true, data: res.value }
  }

  /**
   * Validates data asynchronously.
   */
  public async safeParseAsync(value: unknown): Promise<SafeParseResult<TOutput>> {
    const res = await this._validateWithRefinementsAsync(value, [])
    if (res.issues) {
      return {
        success: false,
        issues: res.issues,
        error: new StructValidationError(res.issues),
      }
    }
    return { success: true, data: res.value }
  }

  public async parseAsync(value: unknown): Promise<TOutput> {
    const res = await this.safeParseAsync(value)
    if (!res.success) {
      throw res.error
    }
    return res.data
  }

  /**
   * Generates a fully-populated default value according to the schema.
   */
  public createDefault(): TOutput {
    return generateDefaultValue(this.descriptor) as TOutput
  }

  /**
   * Serializes a validated data instance to JSON string.
   */
  public serialize(data: TOutput): string {
    const parsed = this.parse(data)
    return JSON.stringify(parsed, null, 2)
  }

  /**
   * Deserializes and validates a JSON string into typed data.
   */
  public deserialize(json: string): TOutput {
    const raw = JSON.parse(json)
    return this.parse(raw)
  }

  /**
   * Returns the serializable AST descriptor.
   */
  public toJSON(): TypeDescriptor {
    return JSON.parse(JSON.stringify(this.descriptor))
  }

  // --- Modifiers ---

  public optional(): BaseSchema<TInput | undefined, TOutput | undefined> {
    const clone = this._clone()
    clone.descriptor.optional = true
    return clone as unknown as BaseSchema<TInput | undefined, TOutput | undefined>
  }

  public nullable(): BaseSchema<TInput | null, TOutput | null> {
    const clone = this._clone()
    clone.descriptor.nullable = true
    return clone as unknown as BaseSchema<TInput | null, TOutput | null>
  }

  public nullish(): BaseSchema<TInput | null | undefined, TOutput | null | undefined> {
    const clone = this._clone()
    clone.descriptor.optional = true
    clone.descriptor.nullable = true
    return clone as unknown as BaseSchema<TInput | null | undefined, TOutput | null | undefined>
  }

  public default(value: TOutput | (() => TOutput)): BaseSchema<TInput | undefined, TOutput> {
    const clone = this._clone()
    clone.descriptor.default = value
    return clone as unknown as BaseSchema<TInput | undefined, TOutput>
  }

  public label(label: string): this {
    const clone = this._clone()
    clone.descriptor.metadata = { ...clone.descriptor.metadata, label }
    clone.descriptor.title = label
    return clone as this
  }

  public description(description: string): this {
    const clone = this._clone()
    clone.descriptor.description = description
    clone.descriptor.metadata = { ...clone.descriptor.metadata, description }
    return clone as this
  }

  public describe(description: string): this {
    return this.description(description)
  }

  public placeholder(placeholder: string): this {
    const clone = this._clone()
    clone.descriptor.metadata = { ...clone.descriptor.metadata, placeholder }
    return clone as this
  }

  public widget(widget: WidgetHint, props?: Record<string, unknown>): this {
    const clone = this._clone()
    clone.descriptor.metadata = {
      ...clone.descriptor.metadata,
      widget,
      widgetProps: props ?? clone.descriptor.metadata?.widgetProps,
    }
    return clone as this
  }

  public meta(metadata: FieldMetadata): this {
    const clone = this._clone()
    clone.descriptor.metadata = { ...clone.descriptor.metadata, ...metadata }
    return clone as this
  }

  protected _setMetadata(metadata: Partial<FieldMetadata>): this {
    const clone = this._clone()
    clone.descriptor.metadata = { ...clone.descriptor.metadata, ...metadata }
    return clone as this
  }

  public colSpan(colSpan: number): this {
    return this._setMetadata({ colSpan })
  }

  public section(section: string): this {
    return this._setMetadata({ section })
  }

  public group(group: string): this {
    return this._setMetadata({ group })
  }

  public helpText(helpText: string): this {
    return this._setMetadata({ helpText })
  }

  public hidden(hidden = true): this {
    return this._setMetadata({ hidden })
  }

  public disabled(disabled = true): this {
    return this._setMetadata({ disabled })
  }

  public readonly(readonly = true): this {
    return this._setMetadata({ readonly })
  }

  public refine(
    fn: RefinementFn<TOutput>,
    messageOrOptions?: string | { message?: string; path?: (string | number)[] },
  ): this {
    const clone = this._clone()
    const message =
      typeof messageOrOptions === 'string' ? messageOrOptions : messageOrOptions?.message
    const path = typeof messageOrOptions === 'object' ? messageOrOptions.path : undefined
    clone.refinements.push({ fn, message, path })
    return clone as this
  }

  public transform<TNext>(
    fn: (value: TOutput) => TNext | Promise<TNext>,
  ): TransformSchema<TInput, TNext> {
    if (!_transformCreator) {
      throw new Error('Transform creator has not been registered.')
    }
    return _transformCreator(this, fn)
  }

  public pipe<TNextOutput>(
    targetSchema: BaseSchema<TOutput, TNextOutput>,
  ): PipeSchema<TInput, TNextOutput> {
    if (!_pipeCreator) {
      throw new Error('Pipe creator has not been registered.')
    }
    return _pipeCreator(this, targetSchema)
  }

  protected _clone(): this {
    const constr = this.constructor as new (desc: TypeDescriptor) => this
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new constr(newDesc)
    clone.refinements = [...this.refinements]
    return clone
  }
}

