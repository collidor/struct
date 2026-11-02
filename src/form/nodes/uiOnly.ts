import type { UIOnlyDescriptor, UIOnlyMarker, UIOnlyNodeKind, FormContext } from '../types'

/**
 * Class representing a non-data UI element embedded inside a Form Structure.
 * Holds no input data and is stripped from validation results and output data.
 */
export class UIOnlyNode implements UIOnlyMarker {
  public readonly __formKind = 'ui_only' as const
  public readonly uiKind: UIOnlyNodeKind
  public readonly descriptor: UIOnlyDescriptor

  constructor(uiKind: UIOnlyNodeKind, descriptor: Partial<UIOnlyDescriptor> = {}) {
    this.uiKind = uiKind
    this.descriptor = {
      kind: uiKind,
      ...descriptor,
    }
  }
}

export function isUIOnlyNode(val: unknown): val is UIOnlyNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).__formKind === 'ui_only'
  )
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

export function heading(
  title: string,
  level: number = 2,
  options?: Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  return new UIOnlyNode('heading', { title, level, ...options })
}

export function text(
  content: string,
  options?: Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  return new UIOnlyNode('text', { content, ...options })
}

export function divider(options?: Partial<UIOnlyDescriptor>): UIOnlyNode {
  return new UIOnlyNode('divider', options)
}

export function spacer(size: number | string = '1em', options?: Partial<UIOnlyDescriptor>): UIOnlyNode {
  return new UIOnlyNode('spacer', { size, ...options })
}

export function alert(
  options: {
    message: string
    title?: string
    tone?: 'info' | 'warning' | 'error' | 'success' | 'neutral'
  } & Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  const { message, title, tone = 'info', ...rest } = options
  return new UIOnlyNode('alert', {
    content: message,
    title,
    tone,
    ...rest,
  })
}

export function button(
  options: {
    label: string
    action: string | ((ctx: FormContext) => void | Promise<void>)
    variant?: string
  } & Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  const { label, action, variant = 'secondary', ...rest } = options
  return new UIOnlyNode('button', {
    title: label,
    action,
    variant,
    ...rest,
  })
}

export function computedDisplay(
  formulaOrFn: string | ((values: Record<string, unknown>, ctx?: FormContext) => unknown),
  options?: {
    label?: string
    format?: string
  } & Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  if (typeof formulaOrFn === 'string') {
    return new UIOnlyNode('computedDisplay', {
      formula: formulaOrFn,
      title: options?.label,
      ...options,
    })
  }
  return new UIOnlyNode('computedDisplay', {
    computedFn: formulaOrFn,
    title: options?.label,
    ...options,
  })
}

export function slot(
  slotName: string,
  options?: Partial<UIOnlyDescriptor>,
): UIOnlyNode {
  return new UIOnlyNode('slot', { slotName, ...options })
}
