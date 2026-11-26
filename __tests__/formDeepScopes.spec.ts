import { describe, expect, it } from 'vitest'
import { s } from '../src'
import { evaluateExpression } from '../src/computed/astEvaluator'
import { f } from '../src/form'
import type { FormFieldNode, FormNode } from '../src/form'
import { PathScope, getAll } from '../src/form/paths'

const keys = (nodes: FormNode[] | undefined) => (nodes ?? []).map((n) => n.key)

function field(nodes: FormNode[] | undefined, key: string): FormFieldNode {
  const found = (nodes ?? []).find((n) => n.key === key)
  if (!found || found.kind !== 'field') throw new Error(`no field "${key}"`)
  return found
}

describe('list functions in expressions', () => {
  const ctx = {
    warehouses: [
      { name: 'north', bins: [{ code: 'n1', hazard: false }, { code: 'n2', hazard: true }] },
      { name: 'south', bins: [{ code: 's1', hazard: false }] },
      { name: 'east' }, // no bins at all
    ],
  }
  const run = (expr: string) => evaluateExpression(expr, ctx)

  it('looks into rows and, with [], into lists nested in rows', () => {
    expect(run('pluck(warehouses, "name")')).toEqual(['north', 'south', 'east'])
    expect(run('pluck(warehouses, "bins[].code")')).toEqual(['n1', 'n2', 's1'])
    expect(run('some(warehouses, "bins[].hazard", true)')).toBe(true)
    expect(run('some(warehouses, "bins[].code", "zz")')).toBe(false)
    expect(run('every(warehouses, "name")')).toBe(true)
    expect(run('every(warehouses, "bins[].hazard")')).toBe(false)
    expect(run('count(warehouses)')).toBe(3)
    expect(run('count(warehouses, "bins[].hazard", false)')).toBe(2)
  })

  it('treats missing lists as empty', () => {
    expect(evaluateExpression('some(nothing, "x")', {})).toBe(false)
    expect(evaluateExpression('every(nothing, "x")', {})).toBe(true)
    expect(evaluateExpression('count(nothing)', {})).toBe(0)
    expect(getAll({ a: 1 }, 'b[].c')).toEqual([])
  })
})

