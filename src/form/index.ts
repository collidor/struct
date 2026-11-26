export { f, form, type FormStructBuilderFn } from './formBuilder'

export { FormStructSchema } from './builders/formStruct'
export { field, FormField, isFormField, type FormFieldOptions } from './field'
export * from './widgets'

export {
  LayoutContainerNode,
  isLayoutContainerNode,
  row,
  grid,
  section,
  tabs,
  accordion,
  split,
  steps,
  wizard,
} from './nodes/layout'

export {
  UIOnlyNode,
  isUIOnlyNode,
  heading,
  text,
  divider,
  spacer,
  alert,
  button,
  computedDisplay,
  slot,
} from './nodes/uiOnly'

export {
  ConditionalNode,
  isConditionalNode,
  evaluateCondition,
  when,
  unless,
} from './nodes/conditional'

export {
  HeadlessFormController,
  createFormController,
  type FormControllerOptions,
  type FormState,
} from './controller/formController'
export {
  FormSession,
  FormValidationError,
  issuesUnder,
  type FormSource,
  type FormIssue,
  type FormSessionOptions,
} from './controller/session'
export { ScopedFormController, type ScopedFormOptions } from './controller/scopedController'
export {
  isAvailable,
  resolveOptions,
  normalizeOptionItems,
  type OptionItem,
  type OptionsSpec,
  type DependentOptions,
  type ResolvedOption,
} from './options'
export { createFieldNode, descriptorFieldNodes, descriptorToFormTree, type CreateFieldNodeInput } from './fieldNode'
export { relativizeNodes, flattenFieldNodes, findFieldNode, indexFieldNodes, rowDefaults } from './relative'

export type * from './types'

export * from './paths'
