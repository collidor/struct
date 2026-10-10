import { s } from '../builders/index'
import { StructSchema } from '../builders/struct'
import type { BaseSchema } from '../core/base'
import type { TypeDescriptor } from '../types/ast'

/**
 * A named struct schema acting as a reusable component capability.
 */
export type NamedStruct<
  N extends string = string,
  TShape extends Record<string, BaseSchema<any, any>> = Record<string, BaseSchema<any, any>>,
> = StructSchema<TShape> & { readonly __name: N }

export type NamedComponent = BaseSchema<any, any> & { readonly __name: string }

/** Property names (`Position` -> `"position" | "Position"`) a component may live under. */
export type ComponentKey<N extends string> = Uncapitalize<N> | Capitalize<N>

export type Out<T> = T extends BaseSchema<any, infer O> ? O : never
export type In<T> = T extends BaseSchema<infer I, any> ? I : never
export type NameOf<C> = C extends { readonly __name: infer N extends string }
  ? N
  : C extends { descriptor: { name: infer N extends string } }
    ? N
    : string

export const lowerFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toLowerCase() + str.slice(1) : str

export const upperFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str

export function getComponentKeys(name: string): string[] {
  const lower = lowerFirst(name)
  const upper = upperFirst(name)
  return lower === upper ? [lower] : [lower, upper]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Error raised when a host object or schema cannot supply a required component. */
export class ComponentResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComponentResolutionError'
  }
}

/**
 * Extracts the registered component name from a schema or descriptor.
 */
export function getComponentName(component: unknown): string {
  if (isRecord(component)) {
    const desc = component.descriptor
    if (isRecord(desc) && typeof desc.name === 'string' && desc.name.trim().length > 0) {
      return desc.name
    }
    if (typeof component.__name === 'string' && component.__name.trim().length > 0) {
      return component.__name
    }
    if (typeof component.name === 'string' && component.name.trim().length > 0) {
      return component.name
    }
  }
  throw new TypeError(
    'Component must be named, e.g. s.struct("Position", { ... }) or s.struct({ ... }).named("Position")',
  )
}

/**
 * Resolves and validates a single named component on `source` (matching either
 * uncapitalized or capitalized property name, e.g. `position` or `Position`).
 */
export function getComponent<T extends BaseSchema<unknown, unknown>>(
  source: unknown,
  component: T,
): Out<T> {
  const name = getComponentName(component)
  if (!isRecord(source)) {
    throw new ComponentResolutionError(
      `Expected an object carrying "${name}", received ${source === null ? 'null' : typeof source}`,
    )
  }

  const keys = getComponentKeys(name)
  const present = keys.filter((k) => source[k] !== undefined)

  if (present.length === 0) {
    throw new ComponentResolutionError(
      `Object has no "${name}" component (looked for ${keys.map((k) => `"${k}"`).join(', ')})`,
    )
  }

  if (present.length > 1) {
    throw new ComponentResolutionError(
      `Ambiguous "${name}" component: found under ${present.map((k) => `"${k}"`).join(', ')}`,
    )
  }

  const foundKey = present[0]
  const res = component.safeParse(source[foundKey])
  if (!res.success) {
    throw new ComponentResolutionError(
      `Invalid "${name}" component at "${foundKey}": ${res.issues.map((i) => i.message).join('; ')}`,
    )
  }

  return res.data as Out<T>
}

function matchesStructField(
  fieldSchema: BaseSchema<any, any>,
  component: BaseSchema<any, any>,
  componentName: string,
): boolean {
  if (fieldSchema.descriptor.name === componentName) {
    return true
  }
  if (
    fieldSchema instanceof StructSchema &&
    component instanceof StructSchema
  ) {
    const compShape = component.shape
    return Object.keys(compShape).every((k) => k in fieldSchema.shape)
  }
  return false
}

function matchesDescriptorField(
  fieldDesc: TypeDescriptor,
  componentDesc: TypeDescriptor | undefined,
  componentName: string,
): boolean {
  if (fieldDesc.name === componentName) {
    return true
  }
  if (
    fieldDesc.kind === 'struct' &&
    componentDesc?.kind === 'struct' &&
    isRecord(fieldDesc.fields) &&
    isRecord(componentDesc.fields)
  ) {
    const compFields = componentDesc.fields
    return Object.keys(compFields).every((k) => k in (fieldDesc.fields as Record<string, TypeDescriptor>))
  }
  return false
}

/**
 * Checks whether `source` satisfies a given component requirement (by property
 * name matching and structural schema validation). Works for runtime objects,
 * `StructSchema` definitions, and AST descriptors without exception control flow.
 */