describe('deep nesting', () => {
  const form = f.struct({
    tier: s.string(),
    regions: f.field(
      s.array(
        f.struct({
          name: s.string(),
          sites: f.field(
            s.array(
              f.struct({
                name: s.string(),
                racks: f.field(
                  s.array(
                    f.struct({
                      name: s.string(),
                      units: f.field(
                        s.array(
                          f.struct({
                            serial: s.string().min(2),
                            // three levels up: the region
                            gold: f.when('$parent.$parent.$parent.name == "emea"', { discount: s.number() }),
                          }),
                        ),
                        { widget: f.table() },
                      ),
                    }),
                  ),
                  { widget: f.table() },
                ),
              }),
            ),
            { widget: f.table() },
          ),
        }),
      ),
      { widget: f.table() },
    ),
  })

  const deep = 'regions[1].sites[0].racks[2].units[3]'

  it('describes every level once, by template, with the same leaf key at each', () => {
    const tree = form.toFormTree()
    expect(Object.keys(tree.fieldsByKey)).toEqual(
      expect.arrayContaining([
        'regions',
        'regions[].name',
        'regions[].sites',
        'regions[].sites[].name',
        'regions[].sites[].racks',
        'regions[].sites[].racks[].name',
        'regions[].sites[].racks[].units',
        'regions[].sites[].racks[].units[].serial',
      ]),
    )
    expect(tree.fieldsByKey['regions[].name'].key).toBe('name')
    expect(tree.fieldsByKey['regions[].sites[].name'].key).toBe('name')
  })

  it('reads and writes four levels down without disturbing siblings', () => {
    const controller = f.createController(form)
    controller.setValue(`${deep}.serial`, 'AB')
    controller.setValue('regions[1].sites[0].racks[2].units[0].serial', 'CD')
    controller.setValue('regions[0].name', 'apac')

    expect(controller.getValue(`${deep}.serial`)).toBe('AB')
    expect(controller.getValue('regions[1].sites[0].racks[2].units[0].serial')).toBe('CD')
    expect(controller.getValue('regions[0].name')).toBe('apac')
    expect(controller.getValue('regions[1].name')).toBeUndefined()
    expect(controller.getValue('regions.1.sites.0.racks.2.units.3.serial')).toBe('AB')
  })

  it('reaches up through every level with $parent', () => {
    const values = { tier: 'top', regions: [{ name: 'x' }, { name: 'emea', sites: [{ racks: [{}, {}, { units: [{}, {}, {}, { serial: 's' }] }] }] }] }
    const scope = new PathScope(values, deep)
    expect(scope.get('serial')).toBe('s')
    expect(scope.get('$parent.$parent.$parent.name')).toBe('emea')
    expect(scope.get('$parent.$parent.$parent.$parent.$root.tier')).toBe('top')
    expect(evaluateExpression('$parent.$parent.$parent.name == "emea"', scope.context())).toBe(true)
    expect(evaluateExpression('$root.tier', scope.context())).toBe('top')
    expect(evaluateExpression('$index', scope.context())).toBe(3)
  })

  it('resolves a row at any depth against its own ancestors', () => {
    const values = {
      regions: [
        { name: 'apac', sites: [{ racks: [{ units: [{ serial: 'a' }] }] }] },
        { name: 'emea', sites: [{ racks: [{ units: [{ serial: 'b' }] }] }] },
      ],
    }
    const tree = form.toFormTree(values)
    const descend = (root: FormFieldNode, path: string, key: string) =>
      field(root.resolveItem!(values, path)?.children, key)

    const regions = field(tree.nodes, 'regions')
    const sites = descend(regions, 'regions[1]', 'sites')
    const racks = descend(sites, 'regions[1].sites[0]', 'racks')
    const units = descend(racks, 'regions[1].sites[0].racks[0]', 'units')

    // the unit row inside `emea` shows the discount; the one inside `apac` does not
    expect(keys(units.resolveItem!(values, 'regions[1].sites[0].racks[0].units[0]')?.children)).toEqual(['serial', 'discount'])
    const apacUnits = descend(
      descend(descend(regions, 'regions[0]', 'sites'), 'regions[0].sites[0]', 'racks'),
      'regions[0].sites[0].racks[0]',
      'units',
    )
    expect(keys(apacUnits.resolveItem!(values, 'regions[0].sites[0].racks[0].units[0]')?.children)).toEqual(['serial'])
  })

  it('validates a conditional field four levels down with the right ancestors', () => {
    const base = (region: string, discount?: number) => ({
      tier: 't',
      regions: [{ name: region, sites: [{ name: 'a', racks: [{ name: 'r', units: [{ serial: 'ok', ...(discount === undefined ? {} : { discount }) }] }] }] }],
    })
    expect(form.safeParse(base('apac')).success).toBe(true)
    const missing = form.safeParse(base('emea'))
    expect(missing.success).toBe(false)
    expect(missing.issues?.map((i) => i.path?.join('.'))).toEqual(['regions.0.sites.0.racks.0.units.0.discount'])
    expect(form.safeParse(base('emea', 5)).success).toBe(true)
  })
})

