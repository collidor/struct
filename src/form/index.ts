export { f, form, type FormStructBuilderFn } from './formBuilder'

export { FormStructSchema } from './builders/formStruct'
export { FormArraySchema } from './extensions/array'

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

export type * from './types'
