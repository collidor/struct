// oxlint-disable typescript/no-explicit-any
import { s } from '../builders/index'
import { StructSchema } from '../builders/struct'
import type { BaseSchema } from '../core/base'

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

export const lowerFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toLowerCase() + str.slice(1) : str

export const upperFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str

type Out<T> = T extends BaseSchema<any, infer O> ? O : never
type NameOf<C> = C extends { readonly __name: infer N extends string }
  ? N
  : C extends { descriptor: { name: infer N extends string } }
    ? N
    : string

/**
 * Extracts the registered component name from a schema or descriptor.
 */
export function getComponentName(component: unknown): string {
  const name =
    (component as any)?.descriptor?.name ??
    (component as any)?.__name ??
    (component as any)?.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError(
      'Component must be named, e.g. s.struct("Position", { ... }) or s.struct({ ... }).named("Position")',
    )
  }
  return name
}

/** Error raised when a host object or schema cannot supply a required component. */
export class ComponentResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComponentResolutionError'
  }
}

/**
 * Resolves and validates a single named component on `source` (matching either
 * uncapitalized or capitalized property name, e.g. `position` or `Position`).
 */
export function getComponent<T extends BaseSchema<any, any>>(
  source: unknown,
  component: T,
): Out<T> {
  const name = getComponentName(component)
  if (typeof source !== 'object' || source === null) {
    throw new ComponentResolutionError(
      `Expected an object carrying "${name}", received ${source === null ? 'null' : typeof source}`,
    )
  }

  const obj = source as Record<string, unknown>
  const keys = [...new Set([lowerFirst(name), upperFirst(name)])]
  const present = keys.filter((k) => obj[k] !== undefined)

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
  const res = component.safeParse(obj[foundKey])
  if (!res.success) {
    throw new ComponentResolutionError(
      `Invalid "${name}" component at "${foundKey}": ${res.issues.map((i: any) => i.message).join('; ')}`,
    )
  }

  return res.data as Out<T>
}

/**
 * Checks whether `source` satisfies a given component requirement (by property
 * name matching and structural schema validation). Works for runtime objects,
 * `StructSchema` definitions, and AST descriptors.
 */
export function hasComponent(
  source: unknown,
  component: BaseSchema<any, any> | NamedStruct<any, any>,
): boolean {
  if (typeof source !== 'object' || source === null) {
    return false
  }

  let name: string
  try {
    name = getComponentName(component)
  } catch {
    return false
  }

  const keys = [...new Set([lowerFirst(name), upperFirst(name)])]

  if (source instanceof StructSchema) {
    return keys.some((k) => k in source.shape)
  }

  if ((source as any).kind === 'struct' && typeof (source as any).fields === 'object') {
    const fields = (source as any).fields ?? {}
    return keys.some((k) => k in fields)
  }

  try {
    getComponent(source, component)
    return true
  } catch {
    return false
  }
}

/**
 * Checks whether `source` satisfies all given component requirements.
 */
export function satisfies(
  source: unknown,
  ...components: (BaseSchema<any, any> | NamedStruct<any, any>)[]
): boolean {
  if (components.length === 0) {
    return false
  }
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
  : { [C in L[number] as Uncapitalize<NameOf<C>>]: Out<C> } {
  if (components.length === 1) {
    return getComponent(source, components[0]) as any
  }

  const result: Record<string, unknown> = {}
  for (const comp of components) {
    const name = getComponentName(comp)
    result[lowerFirst(name)] = getComponent(source, comp)
  }
  return result as any
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
export const StandardCapabilities = StandardComponents
export type StructuralCapability = NamedStruct<any, any>

export interface CapabilityFieldRequirement {
  name: string
  kind: any
  optional?: boolean
}

export interface CapabilityValidationResult {
  valid: boolean
  missingFields: string[]
  typeMismatches: { field: string; expected: string; actual: string }[]
}

export class CapabilityValidator {
  public static satisfies(
    target: unknown,
    capability: BaseSchema<any, any> | NamedStruct<any, any>,
  ): boolean {
    return hasComponent(target, capability)
  }

  public static validateDescriptor(
    descriptor: unknown,
    capability: BaseSchema<any, any> | NamedStruct<any, any>,
  ): CapabilityValidationResult {
    const valid = hasComponent(descriptor, capability)
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

  public static validateEntityData(
    data: Record<string, unknown>,
    capability: BaseSchema<any, any> | NamedStruct<any, any>,
  ): CapabilityValidationResult {
    const valid = hasComponent(data, capability)
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
