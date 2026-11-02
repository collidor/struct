// oxlint-disable typescript/no-explicit-any
import type { LayoutContainerKind, LayoutContainerMarker, LayoutContainerOptions } from '../types'

/**
 * Class representing a layout container that groups or arranges child nodes visually
 * while remaining transparent (flattened) in the parsed data shape.
 */
export class LayoutContainerNode<TShape = Record<string, any>>
  implements LayoutContainerMarker<TShape>
{
  public readonly __formKind = 'layout_container' as const
  public readonly layoutKind: LayoutContainerKind
  public readonly shape: TShape
  public readonly options: LayoutContainerOptions

  constructor(
    layoutKind: LayoutContainerKind,
    shape: TShape,
    options: LayoutContainerOptions = {},
  ) {
    this.layoutKind = layoutKind
    this.shape = shape
    this.options = options
  }
}

export function isLayoutContainerNode(val: unknown): val is LayoutContainerNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).__formKind === 'layout_container'
  )
}

// ---------------------------------------------------------------------------
// Layout Builders
// ---------------------------------------------------------------------------

/**
 * Places fields side-by-side on the same horizontal line.
 * In the data model, all fields are flattened to the parent object.
 */
export function row<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('row', shape, options)
}

/**
 * Arranges fields in a responsive grid layout.
 */
export function grid<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('grid', shape, options)
}

/**
 * Groups fields under a titled section or fieldset with optional description.
 */
export function section<TShape extends Record<string, any>>(
  titleOrOptions: string | LayoutContainerOptions,
  shape: TShape,
): LayoutContainerNode<TShape> {
  const options = typeof titleOrOptions === 'string' ? { title: titleOrOptions } : titleOrOptions
  return new LayoutContainerNode('section', shape, options)
}

/**
 * Organizes fields into tabbed panels.
 * In the data model, all tab fields are flattened to the parent object.
 */
export function tabs<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('tabs', shape, options)
}

/**
 * Organizes fields into collapsible accordion panels.
 */
export function accordion<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('accordion', shape, options)
}

/**
 * Splits fields into two side-by-side or stacked columns according to a ratio.
 */
export function split<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('split', shape, options)
}

/**
 * Defines a multi-step wizard container with per-step validation gating.
 */
export function steps<TShape extends Record<string, any>>(
  shape: TShape,
  options?: LayoutContainerOptions,
): LayoutContainerNode<TShape> {
  return new LayoutContainerNode('steps', shape, options)
}

export const wizard = steps
