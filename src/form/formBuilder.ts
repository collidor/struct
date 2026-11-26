// oxlint-disable typescript/no-explicit-any
import type { StructDescriptor } from '../types/ast'
import { FormStructSchema } from './builders/formStruct'
import { field } from './field'
import {
  textInput,
  textarea,
  numberInput,
  slider,
  range,
  table,
  tags,
  list,
  cards,
  tabsWidget,
  combobox,
  passwordInput,
  colorInput,
  fileInput,
  codeInput,
  dateInput,
  datetimeInput,
  select,
  radio,
  checkbox,
  switchInput,
  multiselect,
} from './widgets'
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
  // Data schemas come from s.*; fields and widgets describe presentation.
  struct: createFormStruct,
  field,
  textInput,
  textarea,
  numberInput,
  slider,
  range,
  table,
  tags,
  list,
  cards,
  tabsWidget,
  combobox,
  passwordInput,
  colorInput,
  fileInput,
  codeInput,
  dateInput,
  datetimeInput,
  select,
  radio,
  checkbox,
  switchInput,
  multiselect,

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

}

export const form = f
