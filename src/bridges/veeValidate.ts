// oxlint-disable typescript/no-explicit-any
import type { BaseSchema } from '../core/base'
import type { Infer, InferInput } from '../types/inference'

export interface TypedSchema<TInput, TOutput> {
  __type: 'standard'
  schema: BaseSchema<TInput, TOutput>
  validate: (values: unknown) => Promise<{
    value?: TOutput
    errors: Array<{ path: string; errors: string[] }>
  }>
  raw: BaseSchema<TInput, TOutput>
}

/**
 * Converts a Struct schema into an explicit TypedSchema for Vee-Validate.
 * Note: Struct schemas already implement Standard Schema v1 (~standard)
 * and can be passed directly to useForm({ validationSchema }).
 */
export function toVeeValidateSchema<TSchema extends BaseSchema<any, any>>(
  schema: TSchema,
): TypedSchema<InferInput<TSchema>, Infer<TSchema>> {
  return {
    __type: 'standard',
    schema,
    raw: schema,
    validate: async (values: unknown) => {
      const res = await schema.safeParseAsync(values)
      if (res.success) {
        return {
          value: res.data,
          errors: [],
        }
      }

      const errorMap: Record<string, string[]> = {}
      for (const issue of res.issues) {
        const path = (issue.path || []).join('.')
        if (!errorMap[path]) {
          errorMap[path] = []
        }
        errorMap[path].push(issue.message)
      }

      return {
        errors: Object.entries(errorMap).map(([path, errors]) => ({
          path,
          errors,
        })),
      }
    },
  }
}