describe('one list referring to another', () => {
  const hazard = 'some($root.warehouses, "bins[].hazard", true)'
  const form = f.struct({
    warehouses: s.array(
      f.struct({
        name: s.string(),
        bins: s.array(s.struct({ code: s.string(), hazard: s.boolean() })),
      }),
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
                // a row two levels down, using its parent's value AND the other list
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

  const safe = [{ name: 'w', bins: [{ code: 'a', hazard: false }] }]
  const hazardous = [{ name: 'w', bins: [{ code: 'a', hazard: false }, { code: 'b', hazard: true }] }]
  const shipments = [
    { priority: 'high', packages: [{ label: 'p0' }] },
    { priority: 'low', packages: [{ label: 'p1' }] },
  ]
  const errorsOf = (values: unknown) =>
    (form.safeParse(values).issues ?? []).map((i) => i.path?.join('.')).sort()

  it('requires fields only while some row of the other list has the flag', () => {
    expect(errorsOf({ warehouses: safe, shipments })).toEqual([])
    expect(errorsOf({ warehouses: hazardous, shipments })).toEqual([
      'shipments.0.hazmatCert',
      'shipments.0.packages.0.courier', // high priority AND hazard
      'shipments.1.hazmatCert', // hazard alone
    ])
  })

  it('follows the other list as it changes', () => {
    const covered = shipments.map((row) => ({ ...row, hazmatCert: 'c', packages: row.packages.map((p) => ({ ...p, courier: 'ups' })) }))
    expect(errorsOf({ warehouses: hazardous, shipments: covered })).toEqual([])
    // clearing the last hazardous bin releases every requirement at once
    expect(errorsOf({ warehouses: safe, shipments })).toEqual([])
    // no warehouses at all: still no hazard
    expect(errorsOf({ warehouses: [], shipments })).toEqual([])
  })

  it('shows the same fields in the tree as validation requires', () => {
    for (const warehouses of [safe, hazardous]) {
      const values = { warehouses, shipments }
      const tree = form.toFormTree(values)
      const list = field(tree.nodes, 'shipments')
      const required = new Set(errorsOf(values))

      shipments.forEach((_, i) => {
        const row = list.resolveItem!(values, `shipments[${i}]`)
        const hasCert = keys(row?.children).includes('hazmatCert')
        expect(hasCert).toBe(required.has(`shipments.${i}.hazmatCert`))

        const packages = field(row?.children, 'packages')
        const pkg = packages.resolveItem!(values, `shipments[${i}].packages[0]`)
        expect(keys(pkg?.children).includes('courier')).toBe(required.has(`shipments.${i}.packages.0.courier`))
      })
    }
  })

  it('the template follows the other list but not a row it has no values for', () => {
    const templateKeys = (warehouses: unknown) =>
      keys(field(form.toFormTree({ warehouses, shipments }).nodes, 'shipments').item?.children)
    // depends only on the other list: known without a row
    expect(templateKeys(safe)).toEqual(['priority', 'packages'])
    expect(templateKeys(hazardous)).toEqual(['priority', 'hazmatCert', 'packages'])
    // depends on the row's own priority: unknowable until a row is resolved
    const hazardList = field(form.toFormTree({ warehouses: hazardous, shipments }).nodes, 'shipments')
    const packages = field(hazardList.item?.children, 'packages')
    expect(keys(packages.item?.children)).toEqual(['label'])
  })
})

describe('$root inside a validated row', () => {
  it('sees the whole form, not the row', () => {
    const form = f.struct({
      mode: s.string(),
      rows: s.array(f.struct({ x: f.when('$root.mode == "on"', { y: s.string() }) })),
    })
    expect(form.safeParse({ mode: 'on', rows: [{}] }).success).toBe(false)
    expect(form.safeParse({ mode: 'off', rows: [{}] }).success).toBe(true)
    expect(form.safeParse({ mode: 'on', rows: [{ y: 'z' }] }).success).toBe(true)
  })

  it('validates asynchronously with the same answer', async () => {
    const form = f.struct({
      mode: s.string(),
      rows: s.array(f.struct({ x: f.when('$root.mode == "on"', { y: s.string() }) })),
    })
    expect((await form.safeParseAsync({ mode: 'on', rows: [{}] })).success).toBe(false)
    expect((await form.safeParseAsync({ mode: 'off', rows: [{}] })).success).toBe(true)
  })
})
