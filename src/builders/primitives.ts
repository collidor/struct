// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult } from '../core/base'
import type {
  StringDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
  DateDescriptor,
  BigIntDescriptor,
  NullDescriptor,
  AnyDescriptor,
  StringFormat,
} from '../types/ast'
import type { StructIssue } from '../core/errors'

export class StringSchema<TInput = string> extends BaseSchema<TInput, string> {
  declare descriptor: StringDescriptor

  constructor(descriptor: Partial<StringDescriptor> = {}) {
    super({
      kind: 'string',
      ...descriptor,
    } as StringDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<string> {
    let strVal = value
    if (this.descriptor.coerce && strVal !== undefined && strVal !== null) {
      strVal = String(strVal)
    }

    if (typeof strVal !== 'string') {
      return {
        issues: [
          {
            path,
            message: `Expected string, received ${strVal === null ? 'null' : typeof strVal}`,
            code: 'invalid_type',
            expected: 'string',
            received: typeof strVal,
          },
        ],
      }
    }

    let sanitized: string = strVal
    if (this.descriptor.trim) {
      sanitized = sanitized.trim()
    }
    if (this.descriptor.toLowerCase) {
      sanitized = sanitized.toLowerCase()
    }
    if (this.descriptor.toUpperCase) {
      sanitized = sanitized.toUpperCase()
    }

    const issues: StructIssue[] = []

    if (this.descriptor.minLength !== undefined && sanitized.length < this.descriptor.minLength) {
      issues.push({
        path,
        message:
          this.descriptor.messages?.min ??
          `String must contain at least ${this.descriptor.minLength} character(s)`,
        code: 'too_small',
      })
    }

    if (this.descriptor.maxLength !== undefined && sanitized.length > this.descriptor.maxLength) {
      issues.push({
        path,
        message:
          this.descriptor.messages?.max ??
          `String must contain at most ${this.descriptor.maxLength} character(s)`,
        code: 'too_big',
      })
    }

    if (this.descriptor.pattern !== undefined) {
      const reg = new RegExp(this.descriptor.pattern)
      if (!reg.test(sanitized)) {
        issues.push({
          path,
          message:
            this.descriptor.messages?.pattern ??
            `String does not match required pattern: ${this.descriptor.pattern}`,
          code: 'invalid_pattern',
        })
      }
    }

    if (this.descriptor.format) {
      switch (this.descriptor.format) {
        case 'email': {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(sanitized)) {
            issues.push({
              path,
              message: this.descriptor.messages?.email ?? 'Invalid email address',
              code: 'invalid_format',
            })
          }
          break
        }
        case 'url': {
          try {
            new URL(sanitized)
          } catch {
            issues.push({
              path,
              message: this.descriptor.messages?.url ?? 'Invalid URL format',
              code: 'invalid_format',
            })
          }
          break
        }
        case 'uuid': {
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          if (!uuidRegex.test(sanitized)) {
            issues.push({
              path,
              message: this.descriptor.messages?.uuid ?? 'Invalid UUID format',
              code: 'invalid_format',
            })
          }
          break
        }
        case 'datetime': {
          if (Number.isNaN(Date.parse(sanitized))) {
            issues.push({
              path,
              message: this.descriptor.messages?.datetime ?? 'Invalid ISO date/time format',
              code: 'invalid_format',
            })
          }
          break
        }
      }
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: sanitized }
  }

  public min(length: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.minLength = length
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, min: message }
    }
    return clone as this
  }

  public max(length: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.maxLength = length
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, max: message }
    }
    return clone as this
  }

  public length(length: number, message?: string): this {
    const msg = message ?? `String must contain exactly ${length} character(s)`
    return this.min(length, msg).max(length, msg)
  }

  public nonempty(message?: string): this {
    return this.min(1, message ?? 'String must not be empty')
  }

  public trim(): this {
    const clone = this._clone()
    clone.descriptor.trim = true
    return clone as this
  }

  public toLowerCase(): this {
    const clone = this._clone()
    clone.descriptor.toLowerCase = true
    return clone as this
  }

  public toUpperCase(): this {
    const clone = this._clone()
    clone.descriptor.toUpperCase = true
    return clone as this
  }

  public regex(pattern: RegExp | string, message?: string): this {
    const clone = this._clone()
    clone.descriptor.pattern = typeof pattern === 'string' ? pattern : pattern.source
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, pattern: message }
    }
    return clone as this
  }

  public email(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'email'
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, email: message }
    }
    return clone as this
  }

  public url(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'url'
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, url: message }
    }
    return clone as this
  }

  public uuid(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'uuid'
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, uuid: message }
    }
    return clone as this
  }

  public datetime(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'datetime'
    clone.descriptor.metadata = { ...clone.descriptor.metadata, widget: 'datetime' }
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, datetime: message }
    }
    return clone as this
  }

  public format(format: StringFormat): this {
    const clone = this._clone()
    clone.descriptor.format = format
    return clone as this
  }

  public password(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'password'
    clone.descriptor.metadata = {
      ...clone.descriptor.metadata,
      widget: 'password',
      widgetProps: { ...clone.descriptor.metadata?.widgetProps, type: 'password' },
    }
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, password: message }
    }
    return clone as this
  }

  public file(message?: string): this {
    const clone = this._clone()
    clone.descriptor.format = 'file'
    clone.descriptor.metadata = { ...clone.descriptor.metadata, widget: 'file' }
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, file: message }
    }
    return clone as this
  }
}

