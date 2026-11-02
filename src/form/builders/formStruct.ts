// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../../core/base'
import type { StructDescriptor, TypeDescriptor } from '../../types/ast'
import type { StructIssue } from '../../core/errors'
import { cloneDescriptor } from '../../utils/clone'
import { inferWidget } from '../../dynamic/formInspector'
import { evaluateExpression } from '../../computed/astEvaluator'
import { isUIOnlyNode, UIOnlyNode } from '../nodes/uiOnly'
import { isLayoutContainerNode, LayoutContainerNode } from '../nodes/layout'
import { isConditionalNode, ConditionalNode, evaluateCondition } from '../nodes/conditional'
import type {
  InferFormInput,
  InferFormOutput,
  FormNode,
  FormFieldNode,
  FormUIOnlyNode,
  FormLayoutNode,
  FormNodeTree,
  FormContext,
} from '../types'

function checkObject(
  value: unknown,
  path: ReadonlyArray<string | number>,
): { issues: StructIssue[] } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      issues: [
        {
          path,
          message: `Expected object, received ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
          code: 'invalid_type',
          expected: 'object',
          received: typeof value,
        },
      ],
    }
  }
  return null
}

/**
 * A Form Structure schema that unifies data schemas, layout containers,
 * conditional rendering, and UI-only nodes in a single declaration.
 */
export class FormStructSchema<
  TShape extends Record<string, any> = Record<string, any>,
> extends BaseSchema<InferFormInput<TShape>, InferFormOutput<TShape>> {
  declare descriptor: StructDescriptor
  public readonly shape: TShape

  constructor(shape: TShape = {} as TShape, descriptor: Partial<StructDescriptor> = {}) {
    const fieldsDesc: Record<string, TypeDescriptor> = {}
    FormStructSchema.extractDataDescriptors(shape, fieldsDesc)

    super({
      kind: 'struct',
      fields: fieldsDesc,
      ...descriptor,
    } as StructDescriptor)

    this.shape = shape
  }

  /**
   * Helper to recursively extract data field descriptors, stripping UI-only nodes.
   */
  public static extractDataDescriptors(
    shape: Record<string, any>,
    out: Record<string, TypeDescriptor>,
  ): void {
    for (const [key, item] of Object.entries(shape)) {
      if (isUIOnlyNode(item)) {
        continue
      }
      if (isLayoutContainerNode(item)) {
        FormStructSchema.extractDataDescriptors(item.shape, out)
        continue
      }
      if (isConditionalNode(item)) {
        FormStructSchema.extractDataDescriptors(item.branch, out)
        if (item.elseBranch) {
          FormStructSchema.extractDataDescriptors(item.elseBranch, out)
        }
        continue
      }
      if (item instanceof BaseSchema) {
        out[key] = item.descriptor
      }
    }
  }

  /**
   * Synchronous validation.
   * Recursively validates fields in the flattened structure, respecting conditional branches.
   */
  _validate(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateResult<InferFormOutput<TShape>> {
    const objIssue = checkObject(value, path)
    if (objIssue) return objIssue

    const valObj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    const issues: StructIssue[] = []

    this._validateSubShapeSync(this.shape, valObj, path, result, issues)

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as InferFormOutput<TShape> }
  }

  private _validateSubShapeSync(
    subShape: Record<string, any>,
    valObj: Record<string, unknown>,
    path: ReadonlyArray<string | number>,
    result: Record<string, unknown>,
    issues: StructIssue[],
  ): void {
    for (const [key, item] of Object.entries(subShape)) {
      if (isUIOnlyNode(item)) {
        // UI-only nodes do not process or retain data
        continue
      }

      if (isLayoutContainerNode(item)) {
        // Layout containers flatten their children into the current object level
        this._validateSubShapeSync(item.shape, valObj, path, result, issues)
        continue
      }

      if (isConditionalNode(item)) {
        const isActive = evaluateCondition(item.condition, valObj)
        if (isActive) {
          this._validateSubShapeSync(item.branch, valObj, path, result, issues)
        } else if (item.elseBranch) {
          this._validateSubShapeSync(item.elseBranch, valObj, path, result, issues)
        }
        continue
      }

      if (item instanceof BaseSchema) {
        const fieldPath = [...path, key]
        const validation = item._validateWithRefinements(valObj[key], fieldPath)
        if (validation.issues && validation.issues.length > 0) {
          issues.push(...validation.issues)
        } else if (validation.value !== undefined) {
          result[key] = validation.value
        }
      }
    }
  }

  /**
   * Asynchronous validation.
   */
  public override async _validateAsync(
    value: unknown,
    path: ReadonlyArray<string | number> = [],
  ): ValidateAsyncResult<InferFormOutput<TShape>> {
    const objIssue = checkObject(value, path)
    if (objIssue) return objIssue

    const valObj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    const issues: StructIssue[] = []

    await this._validateSubShapeAsync(this.shape, valObj, path, result, issues)

    if (issues.length > 0) {
      return { issues }
    }

    return { value: result as InferFormOutput<TShape> }
  }

  private async _validateSubShapeAsync(
    subShape: Record<string, any>,
    valObj: Record<string, unknown>,
    path: ReadonlyArray<string | number>,
    result: Record<string, unknown>,
    issues: StructIssue[],
  ): Promise<void> {
    for (const [key, item] of Object.entries(subShape)) {
      if (isUIOnlyNode(item)) {
        continue
      }

      if (isLayoutContainerNode(item)) {
        await this._validateSubShapeAsync(item.shape, valObj, path, result, issues)
        continue
      }

      if (isConditionalNode(item)) {
        const isActive = evaluateCondition(item.condition, valObj)
        if (isActive) {
          await this._validateSubShapeAsync(item.branch, valObj, path, result, issues)
        } else if (item.elseBranch) {
          await this._validateSubShapeAsync(item.elseBranch, valObj, path, result, issues)
        }
        continue
      }

      if (item instanceof BaseSchema) {
        const fieldPath = [...path, key]
        const validation = await item._validateWithRefinementsAsync(valObj[key], fieldPath)
        if (validation.issues && validation.issues.length > 0) {
          issues.push(...validation.issues)
        } else if (validation.value !== undefined) {
          result[key] = validation.value
        }
      }
    }
  }

  /**
   * Generates a resolved Form Node Tree AST from the form structure,
   * evaluating conditions, reactive derivations, and layout hierarchies against values.
   */
  public toFormTree(
    values: Record<string, unknown> = {},
    context?: Partial<FormContext>,
  ): FormNodeTree {
    const fullContext: FormContext = {
      values,
      rootValues: values,
      ...context,
    }

    const fieldsByKey: Record<string, FormFieldNode> = {}
    const nodes = this._buildNodes(this.shape, '', fullContext, fieldsByKey)

    return {
      nodes,
      fieldsByKey,
    }
  }

  private _buildNodes(
    subShape: Record<string, any>,
    parentPath: string,
    context: FormContext,
    fieldsByKey: Record<string, FormFieldNode>,
  ): FormNode[] {
    const nodes: FormNode[] = []

    for (const [key, item] of Object.entries(subShape)) {
      const currentPath = parentPath ? `${parentPath}.${key}` : key

      if (isUIOnlyNode(item)) {
        let computedValue: unknown = undefined
        if (item.descriptor.formula) {
          try {
            computedValue = evaluateExpression(item.descriptor.formula, context.values)
          } catch {
            computedValue = undefined
          }
        } else if (item.descriptor.computedFn) {
          try {
            computedValue = item.descriptor.computedFn(context.values, context)
          } catch {
            computedValue = undefined
          }
        }

        const uiNode: FormUIOnlyNode = {
          kind: 'ui_only',
          key,
          path: currentPath,
          uiKind: item.uiKind,
          descriptor: item.descriptor,
          computedValue,
        }
        nodes.push(uiNode)
        continue
      }

      if (isLayoutContainerNode(item)) {
        const children = this._buildNodes(item.shape, parentPath, context, fieldsByKey)
        const layoutNode: FormLayoutNode = {
          kind: 'layout',
          key,
          path: currentPath,
          layoutKind: item.layoutKind,
          options: item.options,
          children,
        }
        nodes.push(layoutNode)
        continue
      }

      if (isConditionalNode(item)) {
        const isActive = evaluateCondition(item.condition, context.values, context)
        if (isActive) {
          const branchNodes = this._buildNodes(item.branch, parentPath, context, fieldsByKey)
          nodes.push(...branchNodes)
        } else if (item.elseBranch) {
          const elseNodes = this._buildNodes(item.elseBranch, parentPath, context, fieldsByKey)
          nodes.push(...elseNodes)
        }
        continue
      }

      if (item instanceof BaseSchema) {
        const meta = item.descriptor.metadata || {}
        const { widget, props } = inferWidget(item.descriptor)

        const enumOptions =
          (props.options as Array<{ value: string | number; label: string }>) ||
          (item.descriptor.kind === 'enum' && Array.isArray((item.descriptor as any).values)
            ? (item.descriptor as any).values.map((v: any) => ({
                value: v,
                label: (item.descriptor as any).labels?.[String(v)] || String(v),
              }))
            : undefined)

        const fieldNode: FormFieldNode = {
          kind: 'field',
          key,
          path: currentPath,
          label: meta.label || item.descriptor.title || key,
          description: meta.description || item.descriptor.description,
          widget,
          widgetProps: props,
          options: enumOptions,
          required: !item.descriptor.optional,
          disabled: Boolean(meta.disabled),
          readonly: Boolean(meta.readonly),
          hidden: Boolean(meta.hidden),
          colSpan: typeof meta.colSpan === 'number' ? meta.colSpan : undefined,
          defaultValue: item.descriptor.default,
          type: item.descriptor.kind,
          descriptor: item.descriptor,
          dataSource: meta.dataSource as any,
          virtual: meta.virtual as any,
          pagination: meta.pagination as any,
          dependsOn: (meta.dataSource as any)?.dependsOn,
        }


        fieldsByKey[key] = fieldNode
        nodes.push(fieldNode)
      }
    }

    return nodes
  }

  public get name(): string | undefined {
    return this.descriptor.name
  }


  public named<const N extends string>(name: N): this & { readonly __name: N } {
    const clone = this._clone()
    clone.descriptor.name = name
    return clone as this & { readonly __name: N }
  }

  protected override _clone(): this {

    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new FormStructSchema(this.shape, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
