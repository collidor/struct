// oxlint-disable typescript/no-explicit-any
import { s } from '../builders/index'
import type { BaseSchema } from '../core/base'
import type { StructDescriptor, ArrayDescriptor } from '../types/ast'
import { FormStructSchema } from './builders/formStruct'
import { FormArraySchema } from './extensions/array'
import {
  row,
  grid,
  section,
  tabs,
  accordion,
  split,
  steps,
  wizard,
} from './nodes/layout'
import {
  heading,
  text,
  divider,
  spacer,
  alert,
  button,
  computedDisplay,
  slot,
} from './nodes/uiOnly'
import { when, unless } from './nodes/conditional'
import { createFormController } from './controller/formController'
import type { FormNodeTree, FormContext } from './types'

export interface FormStructBuilderFn {
  <const N extends string, TShape extends Record<string, any>>(
    name: N,
    shape?: TShape,
    descriptor?: Partial<StructDescriptor>,
  ): FormStructSchema<TShape> & { readonly __name: N }
  <TShape extends Record<string, any>>(
    shape?: TShape,
    descriptor?: Partial<StructDescriptor>,
  ): FormStructSchema<TShape>
}

const createFormStruct: FormStructBuilderFn = ((
  nameOrShape: any = {},
  shapeOrDescriptor?: any,
  maybeDescriptor?: any,
) => {
  if (typeof nameOrShape === 'string') {
    const shape = shapeOrDescriptor ?? {}
    const schema = new FormStructSchema(shape, {
      name: nameOrShape,
      ...maybeDescriptor,
    })
    return (schema as any).named(nameOrShape)
  }
  return new FormStructSchema(nameOrShape, shapeOrDescriptor)
}) as FormStructBuilderFn

export const f = {
  // 1. Primitive Schema Builders (interoperable with s.*)
  string: s.string,
  number: s.number,
  integer: s.integer,
  boolean: s.boolean,
  date: s.date,
  bigint: s.bigint,
  null: s.null,
  any: s.any,
  unknown: s.unknown,
  optional: s.optional,
  nullable: s.nullable,
  nullish: s.nullish,
  coerce: s.coerce,
  enum: s.enum,
  literal: s.literal,
  union: s.union,
  tuple: s.tuple,
  record: s.record,
  pipe: s.pipe,

  // 2. Form Structures & Collection Views
  struct: createFormStruct,
  array: <TItem extends BaseSchema<any, any>>(
    item: TItem,
    descriptor?: Partial<ArrayDescriptor>,
  ): FormArraySchema<TItem> => new FormArraySchema(item, descriptor),

  // 3. Layout Containers (transparent in data shape, grouped in UI)
  row,
  grid,
  section,
  tabs,
  accordion,
  split,
  steps,
  wizard,

  // 4. UI-Only Nodes (stripped from data and types)
  heading,
  text,
  divider,
  spacer,
  alert,
  button,
  computedDisplay,
  slot,

  // 5. Conditional Rendering & Validation Coupling
  when,
  unless,

  // 6. Runtime Headless Form Controller & Evaluator
  createController: createFormController,
  resolveState: (
    schema: FormStructSchema<any>,
    values: Record<string, unknown> = {},
    context?: Partial<FormContext>,
  ): FormNodeTree => schema.toFormTree(values, context),

  fromDescriptor: s.fromDescriptor,
}

export const form = f