interface BoundsConfig<T extends number | bigint> {
  min?: T
  max?: T
  messages?: { min?: string; max?: string }
  typeLabel: string
  formatVal?: (v: T) => string
}

function validateBounds<T extends number | bigint>(
  val: T,
  config: BoundsConfig<T>,
  path: ReadonlyArray<string | number>,
): StructIssue[] {
  const { min, max, messages, typeLabel, formatVal = (v: T) => String(v) } = config
  const issues: StructIssue[] = []
  if (min !== undefined && val < min) {
    issues.push({
      path,
      message: messages?.min ?? `${typeLabel} must be greater than or equal to ${formatVal(min)}`,
      code: 'too_small',
    })
  }
  if (max !== undefined && val > max) {
    issues.push({
      path,
      message: messages?.max ?? `${typeLabel} must be less than or equal to ${formatVal(max)}`,
      code: 'too_big',
    })
  }
  return issues
}

export class NumberSchema<TInput = number> extends BaseSchema<TInput, number> {
  declare descriptor: NumberDescriptor

  constructor(descriptor: Partial<NumberDescriptor> = {}) {
    super({
      kind: descriptor.integer ? 'integer' : 'number',
      ...descriptor,
    } as NumberDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<number> {
    let numVal = value
    if (this.descriptor.coerce && numVal !== undefined && numVal !== null) {
      if (typeof numVal === 'string' && numVal.trim() !== '') {
        numVal = Number(numVal)
      } else if (typeof numVal === 'boolean') {
        numVal = Number(numVal)
      }
    }

    if (typeof numVal !== 'number' || Number.isNaN(numVal)) {
      return {
        issues: [
          {
            path,
            message: `Expected number, received ${numVal === null ? 'null' : typeof numVal}`,
            code: 'invalid_type',
            expected: 'number',
            received: typeof numVal,
          },
        ],
      }
    }

    const issues: StructIssue[] = []

    if (this.descriptor.integer || this.descriptor.kind === 'integer') {
      if (!Number.isInteger(numVal)) {
        issues.push({
          path,
          message: this.descriptor.messages?.integer ?? 'Expected integer, received float',
          code: 'invalid_type',
        })
      }
    }

    issues.push(
      ...validateBounds(
        numVal,
        {
          min: this.descriptor.min,
          max: this.descriptor.max,
          messages: this.descriptor.messages,
          typeLabel: 'Number',
        },
        path,
      ),
    )

    if (this.descriptor.step !== undefined) {
      const remainder = Math.abs(numVal % this.descriptor.step)
      // Allow slight floating point tolerances
      if (remainder > 1e-10 && Math.abs(remainder - this.descriptor.step) > 1e-10) {
        issues.push({
          path,
          message: this.descriptor.messages?.step ?? `Number must be a multiple of ${this.descriptor.step}`,
          code: 'not_multiple_of',
        })
      }
    }

    if (this.descriptor.positive && numVal <= 0) {
      issues.push({
        path,
        message: this.descriptor.messages?.positive ?? 'Number must be positive',
        code: 'too_small',
      })
    }
    if (this.descriptor.nonnegative && numVal < 0) {
      issues.push({
        path,
        message: this.descriptor.messages?.nonnegative ?? 'Number must be non-negative',
        code: 'too_small',
      })
    }
    if (this.descriptor.negative && numVal >= 0) {
      issues.push({
        path,
        message: this.descriptor.messages?.negative ?? 'Number must be negative',
        code: 'too_big',
      })
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: numVal }
  }

  public min(value: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.min = value
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, min: message }
    }
    return clone as this
  }

