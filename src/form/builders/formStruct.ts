// oxlint-disable typescript/no-explicit-any
import { BaseSchema, type ValidateResult, type ValidateAsyncResult } from '../../core/base'
import type { StructDescriptor, TypeDescriptor } from '../../types/ast'
import { ArraySchema } from '../../builders/array'
import { StructSchema } from '../../builders/struct'
import type { StructIssue } from '../../core/errors'
import { cloneDescriptor } from '../../utils/clone'
import { createFieldNode } from '../fieldNode'
import { isFormField } from '../field'
import { PathScope, ITEM, type PathInput, type PathSegment } from '../paths'
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
 * Where each object of a value tree sits in its root. Validation hands a nested form only
 * its own object, so conditions such as `$root.mode` or `some($root.tags, "on")` need this
 * to find the rest of the form. Keyed by object identity, so concurrent validations of
 * different values cannot see each other.
 */
const scopeIndex = new WeakMap<object, { root: unknown; path: PathSegment[] }>()

function indexScopes(root: unknown): void {
  const seen = new Set<object>()
  const stack: Array<[unknown, PathSegment[]]> = [[root, []]]
  while (stack.length > 0) {
    const [node, path] = stack.pop()!
    if (typeof node !== 'object' || node === null || seen.has(node)) continue
    seen.add(node)
    scopeIndex.set(node, { root, path })
    if (Array.isArray(node)) node.forEach((child, i) => stack.push([child, [...path, i]]))
    else for (const [key, child] of Object.entries(node)) stack.push([child, [...path, key]])
  }
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
      const schema = isFormField(item) ? item.schema : item
      if (schema instanceof BaseSchema) {
        out[key] = schema.descriptor
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

    if (path.length === 0) indexScopes(value)
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
        const isActive = evaluateCondition(item.condition, valObj, this._conditionContext(valObj))
        if (isActive) {
          this._validateSubShapeSync(item.branch, valObj, path, result, issues)
        } else if (item.elseBranch) {
          this._validateSubShapeSync(item.elseBranch, valObj, path, result, issues)
        }
        continue
      }

      const schema = isFormField(item) ? item.schema : item
      if (schema instanceof BaseSchema) {
        const fieldPath = [...path, key]
        const validation = schema._validateWithRefinements(valObj[key], fieldPath)
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

    if (path.length === 0) indexScopes(value)
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
        const isActive = evaluateCondition(item.condition, valObj, this._conditionContext(valObj))
        if (isActive) {
          await this._validateSubShapeAsync(item.branch, valObj, path, result, issues)
        } else if (item.elseBranch) {
          await this._validateSubShapeAsync(item.elseBranch, valObj, path, result, issues)
        }
        continue
      }

      const schema = isFormField(item) ? item.schema : item
      if (schema instanceof BaseSchema) {
        const fieldPath = [...path, key]
        const validation = await schema._validateWithRefinementsAsync(valObj[key], fieldPath)
        if (validation.issues && validation.issues.length > 0) {
          issues.push(...validation.issues)
        } else if (validation.value !== undefined) {
          result[key] = validation.value
        }
      }
    }
  }

  /** Context for a condition on `valObj`: its place in the root, so `$root`, `$parent` and `$item` work. */
  private _conditionContext(valObj: Record<string, unknown>): FormContext {
    const info = scopeIndex.get(valObj)
    const scope = info ? new PathScope(info.root, info.path) : new PathScope(valObj, [])
    return {
      values: valObj,
      rootValues: scope.root as Record<string, unknown>,
      index: scope.index,
      scope,
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
    // Every lookup below goes through a scope, so a key inside a list row or a nested
    // object is resolved against that object, with $root/$parent/$item/$index available.
    const scope = context?.scope ?? new PathScope(values)
    const fullContext: FormContext = {
      ...context,
      values: scope.value,
      rootValues: (scope.root as Record<string, unknown>) ?? values,
      index: scope.index,
      scope,
    }

    const fieldsByKey: Record<string, FormFieldNode> = {}
    const nodes = this._buildNodes(this.shape, '', fullContext, fieldsByKey, '')

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
    idPrefix: string,
  ): FormNode[] {
    const nodes: FormNode[] = []

    for (const [key, item] of Object.entries(subShape)) {
      const currentPath = key === '$item' ? parentPath : parentPath ? `${parentPath}.${key}` : key

      if (isUIOnlyNode(item)) {
        let computedValue: unknown = undefined
        if (item.descriptor.formula) {
          try {
            computedValue = evaluateExpression(item.descriptor.formula, context.scope ? context.scope.context() : context.values)
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
          id: `${idPrefix}/${key}`,
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
        const layoutId = `${idPrefix}/${key}`
        const children = this._buildNodes(item.shape, parentPath, context, fieldsByKey, layoutId)
        const layoutNode: FormLayoutNode = {
          kind: 'layout',
          id: layoutId,
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
          const branchNodes = this._buildNodes(item.branch, parentPath, context, fieldsByKey, idPrefix)
          nodes.push(...branchNodes)
        } else if (item.elseBranch) {
          const elseNodes = this._buildNodes(item.elseBranch, parentPath, context, fieldsByKey, idPrefix)
          nodes.push(...elseNodes)
        }
        continue
      }

      const field = isFormField(item) ? item : undefined
      const schema = field ? field.schema : item
      if (schema instanceof BaseSchema) {
        const fieldNode: FormFieldNode = createFieldNode({
          key,
          path: currentPath,
          descriptor: schema.descriptor,
          options: field?.options,
        })


        // Nested forms retain their layout. Arrays expose an item template, so
        // renderers can build sub-tables or edit individual items in a dialog.
        // `$item` is the row template, not a property: its scope is the row itself.
        const own: Array<string | typeof ITEM> = key === '$item' ? [] : [key]
        if (schema instanceof FormStructSchema || schema instanceof StructSchema) {
          const nested = this._childContext(context, ...own)
          fieldNode.children = this._buildNodes(schema.shape, currentPath, nested, fieldsByKey, currentPath)
        } else if (schema instanceof ArraySchema) {
          // The template stands for every row. Its scope is a row that has no values yet.
          const row = this._childContext(context, ...own, ITEM)
          const itemNodes = this._buildNodes({ $item: schema.itemSchema }, `${currentPath}[]`, row, fieldsByKey, currentPath)
          const itemNode = itemNodes[0]
          if (itemNode?.kind === 'field') fieldNode.item = itemNode
          // The template above has no values, so a `when` inside a row cannot resolve there.
          // This builds the same subtree for one real row, from the form's root values.
          const itemSchema = schema.itemSchema
          Object.defineProperty(fieldNode, 'resolveItem', {
            enumerable: false,
            value: (root: unknown, rowPath: PathInput): FormFieldNode | undefined => {
              const rowScope = new PathScope(root, rowPath)
              const rowContext: FormContext = {
                ...context,
                scope: rowScope,
                values: rowScope.value,
                rootValues: rowScope.root as Record<string, unknown>,
                parentValues: rowScope.parent.value,
                index: rowScope.index,
              }
              const nodes = this._buildNodes({ $item: itemSchema }, `${currentPath}[]`, rowContext, {}, currentPath)
              return nodes[0]?.kind === 'field' ? nodes[0] : undefined
            },
          })
          // The template describes a row; it is not a field of its own.
          delete fieldsByKey[`${currentPath}[]`]
        }

        fieldsByKey[currentPath] = fieldNode
        nodes.push(fieldNode)
      }
    }

    return nodes
  }

  /** Context for the object (or list row) at `segments` below the current scope. */
  private _childContext(context: FormContext, ...segments: Array<string | number | typeof ITEM>): FormContext {
    const scope = (context.scope ?? new PathScope(context.values)).child(...segments)
    return {
      ...context,
      scope,
      values: scope.value,
      parentValues: context.values,
      index: scope.index,
    }
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
