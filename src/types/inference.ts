// oxlint-disable typescript/no-explicit-any
import type { StandardSchemaV1 } from './standard'

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type Infer<T> =
  T extends StandardSchemaV1<unknown, infer Output>
    ? Output
    : T extends { _output: infer O }
      ? O
      : unknown

export type InferInput<T> =
  T extends StandardSchemaV1<infer Input, unknown>
    ? Input
    : T extends { _input: infer I }
      ? I
      : unknown

export type AnySchemaType = StandardSchemaV1<any, any> & {
  _input: any
  _output: any
  descriptor: import('./ast').TypeDescriptor
}

export type AnySchema = AnySchemaType

export type SchemaShape = Record<string, AnySchemaType>

export type OptionalKeys<T extends Record<string, AnySchema>> = {
  [K in keyof T]: undefined extends Infer<T[K]> ? K : never
}[keyof T]

export type RequiredKeys<T extends Record<string, AnySchema>> = {
  [K in keyof T]: undefined extends Infer<T[K]> ? never : K
}[keyof T]

export type InferShapeOutput<T extends Record<string, AnySchema>> = Prettify<
  {
    [K in RequiredKeys<T>]: Infer<T[K]>
  } & {
    [K in OptionalKeys<T>]?: Infer<T[K]>
  }
>

export type InferShapeInput<T extends Record<string, AnySchema>> = Prettify<
  {
    [K in RequiredKeys<T>]: InferInput<T[K]>
  } & {
    [K in OptionalKeys<T>]?: InferInput<T[K]>
  }
>