  public max(value: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.max = value
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, max: message }
    }
    return clone as this
  }

  public step(step: number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.step = step
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, step: message }
    }
    return clone as this
  }

  public integer(message?: string): this {
    const clone = this._clone()
    clone.descriptor.kind = 'integer'
    clone.descriptor.integer = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, integer: message }
    }
    return clone as this
  }

  public positive(message = 'Number must be positive'): this {
    const clone = this._clone()
    clone.descriptor.positive = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, positive: message }
    }
    return clone as this
  }

  public nonnegative(message = 'Number must be non-negative'): this {
    const clone = this._clone()
    clone.descriptor.nonnegative = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, nonnegative: message }
    }
    return clone as this
  }

  public negative(message = 'Number must be negative'): this {
    const clone = this._clone()
    clone.descriptor.negative = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, negative: message }
    }
    return clone as this
  }

  public between(min: number, max: number, message?: string): this {
    return this.min(min, message).max(max, message)
  }
}

export class BooleanSchema<TInput = boolean> extends BaseSchema<TInput, boolean> {
  declare descriptor: BooleanDescriptor

  constructor(descriptor: Partial<BooleanDescriptor> = {}) {
    super({
      kind: 'boolean',
      ...descriptor,
    } as BooleanDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<boolean> {
    let boolVal = value
    if (this.descriptor.coerce && boolVal !== undefined && boolVal !== null) {
      if (typeof boolVal === 'string') {
        if (boolVal === 'true' || boolVal === '1') boolVal = true
        else if (boolVal === 'false' || boolVal === '0') boolVal = false
        else boolVal = Boolean(boolVal)
      } else {
        boolVal = Boolean(boolVal)
      }
    }

    if (typeof boolVal !== 'boolean') {
      return {
        issues: [
          {
            path,
            message: `Expected boolean, received ${boolVal === null ? 'null' : typeof boolVal}`,
            code: 'invalid_type',
            expected: 'boolean',
            received: typeof boolVal,
          },
        ],
      }
    }
    return { value: boolVal }
  }
}

export class DateSchema<TInput = Date> extends BaseSchema<TInput, Date> {
  declare descriptor: DateDescriptor

  constructor(descriptor: Partial<DateDescriptor> = {}) {
    super({
      kind: 'date',
      ...descriptor,
    } as DateDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<Date> {
    let dateVal = value
    if (this.descriptor.coerce && dateVal !== undefined && dateVal !== null) {
      if (typeof dateVal === 'string' || typeof dateVal === 'number' || dateVal instanceof Date) {
        dateVal = new Date(dateVal)
      }
    }

    if (!(dateVal instanceof Date) || Number.isNaN(dateVal.getTime())) {
      return {
        issues: [
          {
            path,
            message:
              this.descriptor.messages?.invalid_date ??
              `Expected valid Date, received ${dateVal === null ? 'null' : typeof dateVal}`,
            code: 'invalid_date',
            expected: 'Date',
            received: typeof dateVal,
          },
        ],
      }
    }

    const issues: StructIssue[] = []
    const minMs = this.descriptor.min !== undefined ? new Date(this.descriptor.min).getTime() : undefined
    const maxMs = this.descriptor.max !== undefined ? new Date(this.descriptor.max).getTime() : undefined

    issues.push(
      ...validateBounds(
        dateVal.getTime(),
        {
          min: minMs,
          max: maxMs,
          messages: this.descriptor.messages,
          typeLabel: 'Date',
          formatVal: (ms) => new Date(Number(ms)).toISOString(),
        },
        path,
      ),
    )

    if (issues.length > 0) {
      return { issues }
    }

    return { value: dateVal }
  }

  public min(date: Date | string | number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.min = date instanceof Date ? date.toISOString() : date
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, min: message }
    }
    return clone as this
  }

  public max(date: Date | string | number, message?: string): this {
    const clone = this._clone()
    clone.descriptor.max = date instanceof Date ? date.toISOString() : date
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, max: message }
    }
    return clone as this
  }
}

