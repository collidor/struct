import type { StructDescriptor, TypeKind } from '../types/ast'

/**
 * Structural Capability definition specifying required fields and their expected primitive kinds.
 */
export interface CapabilityFieldRequirement {
  name: string
  kind: TypeKind | TypeKind[]
  optional?: boolean
}

export interface StructuralCapability {
  name: string
  description?: string
  fields: CapabilityFieldRequirement[]
}

export interface CapabilityValidationResult {
  valid: boolean
  missingFields: string[]
  typeMismatches: { field: string; expected: string; actual: string }[]
}

/**
 * Built-in standard capabilities for TTRPG and game system nodes.
 */
export const StandardCapabilities = {
  HasPosition: {
    name: 'HasPosition',
    description: 'Spatial coordinate representation in 2D or 3D space',
    fields: [
      { name: 'x', kind: ['number', 'integer'] },
      { name: 'y', kind: ['number', 'integer'] },
      { name: 'z', kind: ['number', 'integer'], optional: true },
    ],
  } as StructuralCapability,

  HasHealth: {
    name: 'HasHealth',
    description: 'Vital statistics and hit point resource pools',
    fields: [
      { name: 'hp', kind: ['number', 'integer'] },
      { name: 'max_hp', kind: ['number', 'integer'], optional: true },
    ],
  } as StructuralCapability,

  HasVelocity: {
    name: 'HasVelocity',
    description: 'Vector velocity components for physics and movement simulation',
    fields: [
      { name: 'vx', kind: ['number', 'integer'] },
      { name: 'vy', kind: ['number', 'integer'] },
    ],
  } as StructuralCapability,

  HasCombatant: {
    name: 'HasCombatant',
    description: 'Entity participating in turn-based combat initiative',
    fields: [
      { name: 'name', kind: 'string' },
      { name: 'initiative', kind: ['number', 'integer'], optional: true },
      { name: 'is_active', kind: 'boolean', optional: true },
    ],
  } as StructuralCapability,
}

export class CapabilityValidator {
  /**
   * Validates whether a StructDescriptor structurally satisfies a required capability.
   */
  public static validateDescriptor(
    descriptor: StructDescriptor,
    capability: StructuralCapability,
  ): CapabilityValidationResult {
    const missingFields: string[] = []
    const typeMismatches: { field: string; expected: string; actual: string }[] = []

    for (const req of capability.fields) {
      const fieldDesc = descriptor.fields[req.name]
      if (!fieldDesc) {
        if (!req.optional) {
          missingFields.push(req.name)
        }
        continue
      }

      const expectedKinds = Array.isArray(req.kind) ? req.kind : [req.kind]
      if (!expectedKinds.includes(fieldDesc.kind)) {
        typeMismatches.push({
          field: req.name,
          expected: expectedKinds.join(' | '),
          actual: fieldDesc.kind,
        })
      }
    }

    const valid = missingFields.length === 0 && typeMismatches.length === 0
    return { valid, missingFields, typeMismatches }
  }

  /**
   * Validates whether a live entity data object satisfies a required capability.
   */
  public static validateEntityData(
    data: Record<string, unknown>,
    capability: StructuralCapability,
  ): CapabilityValidationResult {
    const missingFields: string[] = []
    const typeMismatches: { field: string; expected: string; actual: string }[] = []

    for (const req of capability.fields) {
      const val = data[req.name]
      if (val === undefined || val === null) {
        if (!req.optional) {
          missingFields.push(req.name)
        }
        continue
      }

      const actualType = typeof val
      const expectedKinds = Array.isArray(req.kind) ? req.kind : [req.kind]

      let matches = false
      for (const kind of expectedKinds) {
        if (
          (kind === 'number' || kind === 'integer') &&
          actualType === 'number' &&
          !isNaN(val as number)
        ) {
          matches = true
          break
        }
        if (kind === 'string' && actualType === 'string') {
          matches = true
          break
        }
        if (kind === 'boolean' && actualType === 'boolean') {
          matches = true
          break
        }
        if (kind === 'struct' && actualType === 'object') {
          matches = true
          break
        }
        if (kind === 'array' && Array.isArray(val)) {
          matches = true
          break
        }
      }

      if (!matches) {
        typeMismatches.push({
          field: req.name,
          expected: expectedKinds.join(' | '),
          actual: actualType,
        })
      }
    }

    const valid = missingFields.length === 0 && typeMismatches.length === 0
    return { valid, missingFields, typeMismatches }
  }

  public static satisfies(
    target: StructDescriptor | Record<string, unknown>,
    capability: StructuralCapability,
  ): boolean {
    if ('kind' in target && target.kind === 'struct' && 'fields' in target) {
      return this.validateDescriptor(target as StructDescriptor, capability).valid
    }
    return this.validateEntityData(target as Record<string, unknown>, capability).valid
  }
}
