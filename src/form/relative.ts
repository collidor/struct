import type { FormFieldNode, FormNode, FormNodeTree } from './types'

/**
 * Helpers for working with the nodes of one list row as a form of its own.
 *
 * A row is edited as its own form, so the paths of its fields are made relative to the row
 * (`orders[].lines` becomes `lines`). Each copy remembers where it came from (`absPath`),
 * and keeps `resolveItem`, so a nested list can still rebuild its rows from the form root.
 */

/** Copies `nodes` with `prefix` removed from every path. Nodes outside the prefix are untouched. */
export function relativizeNodes(nodes: FormNode[] | undefined, prefix: string): FormNode[] {
  const strip = (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : path)
  const copyNode = (node: FormNode): FormNode => {
    const copy: any = { ...node, path: strip(node.path) }
    if (node.kind === 'field') {
      copy.absPath = node.absPath ?? node.path
      if (typeof node.resolveItem === 'function') {
        // not enumerable on the original, so the spread above dropped it
        Object.defineProperty(copy, 'resolveItem', { value: node.resolveItem, enumerable: false })
      }
      if (node.children) copy.children = node.children.map(copyNode)
      if (node.item) copy.item = copyNode(node.item)
    } else if (node.kind === 'layout') {
      copy.children = node.children.map(copyNode)
    }
    return copy
  }
  return (nodes ?? []).map(copyNode)
}

/** Every data field in `nodes`, nested objects included, array row templates excluded. */
export function flattenFieldNodes(nodes: FormNode[] | undefined, out: FormFieldNode[] = []): FormFieldNode[] {
  for (const node of nodes ?? []) {
    if (node.kind === 'field') {
      out.push(node)
      flattenFieldNodes(node.children, out)
    } else if (node.kind === 'layout') {
      flattenFieldNodes(node.children, out)
    }
  }
  return out
}

/** The field node with exactly this path, searching layouts and nested objects. */
export function findFieldNode(nodes: FormNode[] | undefined, path: string): FormFieldNode | undefined {
  return flattenFieldNodes(nodes).find((node) => node.path === path)
}

/** The tree's field index, built from its nodes. */
export function indexFieldNodes(nodes: FormNode[]): FormNodeTree['fieldsByKey'] {
  const out: FormNodeTree['fieldsByKey'] = {}
  for (const node of flattenFieldNodes(nodes)) out[node.path] = node
  return out
}

/** Values for a new, empty row: declared defaults, else a blank of the field's type. */
export function rowDefaults(nodes: FormNode[] | undefined): Record<string, unknown> {
  const build = (list: FormNode[] | undefined, base: string): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    const visit = (node: FormNode) => {
      if (node.kind === 'layout') return node.children.forEach(visit)
      if (node.kind !== 'field') return
      const key = node.key
      if (node.children?.length) out[key] = build(node.children, node.path)
      else if (node.defaultValue !== undefined) out[key] = node.defaultValue
      else if (node.item || node.type === 'array') out[key] = []
      else if (node.type === 'number' || node.type === 'integer') out[key] = 0
      else if (node.type === 'boolean') out[key] = false
      else out[key] = ''
    }
    ;(list ?? []).forEach(visit)
    void base
    return out
  }
  return build(nodes, '')
}
