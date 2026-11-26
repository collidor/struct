import { descriptorToFormTree } from '../../src/form'
import type { FormFieldNode } from '../../src/form'

/** The fields a plain schema or descriptor gives a form, in order. */
export function fieldsOf(schemaOrDescriptor: { descriptor: any } | any): FormFieldNode[] {
  const descriptor = 'descriptor' in schemaOrDescriptor ? schemaOrDescriptor.descriptor : schemaOrDescriptor
  return descriptorToFormTree(descriptor).nodes as FormFieldNode[]
}
