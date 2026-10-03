export interface NavItem {
  id: string
  title: string
  badge?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { id: 'overview', title: 'Overview' },
      { id: 'installation', title: 'Installation' },
      { id: 'quickstart', title: 'Quickstart' },
    ],
  },
  {
    title: 'Schema Builders',
    items: [
      { id: 'primitives', title: 'Primitives & Types' },
      { id: 'strings', title: 'String Rules & Sanitizers' },
      { id: 'numbers', title: 'Number Rules & Coercions' },
      { id: 'structs', title: 'Structs & Objects' },
      { id: 'collections', title: 'Arrays, Tuples & Records' },
      { id: 'unions', title: 'Enums, Literals & Unions' },
      { id: 'modifiers', title: 'Refinements & Transforms' },
    ],
  },
  {
    title: 'Interop Bridges',
    items: [
      { id: 'standard-schema', title: 'Standard Schema V1', badge: 'Spec' },
      { id: 'zod-bridge', title: 'Zod Bridge (to/fromZod)' },
      { id: 'json-schema', title: 'JSON Schema (OpenAPI)' },
      { id: 'axon-bridge', title: 'Axon Graph Subtyping', badge: 'Lattice' },
    ],
  },
  {
    title: 'UI & Forms',
    items: [
      { id: 'form-inspector', title: 'Form Inspector & Widgets' },
      { id: 'collidor-ui-form', title: 'Native <ui-struct-form>', badge: 'Lit' },
    ],
  },
  {
    title: 'Storage & Migrations',
    items: [
      { id: 'sql-ddl', title: 'SQL DDL Generator' },
      { id: 'migrations', title: 'Schema Migration Engine' },
    ],
  },
  {
    title: 'Computed Properties',
    items: [
      { id: 'formula-parser', title: 'Formula Parser (AST)' },
      { id: 'computed-evaluator', title: 'Reactive Evaluator' },
    ],
  },
  {
    title: 'Playground',
    items: [
      { id: 'workbench', title: 'Live Interactive Workbench', badge: 'Live' },
    ],
  },
]
