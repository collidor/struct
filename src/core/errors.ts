import type { StandardSchemaV1 } from '../types/standard'

export interface StructIssue {
  readonly message: string
  readonly path?: ReadonlyArray<string | number>
  readonly code?: string
  readonly expected?: string
  readonly received?: string
}

export function formatIssuePath(path?: ReadonlyArray<string | number>): string {
  if (!path || path.length === 0) return '(root)'
  return path
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`,
    )
    .join('')
}

export interface FlattenedErrors<U = string> {
  formErrors: U[]
  fieldErrors: Record<string, U[]>
}

export interface FormattedError {
  _errors: string[]
  [key: string]: FormattedError | string[]
}

export class StructValidationError extends Error {
  public readonly issues: readonly StructIssue[]

  constructor(issues: readonly StructIssue[]) {
    const issueSummary = issues
      .map((iss) => `  - ${formatIssuePath(iss.path)}: ${iss.message}`)
      .join('\n')
    super(`Struct validation failed with ${issues.length} issue(s):\n${issueSummary}`)
    this.name = 'StructValidationError'
    this.issues = issues
    Object.setPrototypeOf(this, StructValidationError.prototype)
  }

  public toStandardIssues(): ReadonlyArray<StandardSchemaV1.Issue> {
    return this.issues.map((issue) => ({
      message: issue.message,
      path: issue.path,
    }))
  }

  /**
   * Flattens validation issues into a single object with form-level errors
   * and a map of field-level errors.
   */
  public flatten<U = string>(
    mapper: (issue: StructIssue) => U = (issue) => issue.message as unknown as U,
    options?: { pathStyle?: 'root' | 'dot' },
  ): FlattenedErrors<U> {
    const formErrors: U[] = []
    const fieldErrors: Record<string, U[]> = {}

    for (const issue of this.issues) {
      if (!issue.path || issue.path.length === 0) {
        formErrors.push(mapper(issue))
      } else {
        const fieldKey =
          options?.pathStyle === 'dot'
            ? issue.path.join('.')
            : String(issue.path[0])

        if (!fieldErrors[fieldKey]) {
          fieldErrors[fieldKey] = []
        }
        fieldErrors[fieldKey].push(mapper(issue))
      }
    }

    return { formErrors, fieldErrors }
  }

  /**
   * Formats validation issues into a nested object hierarchy matching
   * the structure of the validated schema data.
   */
  public format(): FormattedError {
    const root: FormattedError = { _errors: [] }

    for (const issue of this.issues) {
      if (!issue.path || issue.path.length === 0) {
        root._errors.push(issue.message)
      } else {
        let current: FormattedError = root
        for (let i = 0; i < issue.path.length; i++) {
          const key = String(issue.path[i])
          const isLast = i === issue.path.length - 1

          if (key === '_errors') {
            current._errors.push(issue.message)
            break
          }

          if (!current[key] || Array.isArray(current[key])) {
            current[key] = { _errors: [] }
          }
          current = current[key] as FormattedError
          if (isLast) {
            current._errors.push(issue.message)
          }
        }
      }
    }

    return root
  }
}