export class BigIntSchema<TInput = bigint> extends BaseSchema<TInput, bigint> {
  declare descriptor: BigIntDescriptor

  constructor(descriptor: Partial<BigIntDescriptor> = {}) {
    super({
      kind: 'bigint',
      ...descriptor,
    } as BigIntDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<bigint> {
    let bigVal = value
    if (this.descriptor.coerce && bigVal !== undefined && bigVal !== null) {
      try {
        if (
          typeof bigVal === 'string' ||
          typeof bigVal === 'number' ||
          typeof bigVal === 'boolean'
        ) {
          bigVal = BigInt(bigVal)
        }
      } catch {
        // Coercion failed
      }
    }

    if (typeof bigVal !== 'bigint') {
      return {
        issues: [
          {
            path,
            message:
              this.descriptor.messages?.invalid_type ??
              `Expected bigint, received ${bigVal === null ? 'null' : typeof bigVal}`,
            code: 'invalid_type',
            expected: 'bigint',
            received: typeof bigVal,
          },
        ],
      }
    }

    const issues: StructIssue[] = []
    const minVal = this.descriptor.min !== undefined ? BigInt(this.descriptor.min) : undefined
    const maxVal = this.descriptor.max !== undefined ? BigInt(this.descriptor.max) : undefined

    issues.push(
      ...validateBounds(
        bigVal,
        {
          min: minVal,
          max: maxVal,
          messages: this.descriptor.messages,
          typeLabel: 'BigInt',
          formatVal: (b) => `${b}n`,
        },
        path,
      ),
    )

    if (this.descriptor.positive && bigVal <= 0n) {
      issues.push({
        path,
        message: this.descriptor.messages?.positive ?? 'BigInt must be positive',
        code: 'too_small',
      })
    }
    if (this.descriptor.nonnegative && bigVal < 0n) {
      issues.push({
        path,
        message: this.descriptor.messages?.nonnegative ?? 'BigInt must be non-negative',
        code: 'too_small',
      })
    }
    if (this.descriptor.negative && bigVal >= 0n) {
      issues.push({
        path,
        message: this.descriptor.messages?.negative ?? 'BigInt must be negative',
        code: 'too_big',
      })
    }

    if (issues.length > 0) {
      return { issues }
    }

    return { value: bigVal }
  }

  public min(value: bigint | number | string, message?: string): this {
    const clone = this._clone()
    clone.descriptor.min = typeof value === 'bigint' ? value.toString() : value
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, min: message }
    }
    return clone as this
  }

  public max(value: bigint | number | string, message?: string): this {
    const clone = this._clone()
    clone.descriptor.max = typeof value === 'bigint' ? value.toString() : value
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, max: message }
    }
    return clone as this
  }

  public positive(message = 'BigInt must be positive'): this {
    const clone = this._clone()
    clone.descriptor.positive = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, positive: message }
    }
    return clone as this
  }

  public nonnegative(message = 'BigInt must be non-negative'): this {
    const clone = this._clone()
    clone.descriptor.nonnegative = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, nonnegative: message }
    }
    return clone as this
  }

  public negative(message = 'BigInt must be negative'): this {
    const clone = this._clone()
    clone.descriptor.negative = true
    if (message) {
      clone.descriptor.messages = { ...clone.descriptor.messages, negative: message }
    }
    return clone as this
  }
}

export class NullSchema extends BaseSchema<null, null> {
  declare descriptor: NullDescriptor

  constructor(descriptor: Partial<NullDescriptor> = {}) {
    super({
      kind: 'null',
      ...descriptor,
    } as NullDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<null> {
    if (value !== null) {
      return {
        issues: [
          {
            path,
            message: `Expected null, received ${typeof value}`,
            code: 'invalid_type',
            expected: 'null',
            received: typeof value,
          },
        ],
      }
    }
    return { value: null }
  }
}

export class AnySchema extends BaseSchema<any, any> {
  declare descriptor: AnyDescriptor

  constructor(descriptor: Partial<AnyDescriptor> = {}) {
    super({
      kind: 'any',
      ...descriptor,
    } as AnyDescriptor)
  }

  _validate(value: unknown, path: ReadonlyArray<string | number> = []): ValidateResult<any> {
    return { value }
  }
}

export { AnySchema as AnySchemaClass }