export function hasComponent(
  source: unknown,
  component: BaseSchema<any, any>,
): boolean {
  if (!isRecord(source) && !(source instanceof StructSchema)) {
    return false
  }

  let name: string
  try {
    name = getComponentName(component)
  } catch {
    return false
  }

  const keys = getComponentKeys(name)

  if (source instanceof StructSchema) {
    for (const k of keys) {
      if (k in source.shape) {
        if (matchesStructField(source.shape[k], component, name)) {
          return true
        }
      }
    }
    return false
  }

  if (source.kind === 'struct' && isRecord(source.fields)) {
    const fields = source.fields as Record<string, TypeDescriptor>
    for (const k of keys) {
      if (k in fields) {
        if (matchesDescriptorField(fields[k], component.descriptor, name)) {
          return true
        }
      }
    }
    return false
  }

  // Runtime entity object: non-throwing check
  const present = keys.filter((k) => source[k] !== undefined)
  if (present.length !== 1) {
    return false
  }
  return component.safeParse(source[present[0]]).success
}

/**
 * Checks whether `source` satisfies all given component requirements.
 * Empty component list vacuously returns true.
 */
export function satisfies(
  source: unknown,
  ...components: BaseSchema<any, any>[]
): boolean {
  return components.every((comp) => hasComponent(source, comp))
}

/**
 * Resolves components from `source`. If a single component is provided, returns
 * that component's validated output; otherwise returns an object keyed by
 * uncapitalized component names (`{ position, health, ... }`).
 */
export function extractComponents<
  const L extends readonly [BaseSchema<any, any>, ...(BaseSchema<any, any>)[]],
>(
  source: unknown,
  ...components: L
): L extends readonly [infer Only extends BaseSchema<any, any>]
  ? Out<Only>
  : { [C in L[number] as Uncapitalize<NameOf<C>>]: Out<C> }
export function extractComponents(
  source: unknown,
  ...components: readonly BaseSchema<any, any>[]
): unknown
export function extractComponents(
  source: unknown,
  ...components: readonly BaseSchema<any, any>[]
): unknown {
  if (components.length === 0) {
    return {}
  }
  if (components.length === 1) {
    return getComponent(source, components[0])
  }

  const result: Record<string, unknown> = {}
  for (const comp of components) {
    const name = getComponentName(comp)
    result[lowerFirst(name)] = getComponent(source, comp)
  }
  return result
}

/**
 * Built-in standard components for game objects, simulations, and node graphs.
 */
export const StandardComponents = {
  Position: s.struct('Position', {
    x: s.number(),
    y: s.number(),
    z: s.number().optional(),
  }),

  Health: s.struct('Health', {
    hp: s.number(),
    max_hp: s.number().optional(),
  }),

  Velocity: s.struct('Velocity', {
    vx: s.number(),
    vy: s.number(),
  }),

  Combatant: s.struct('Combatant', {
    name: s.string(),
    initiative: s.number().optional(),
    is_active: s.boolean().optional(),
  }),
}

// Backwards-compatibility aliases and adapter
export const StandardCapabilities = {
  ...StandardComponents,
  HasPosition: StandardComponents.Position,
  HasHealth: StandardComponents.Health,
  HasVelocity: StandardComponents.Velocity,
  HasCombatant: StandardComponents.Combatant,
}

export type StructuralCapability = NamedStruct<string, any>

export interface CapabilityFieldRequirement {
  name: string
  kind: unknown
  optional?: boolean
}

export interface CapabilityValidationResult {
  valid: boolean
  missingFields: string[]
  typeMismatches: { field: string; expected: string; actual: string }[]
}

/**
 * @deprecated Use `hasComponent` or `satisfies` directly instead of `CapabilityValidator`.
 */
export class CapabilityValidator {
  public static satisfies(
    target: unknown,
    capability: BaseSchema<unknown, unknown> | NamedStruct<string, any>,
  ): boolean {
    return hasComponent(target, capability)
  }

  public static validateDescriptor(
    descriptor: unknown,
    capability: BaseSchema<unknown, unknown> | NamedStruct<string, any>,
  ): CapabilityValidationResult {
    return this._toResult(descriptor, capability)
  }

  public static validateEntityData(
    data: Record<string, unknown>,
    capability: BaseSchema<unknown, unknown> | NamedStruct<string, any>,
  ): CapabilityValidationResult {
    return this._toResult(data, capability)
  }

  private static _toResult(
    target: unknown,
    capability: BaseSchema<unknown, unknown> | NamedStruct<string, any>,
  ): CapabilityValidationResult {
    const valid = hasComponent(target, capability)
    let missingName = 'unknown'
    try {
      missingName = getComponentName(capability)
    } catch {
      // ignore
    }
    return {
      valid,
      missingFields: valid ? [] : [missingName],
      typeMismatches: [],
    }
  }
}
