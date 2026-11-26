import { describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { s } from '../src'
import { evaluateExpression } from '../src/computed/astEvaluator'
import { f } from '../src/form'
import type { FormFieldNode, FormNode } from '../src/form'
import {
  ITEM,
  PathScope,
  formatPath,
  getAt,
  matchesTemplate,
  parsePath,
  setAt,
  toTemplatePath,
  type PathSegment,
} from '../src/form/paths'

const runs = { numRuns: Number(process.env['FC_RUNS'] ?? 300) }
vi.setConfig({ testTimeout: Math.max(5_000, runs.numRuns * 40) })

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Field names. Never digit-only (that would read as a list index) and no separators. */
const name = fc.stringMatching(/^[a-z][a-z0-9_]{0,5}$/)
/** A small alphabet makes the same key show up at many places, which is the case under test. */
const smallName = fc.constantFrom('a', 'b', 'c')
const index = fc.nat(4)

const concreteSegments = fc.array(fc.oneof(name, index), { minLength: 1, maxLength: 6 })
const templateSegments = fc.array(fc.oneof(name, fc.constant(ITEM)), { maxLength: 6 })
const primitive = fc.oneof(fc.integer(), fc.string(), fc.boolean())

/** Values built only through setAt, so any mix of objects and arrays can occur. */
const rootValues = fc
  .array(fc.tuple(fc.array(fc.oneof(smallName, index), { minLength: 1, maxLength: 4 }), primitive), {
    maxLength: 8,
  })
  .map((writes) => writes.reduce((acc, [path, value]) => setAt(acc, path, value), {} as unknown))

const isPrefix = (a: readonly PathSegment[], b: readonly PathSegment[]) =>
  a.length <= b.length && a.every((s, i) => s === b[i])

// ---------------------------------------------------------------------------
// Path algebra
// ---------------------------------------------------------------------------

describe('path properties', () => {
  it('parse and format round-trip, for concrete and template paths', () => {
    fc.assert(
      fc.property(fc.oneof(concreteSegments, templateSegments), (segments) => {
        const text = formatPath(segments)
        expect(parsePath(text)).toEqual(segments)
        expect(formatPath(parsePath(text))).toBe(text)
      }),
      runs,
    )
  })

  it('reads dotted-numeric paths (as joined validator issues) the same as bracketed ones', () => {
    fc.assert(
      fc.property(concreteSegments, (segments) => {
        expect(parsePath(segments.map(String).join('.'))).toEqual(segments)
      }),
      runs,
    )
  })

  it('templates: idempotent, matched by every concrete path they came from', () => {
    fc.assert(
      fc.property(concreteSegments, concreteSegments, (a, b) => {
        const template = toTemplatePath(a)
        expect(toTemplatePath(template)).toBe(template)
        expect(matchesTemplate(a, template)).toBe(true)
        // two paths with the same template are instances of each other's template
        if (toTemplatePath(b) === template) expect(matchesTemplate(b, template)).toBe(true)
        // a different shape never matches
        if (parsePath(b).length !== parsePath(a).length) expect(matchesTemplate(b, template)).toBe(false)
      }),
      runs,
    )
  })

  it('a value written at a path is read back from it', () => {
    fc.assert(
      fc.property(rootValues, concreteSegments, primitive, (root, path, value) => {
        expect(getAt(setAt(root, path, value), path)).toBe(value)
      }),
      runs,
    )
  })

  it('never mutates its input', () => {
    fc.assert(
      fc.property(rootValues, concreteSegments, primitive, (root, path, value) => {
        const before = structuredClone(root)
        setAt(root, path, value)
        expect(root).toEqual(before)
      }),
      runs,
    )
  })

  it('writing one path leaves every unrelated path alone', () => {
    fc.assert(
      fc.property(rootValues, concreteSegments, concreteSegments, primitive, (root, p, q, value) => {
        fc.pre(!isPrefix(p, q) && !isPrefix(q, p))
        expect(getAt(setAt(root, p, value), q)).toEqual(getAt(root, q))
      }),
      runs,
    )
  })

  it('refuses to write through a template path', () => {
    fc.assert(
      fc.property(templateSegments, primitive, (segments, value) => {
        fc.pre(segments.includes(ITEM))
        expect(() => setAt({}, segments, value)).toThrow(TypeError)
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Scopes: the same key in many places
// ---------------------------------------------------------------------------

describe('scope properties', () => {
  it('a key resolves inside the object the scope points at, and nowhere else', () => {
    fc.assert(
      fc.property(rootValues, concreteSegments, fc.array(smallName, { minLength: 1, maxLength: 3 }), (root, base, ref) => {
        const scope = new PathScope(root, base)
        expect(scope.get(ref)).toEqual(getAt(root, [...base, ...ref]))
        expect(scope.get(['$root', ...ref])).toEqual(getAt(root, ref))
      }),
      runs,
    )
  })

  it('rows that share keys never overwrite each other', () => {
    const writes = fc.array(
      fc.record({ row: fc.nat(4), key: smallName, value: fc.integer() }),
      { minLength: 1, maxLength: 20 },
    )
    fc.assert(
      fc.property(writes, (list) => {
        let root: unknown = {}
        const expected = new Map<string, number>()
        for (const { row, key, value } of list) {
          root = new PathScope(root, ['rows', row]).set(key, value)
          expected.set(`${row}/${key}`, value) // last write to a (row, key) wins
        }
        for (const [id, value] of expected) {
          const [row, key] = id.split('/')
          expect(new PathScope(root, ['rows', Number(row)]).get(key)).toBe(value)
        }
      }),
      runs,
    )
  })

  it('nested lists keep each (row, line) apart', () => {
    const writes = fc.array(
      fc.record({ row: fc.nat(3), line: fc.nat(3), value: fc.integer() }),
      { minLength: 1, maxLength: 20 },
    )
    fc.assert(
      fc.property(writes, (list) => {
        let root: unknown = {}
        const expected = new Map<string, number>()
        for (const { row, line, value } of list) {
          root = setAt(root, ['orders', row, 'lines', line, 'sku'], value)
          expected.set(`${row}/${line}`, value)
        }
        for (const [id, value] of expected) {
          const [row, line] = id.split('/').map(Number)
          const scope = new PathScope(root, ['orders', row, 'lines', line])
          expect(scope.get('sku')).toBe(value)
          expect(scope.index).toBe(line)
          expect(scope.item?.base).toEqual(['orders', row, 'lines', line])
          // $parent leaves the line and lands on the order that owns it
          expect(scope.parent.base).toEqual(['orders', row])
        }
      }),
      runs,
    )
  })

  it('parent and item are always enclosing scopes of the original', () => {
    fc.assert(
      fc.property(concreteSegments, (base) => {
        const scope = new PathScope({}, base)
        expect(isPrefix(scope.parent.base, scope.base)).toBe(true)

        const lastNumber = base.map((s) => typeof s === 'number').lastIndexOf(true)
        if (lastNumber === -1) {
          expect(scope.index).toBeUndefined()
          expect(scope.item).toBeUndefined()
        } else {
          expect(scope.index).toBe(base[lastNumber])
          expect(scope.item?.base).toEqual(base.slice(0, lastNumber + 1))
        }

        // standing on a row, the parent skips both the index and the list's own key
        if (typeof base[base.length - 1] === 'number') {
          expect(scope.parent.base).toEqual(base.slice(0, Math.max(0, base.length - 2)))
        }
        expect(scope.resolve(['$parent', '$parent', 'x'])).toEqual([...scope.parent.parent.base, 'x'])
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Form trees over generated nested forms
// ---------------------------------------------------------------------------

type Spec =
  | { t: 'str' }
  | { t: 'arr'; item: Spec }
  | { t: 'obj'; fields: Array<{ key: string; group: number | null; spec: Spec }> }

const spec = fc.letrec<{ spec: Spec; arr: Spec; obj: Spec }>((tie) => ({
  spec: fc.oneof({ maxDepth: 3, depthIdentifier: 'spec' }, fc.constant<Spec>({ t: 'str' }), tie('arr'), tie('obj')),
  arr: tie('spec').map((item): Spec => ({ t: 'arr', item })),
  obj: fc
    .uniqueArray(
      fc.record({
        key: smallName,
        group: fc.option(fc.constantFrom(0, 1), { nil: null }),
        spec: tie('spec'),
      }),
      { selector: (field) => field.key, minLength: 1, maxLength: 3 },
    )
    .map((fields): Spec => ({ t: 'obj', fields })),
})).obj

function build(node: Spec): any {
  if (node.t === 'str') return s.string()
  if (node.t === 'arr') return s.array(build(node.item))
  const shape: Record<string, unknown> = {}
  const groups = new Map<number, Record<string, unknown>>()
  for (const field of node.fields) {
    const child = build(field.spec)
    if (field.group === null) shape[field.key] = child
    else groups.set(field.group, { ...groups.get(field.group), [field.key]: child })
  }
  // layout containers are transparent: their keys share the struct's namespace
  for (const [group, inner] of groups) shape[`layout_${group}`] = f.row(inner)
  return f.struct(shape)
}

/** Calls `visit` for every node, flagging array item templates. */
function walk(nodes: FormNode[], visit: (node: FormNode, template: boolean) => void, template = false): void {
  for (const node of nodes) {
    visit(node, template)
    if (node.kind === 'layout') walk(node.children, visit, template)
    if (node.kind === 'field') {
      if (node.children) walk(node.children, visit, template)
      if (node.item) {
        visit(node.item, true)
        if (node.item.children) walk(node.item.children, visit, true)
        if (node.item.item) walk([node.item.item], visit, true)
      }
    }
  }
}

describe('form tree properties', () => {
  it('every node id is unique, however often keys repeat', () => {
    fc.assert(
      fc.property(spec, (generated) => {
        const tree = build(generated).toFormTree()
        const ids: string[] = []
        walk(tree.nodes, (node) => ids.push(node.id))
        expect(new Set(ids).size).toBe(ids.length)
      }),
      runs,
    )
  })

  it('fieldsByKey lists exactly the data fields, by template path', () => {
    fc.assert(
      fc.property(spec, (generated) => {
        const tree = build(generated).toFormTree()
        const fieldPaths: string[] = []
        walk(tree.nodes, (node, template) => {
          if (node.kind !== 'field') return
          // a template stands for a row; it is not a field of its own
          if (node.key === '$item') return
          fieldPaths.push(node.path)
          expect(node.path).toBe(toTemplatePath(node.path)) // never a concrete index
          expect(node.id).toBe(node.path)
        })
        expect(Object.keys(tree.fieldsByKey).sort()).toEqual([...new Set(fieldPaths)].sort())
        expect(new Set(fieldPaths).size).toBe(fieldPaths.length)
      }),
      runs,
    )
  })

  it('child paths always extend their parent field path', () => {
    fc.assert(
      fc.property(spec, (generated) => {
        const check = (field: FormFieldNode) => {
          for (const child of field.children ?? []) {
            const nested: FormNode[] = child.kind === 'layout' ? child.children : [child]
            walk(nested, (node) => {
              if (node.kind === 'field') expect(node.path.startsWith(`${field.path}.`)).toBe(true)
            })
          }
          if (field.item) {
            expect(field.item.path).toBe(`${field.path}[]`)
            check(field.item)
          }
        }
        const tree = build(generated).toFormTree()
        walk(tree.nodes, (node) => {
          if (node.kind === 'field' && node.key !== '$item') check(node)
        })
      }),
      runs,
    )
  })

  it('a deeper scope still sees the whole form through $root', () => {
    fc.assert(
      fc.property(fc.array(smallName, { minLength: 1, maxLength: 4 }), fc.integer(), (keys, marker) => {
        const root = setAt({}, ['marker'], marker)
        const deep = new PathScope(root, keys.flatMap((k, i) => (i % 2 ? [k] : [k, i])))
        expect(deep.get('$root.marker')).toBe(marker)
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Controller against an independent model
// ---------------------------------------------------------------------------

const orderForm = f.struct({
  region: s.string(),
  orders: f.field(
    s.array(
      f.struct({
        name: s.string().min(2),
        lines: f.field(s.array(s.struct({ name: s.string(), qty: s.integer() })), { widget: f.table() }),
      }),
    ),
    { widget: f.table() },
  ),
})

/** A plain mutable reference implementation of "write a value at a path". */
function modelSet(root: any, segments: PathSegment[], value: unknown): void {
  let current = root
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] as string | number
    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = typeof segments[i + 1] === 'number' ? [] : {}
    }
    current = current[key]
  }
  current[segments[segments.length - 1] as string | number] = value
}

describe('controller properties', () => {
  const targetPath = fc.oneof(
    fc.constant<PathSegment[]>(['region']),
    fc.tuple(index, fc.constantFrom('name')).map(([i, k]): PathSegment[] => ['orders', i, k]),
    fc
      .tuple(index, index, fc.constantFrom('name', 'qty'))
      .map(([i, j, k]): PathSegment[] => ['orders', i, 'lines', j, k]),
  )

  it('after any sequence of writes the values equal the reference model', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(targetPath, primitive), { maxLength: 15 }), (writes) => {
        const controller = f.createController(orderForm)
        const model: Record<string, unknown> = {}
        for (const [path, value] of writes) {
          controller.setValue(formatPath(path), value)
          modelSet(model, path, value)
        }
        expect(controller.getValues()).toEqual(model)
        for (const [path] of writes) {
          // dotted and bracketed spellings read the same value
          expect(controller.getValue(path.join('.'))).toEqual(controller.getValue(formatPath(path)))
          expect(controller.isFieldTouched(path.join('.'))).toBe(true)
        }
      }),
      runs,
    )
  })

  it('errors land on exactly the rows that are invalid, in one canonical format', () => {
    const rows = fc.array(
      fc.record({ name: fc.string({ maxLength: 4 }), lines: fc.constant([]) }),
      { maxLength: 6 },
    )
    fc.assert(
      fc.property(rows, (orders) => {
        const controller = f.createController(orderForm, { initialValues: { region: 'eu', orders } })
        controller.validate()
        const keys = Object.keys(controller.getErrors())
        const expected = orders.flatMap((row, i) => (row.name.length < 2 ? [`orders[${i}].name`] : []))
        expect(keys.sort()).toEqual(expected.sort())
        for (const key of keys) expect(formatPath(key)).toBe(key)
      }),
      runs,
    )
  })

  it('list operations on one row never touch another row', () => {
    const ops = fc.array(
      fc.record({ row: fc.nat(2), kind: fc.constantFrom('push', 'remove'), value: fc.integer() }),
      { maxLength: 15 },
    )
    fc.assert(
      fc.property(ops, (list) => {
        const initial = [0, 1, 2].map((i) => ({ name: `row${i}`, lines: [] as unknown[] }))
        const controller = f.createController(orderForm, { initialValues: { region: 'eu', orders: initial } })
        const model: Array<unknown[]> = [[], [], []]
        for (const { row, kind, value } of list) {
          const path = `orders[${row}].lines`
          if (kind === 'push') {
            controller.arrayPush(path, { name: 'n', qty: value })
            model[row].push({ name: 'n', qty: value })
          } else {
            controller.arrayRemove(path, 0)
            model[row].shift()
          }
        }
        for (let i = 0; i < 3; i++) expect(controller.getValue(`orders[${i}].lines`)).toEqual(model[i])
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// One list referring to another, and ancestors at any depth
// ---------------------------------------------------------------------------

describe('cross-list and ancestor properties', () => {
  const hazard = 'some($root.warehouses, "bins[].hazard", true)'
  const form = f.struct({
    warehouses: s.array(
      f.struct({ name: s.string(), bins: s.array(s.struct({ code: s.string(), hazard: s.boolean() })) }),
    ),
    shipments: f.field(
      s.array(
        f.struct({
          priority: s.string(),
          certificate: f.when(hazard, { hazmatCert: s.string() }),
          packages: f.field(
            s.array(
              f.struct({
                label: s.string(),
                express: f.when(`$parent.priority == "high" && ${hazard}`, { courier: s.string() }),
              }),
            ),
            { widget: f.table() },
          ),
        }),
      ),
      { widget: f.table() },
    ),
  })

  const warehouses = fc.array(
    fc.record({
      name: fc.constant('w'),
      bins: fc.array(fc.record({ code: fc.constant('b'), hazard: fc.boolean() }), { maxLength: 3 }),
    }),
    { maxLength: 3 },
  )
  const shipments = fc.array(
    fc.record({
      priority: fc.constantFrom('high', 'low'),
      hazmatCert: fc.option(fc.constant('c'), { nil: undefined }),
      packages: fc.array(
        fc.record({ label: fc.constant('p'), courier: fc.option(fc.constant('u'), { nil: undefined }) }),
        { maxLength: 3 },
      ),
    }),
    { maxLength: 4 },
  )

  /** Plain-JS statement of the rules, with no scopes, paths or expressions involved. */
  function expectedErrors(values: { warehouses: any[]; shipments: any[] }): string[] {
    const anyHazard = values.warehouses.some((w) => w.bins.some((b: any) => b.hazard))
    const out: string[] = []
    values.shipments.forEach((row, i) => {
      if (anyHazard && row.hazmatCert === undefined) out.push(`shipments.${i}.hazmatCert`)
      row.packages.forEach((pkg: any, j: number) => {
        if (anyHazard && row.priority === 'high' && pkg.courier === undefined) {
          out.push(`shipments.${i}.packages.${j}.courier`)
        }
      })
    })
    return out.sort()
  }

  const data = fc.record({ warehouses, shipments })

  it('validation matches the plain statement of the rules', () => {
    fc.assert(
      fc.property(data, (values) => {
        const issues = (form.safeParse(values).issues ?? []).map((i) => i.path?.join('.'))
        expect(issues.sort()).toEqual(expectedErrors(values))
      }),
      runs,
    )
  })

  it('validation gives the same answer asynchronously', async () => {
    await fc.assert(
      fc.asyncProperty(data, async (values) => {
        const issues = ((await form.safeParseAsync(values)).issues ?? []).map((i) => i.path?.join('.'))
        expect(issues.sort()).toEqual(expectedErrors(values))
      }),
      runs,
    )
  })

  it('the tree shows a conditional field exactly where validation asks for it', () => {
    fc.assert(
      fc.property(data, (values) => {
        const stripped = {
          warehouses: values.warehouses,
          shipments: values.shipments.map((row) => ({
            priority: row.priority,
            packages: row.packages.map((p) => ({ label: p.label })),
          })),
        }
        const required = new Set((form.safeParse(stripped).issues ?? []).map((i) => i.path?.join('.')))
        const list = form.toFormTree(stripped).nodes.find((n) => n.key === 'shipments') as FormFieldNode
        stripped.shipments.forEach((_, i) => {
          const row = list.resolveItem!(stripped, `shipments[${i}]`)
          const keys = (row?.children ?? []).map((n) => n.key)
          expect(keys.includes('hazmatCert')).toBe(required.has(`shipments.${i}.hazmatCert`))
          const packages = row?.children?.find((n) => n.key === 'packages') as FormFieldNode
          stripped.shipments[i].packages.forEach((__, j) => {
            const pkg = packages.resolveItem!(stripped, `shipments[${i}].packages[${j}]`)
            const pkgKeys = (pkg?.children ?? []).map((n) => n.key)
            expect(pkgKeys.includes('courier')).toBe(required.has(`shipments.${i}.packages.${j}.courier`))
          })
        })
      }),
      runs,
    )
  })

  it('$parent climbs exactly one enclosing row per step, at any depth', () => {
    const depth = fc.integer({ min: 1, max: 6 })
    fc.assert(
      fc.property(depth, fc.array(index, { minLength: 6, maxLength: 6 }), fc.nat(8), (d, picks, up) => {
        // a chain of rows: L0 (root) -> kids[i1] (L1) -> kids[i2] (L2) ... each named after its level
        const base: PathSegment[] = []
        let root: unknown = { name: 'L0' }
        for (let level = 1; level <= d; level++) {
          base.push('kids', picks[level - 1])
          root = setAt(root, [...base, 'name'], `L${level}`)
        }
        const scope = new PathScope(root, base)
        const ref = [...Array<string>(up).fill('$parent'), 'name'].join('.')
        // standing on level d, k parents up is level d-k; past the top it stays at the root
        expect(scope.get(ref)).toBe(`L${Math.max(0, d - up)}`)
        expect(scope.get('$root.name')).toBe('L0')
        expect(evaluateExpression(`${ref} == "L${Math.max(0, d - up)}"`, scope.context())).toBe(true)
      }),
      runs,
    )
  })

  it('pluck, some, every and count agree with plain array methods', () => {
    fc.assert(
      fc.property(warehouses, (list) => {
        const flags = list.flatMap((w) => w.bins.map((b) => b.hazard))
        const ctx = { list }
        expect(evaluateExpression('pluck(list, "bins[].hazard")', ctx)).toEqual(flags)
        expect(evaluateExpression('some(list, "bins[].hazard", true)', ctx)).toBe(flags.some(Boolean))
        expect(evaluateExpression('every(list, "bins[].hazard", true)', ctx)).toBe(flags.every(Boolean))
        expect(evaluateExpression('count(list, "bins[].hazard", true)', ctx)).toBe(flags.filter(Boolean).length)
        expect(evaluateExpression('count(list)', ctx)).toBe(list.length)
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Row drafts against the form itself
// ---------------------------------------------------------------------------

describe('row draft properties', () => {
  const hazard = 'some($root.warehouses, "bins[].hazard", true)'
  const form = f.struct({
    warehouses: s.array(f.struct({ name: s.string(), bins: s.array(s.struct({ code: s.string(), hazard: s.boolean() })) })),
    shipments: f.field(
      s.array(
        f.struct({
          priority: s.string(),
          certificate: f.when(hazard, { hazmatCert: s.string() }),
          packages: f.field(
            s.array(
              f.struct({
                label: s.string(),
                express: f.when(`$parent.priority == "high" && ${hazard}`, { courier: s.string() }),
              }),
            ),
            { widget: f.table() },
          ),
        }),
      ),
      { widget: f.table() },
    ),
  })

  const data = fc.record({
    warehouses: fc.array(
      fc.record({
        name: fc.constant('w'),
        bins: fc.array(fc.record({ code: fc.constant('b'), hazard: fc.boolean() }), { maxLength: 3 }),
      }),
      { maxLength: 3 },
    ),
    shipments: fc.array(
      fc.record({
        priority: fc.constantFrom('high', 'low'),
        hazmatCert: fc.option(fc.constant('c'), { nil: undefined }),
        packages: fc.array(
          fc.record({ label: fc.constant('p'), courier: fc.option(fc.constant('u'), { nil: undefined }) }),
          { minLength: 1, maxLength: 3 },
        ),
      }),
      { minLength: 1, maxLength: 4 },
    ),
  })

  const clone = <V,>(v: V): V => structuredClone(v)
  const edit = fc.record({
    priority: fc.option(fc.constantFrom('high', 'low'), { nil: undefined }),
    hazmatCert: fc.constantFrom<'keep' | 'set' | 'clear'>('keep', 'set', 'clear'),
  })

  function applyEdit(row: any, e: { priority?: string; hazmatCert: string }): void {
    if (e.priority !== undefined) row.priority = e.priority
    if (e.hazmatCert === 'set') row.hazmatCert = 'c'
    if (e.hazmatCert === 'clear') delete row.hazmatCert
  }

  function applyEditTo(draft: { setValue(path: string, v: unknown): void }, e: { priority?: string; hazmatCert: string }): void {
    if (e.priority !== undefined) draft.setValue('priority', e.priority)
    if (e.hazmatCert === 'set') draft.setValue('hazmatCert', 'c')
    if (e.hazmatCert === 'clear') draft.setValue('hazmatCert', undefined)
  }

  /** What the form itself says about one row, with paths relative to it. */
  function rootErrorsUnder(values: unknown, row: number): string[] {
    return (form.safeParse(values).issues ?? [])
      .map((i) => i.path ?? [])
      .filter((p) => p[0] === 'shipments' && p[1] === row)
      .map((p) => formatPath(p.slice(2) as Array<string | number>))
      .sort()
  }

  it('a draft judges its row exactly as the whole form does', () => {
    fc.assert(
      fc.property(data, edit, fc.nat(3), (values, e, pick) => {
        const row = pick % values.shipments.length
        const controller = f.createController(form, { initialValues: clone(values) as any })
        const draft = controller.scoped('shipments', row)
        applyEditTo(draft, e)
        draft.validate()

        const expected = clone(values)
        applyEdit(expected.shipments[row], e)
        expect(Object.keys(draft.getErrors()).sort()).toEqual(rootErrorsUnder(expected, row))
      }),
      runs,
    )
  })

  it('commit equals a direct write exactly when the row is valid; otherwise nothing changes', () => {
    fc.assert(
      fc.property(data, edit, fc.nat(3), (values, e, pick) => {
        const row = pick % values.shipments.length
        const controller = f.createController(form, { initialValues: clone(values) as any })
        const before = clone(controller.getValues())

        const draft = controller.scoped('shipments', row)
        applyEditTo(draft, e)
        // nothing leaks before commit
        expect(controller.getValues()).toEqual(before)

        const expected = clone(values)
        applyEdit(expected.shipments[row], e)
        const valid = rootErrorsUnder(expected, row).length === 0

        expect(draft.commit()).toBe(valid)
        expect(controller.getValues()).toEqual(valid ? expected : before)
      }),
      runs,
    )
  })

  it('discarding never changes the form', () => {
    fc.assert(
      fc.property(data, edit, fc.nat(3), (values, e, pick) => {
        const controller = f.createController(form, { initialValues: clone(values) as any })
        const before = clone(controller.getValues())
        const draft = controller.scoped('shipments', pick % values.shipments.length)
        applyEditTo(draft, e)
        draft.discard()
        expect(controller.getValues()).toEqual(before)
      }),
      runs,
    )
  })

  it('a nested commit chain lands where one write at the absolute path would', () => {
    fc.assert(
      fc.property(data, fc.nat(3), fc.nat(3), fc.string({ maxLength: 4 }), (values, a, b, label) => {
        const i = a % values.shipments.length
        const j = b % values.shipments[i].packages.length
        const controller = f.createController(form, { initialValues: clone(values) as any })
        const before = clone(controller.getValues())

        const shipment = controller.scoped('shipments', i)
        const pkg = shipment.scoped('packages', j)
        expect(pkg.base).toEqual(['shipments', i, 'packages', j])
        pkg.setValue('label', label)

        const expected = setAt(clone(values), ['shipments', i, 'packages', j, 'label'], label)
        const innerOk = rootErrorsUnder(expected, i).filter((e) => e.startsWith(`packages[${j}]`)).length === 0
        expect(pkg.commit()).toBe(innerOk)
        if (!innerOk) {
          expect(shipment.getValue(`packages[${j}].label`)).toBe(values.shipments[i].packages[j].label)
          return
        }
        expect(shipment.getValue(`packages[${j}].label`)).toBe(label)
        expect(controller.getValues()).toEqual(before) // still only in the middle draft
        const outerOk = rootErrorsUnder(expected, i).length === 0
        expect(shipment.commit()).toBe(outerOk)
        expect(controller.getValues()).toEqual(outerOk ? expected : before)
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Wizard navigation against a plain model
// ---------------------------------------------------------------------------

describe('wizard navigation properties', () => {
  const STEPS = 5
  const form = f.struct({
    wizard: f.steps(
      Object.fromEntries(
        Array.from({ length: STEPS }, (_, i) => [`s${i}`, f.section(`Step ${i}`, { [`f${i}`]: s.string().min(1) })]),
      ),
    ),
  })
  const filled = fc.array(fc.boolean(), { minLength: STEPS, maxLength: STEPS })
  const moves = fc.array(fc.integer({ min: -1, max: STEPS }), { maxLength: 10 })

  function make(isFilled: boolean[]) {
    const values = Object.fromEntries(isFilled.flatMap((ok, i) => (ok ? [[`f${i}`, 'x']] : [])))
    const controller = f.createController(form, { initialValues: values })
    const wizard = (controller.getTree().nodes[0] as any).id as string
    return { controller, wizard }
  }

  it('lands where a plain model says, and never beyond a step that cannot be left', () => {
    fc.assert(
      fc.property(filled, moves, (isFilled, targets) => {
        const { controller, wizard } = make(isFilled)
        let position = 0
        for (const target of targets) {
          const moved = controller.setStep(target, wizard)
          if (target < 0 || target >= STEPS) {
            expect(moved).toBe(false)
          } else if (target <= position) {
            expect(moved).toBe(true) // going back or staying never validates
            position = target
          } else {
            const blocked = Array.from({ length: target - position }, (_, k) => position + k).find((i) => !isFilled[i])
            expect(moved).toBe(blocked === undefined)
            position = blocked === undefined ? target : blocked
          }
          expect(controller.getStep(wizard)).toBe(position)
          expect(position).toBeGreaterThanOrEqual(0)
          expect(position).toBeLessThan(STEPS)
        }
      }),
      runs,
    )
  })

  it('only the steps it checked carry errors', () => {
    fc.assert(
      fc.property(filled, fc.integer({ min: 1, max: STEPS - 1 }), (isFilled, target) => {
        const { controller, wizard } = make(isFilled)
        controller.setStep(target, wizard)
        // going forward stops at the first step that cannot be left, and only that step is marked
        const firstUnfilled = isFilled.indexOf(false)
        const errored = Object.keys(controller.getErrors()).sort()
        const expected = firstUnfilled !== -1 && firstUnfilled < target ? [`f${firstUnfilled}`] : []
        expect(errored).toEqual(expected)
      }),
      runs,
    )
  })
})

// ---------------------------------------------------------------------------
// Reactive field options against a plain statement of the rules
// ---------------------------------------------------------------------------

describe('reactive option properties', () => {
  const CITIES: Record<string, string[]> = { DE: ['Berlin', 'Munich'], FR: ['Paris'] }
  const form = f.struct({
    qty: s.number(),
    flag: s.boolean(),
    country: s.string(),
    locked: f.field(s.string().optional(), { disabledWhen: 'qty > 5', readonlyWhen: 'flag', hiddenWhen: 'qty == 0' }),
    reason: f.field(s.string().min(2), { requiredWhen: 'flag && qty > 1' }),
    city: f.field(s.string().optional(), { options: { by: 'country', map: CITIES } }),
    total: f.field(s.number().optional(), { derive: 'qty * 2' }),
  })

  const data = fc.record({
    qty: fc.integer({ min: 0, max: 9 }),
    flag: fc.boolean(),
    country: fc.constantFrom('DE', 'FR', 'XX'),
    locked: fc.option(fc.constant('l'), { nil: undefined }),
    reason: fc.option(fc.constantFrom('', 'a', 'ok'), { nil: undefined }),
    city: fc.option(fc.constantFrom('Berlin', 'Paris', 'Rome'), { nil: undefined }),
    total: fc.option(fc.integer(), { nil: undefined }),
  })

  it('the tree shows the flags a plain function of the values would', () => {
    fc.assert(
      fc.property(data, (v) => {
        const { fieldsByKey: n } = form.toFormTree(v)
        expect(n.locked.disabled).toBe(v.qty > 5)
        expect(n.locked.readonly).toBe(v.flag)
        expect(n.locked.hidden).toBe(v.qty === 0)
        expect(n.reason.required).toBe(v.flag && v.qty > 1)
        expect(n.city.options?.map((o) => o.value)).toEqual(CITIES[v.country] ?? [])
        expect(n.total.derivedValue).toBe(v.qty * 2)
      }),
      runs,
    )
  })

  it('validation accepts and rejects exactly what the rules say', () => {
    fc.assert(
      fc.property(data, (v) => {
        const issues = (form.safeParse(v).issues ?? []).map((i) => i.path?.join('.')).sort()
        const expected: string[] = []
        const required = v.flag && v.qty > 1
        const reasonEmpty = v.reason === undefined || v.reason === ''
        if (required && reasonEmpty) expected.push('reason')
        // a value that is given must satisfy the schema, whether or not it is required
        else if (!reasonEmpty && v.reason!.length < 2) expected.push('reason')
        if (v.city !== undefined && !(CITIES[v.country] ?? []).includes(v.city)) expected.push('city')
        expect(issues).toEqual(expected.sort())
      }),
      runs,
    )
  })

  it('the parsed output always carries the computed value', () => {
    fc.assert(
      fc.property(data, (v) => {
        const result = form.safeParse(v)
        if (result.success) expect((result.data as any).total).toBe(v.qty * 2)
      }),
      runs,
    )
  })
})
