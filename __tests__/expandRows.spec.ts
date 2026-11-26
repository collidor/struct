import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { s } from '../src'
import { f } from '../src/form'
import type { FormFieldNode, FormNode } from '../src/form'

const hazard = 'some($root.warehouses, "bins[].hazard", true)'
const form = f.struct({
  warehouses: s.array(f.struct({ name: s.string(), bins: s.array(s.struct({ hazard: s.boolean() })) })),
  shipments: f.field(
    s.array(
      f.struct({
        priority: s.string(),
        rush: f.when('priority == "high"', { rushNote: s.string() }),
        cert: f.when(hazard, { hazmatCert: s.string() }),
        packages: f.field(
          s.array(
            f.struct({
              label: s.string(),
              express: f.when(`$parent.priority == "high"`, { courier: s.string() }),
              memo: f.field(s.string().optional(), { disabledWhen: '$parent.priority == "low"' }),
            }),
          ),
          { widget: f.table() },
        ),
      }),
    ),
    { widget: f.table() },
  ),
})

const values = {
  warehouses: [{ name: 'w', bins: [{ hazard: true }] }],
  shipments: [
    { priority: 'high', packages: [{ label: 'a' }, { label: 'b' }] },
    { priority: 'low', packages: [{ label: 'c' }] },
  ],
}
const keys = (nodes?: FormNode[]) => (nodes ?? []).map((n) => n.key)
const shipments = (tree: ReturnType<typeof form.toFormTree>) => tree.fieldsByKey.shipments as FormFieldNode

describe('expanded rows', () => {
  it('are absent unless asked for', () => {
    expect(shipments(form.toFormTree(values)).rows).toBeUndefined()
  })

  it('give each existing row its own resolved subtree', () => {
    const list = shipments(form.toFormTree(values, { expandRows: true }))
    expect(list.rows).toHaveLength(2)
    expect(keys(list.rows![0].children)).toEqual(['priority', 'rushNote', 'hazmatCert', 'packages'])
    expect(keys(list.rows![1].children)).toEqual(['priority', 'hazmatCert', 'packages'])
  })

  it('say where each row sits, with concrete paths', () => {
    const list = shipments(form.toFormTree(values, { expandRows: true }))
    expect(list.rows!.map((r) => r.rowPath)).toEqual(['shipments[0]', 'shipments[1]'])
    const packages = list.rows![0].children!.find((c) => c.key === 'packages') as FormFieldNode
    expect(packages.rows!.map((r) => r.rowPath)).toEqual(['shipments[0].packages[0]', 'shipments[0].packages[1]'])
  })

  it('expand lists inside rows, judged against their own parent row', () => {
    const list = shipments(form.toFormTree(values, { expandRows: true }))
    const rowPackages = (i: number) => list.rows![i].children!.find((c) => c.key === 'packages') as FormFieldNode
    expect(keys(rowPackages(0).rows![0].children)).toEqual(['label', 'courier', 'memo']) // parent is high
    expect(keys(rowPackages(1).rows![0].children)).toEqual(['label', 'memo']) // parent is low
    const memo = (i: number) => rowPackages(i).rows![0].children!.find((c) => c.key === 'memo') as FormFieldNode
    expect(memo(0).disabled).toBe(false)
    expect(memo(1).disabled).toBe(true)
  })

  it('equal what resolveItem gives, row by row', () => {
    const list = shipments(form.toFormTree(values, { expandRows: true }))
    values.shipments.forEach((_, i) => {
      const resolved = list.resolveItem!(values, `shipments[${i}]`)!
      expect(JSON.parse(JSON.stringify(list.rows![i]))).toEqual(JSON.parse(JSON.stringify({ ...resolved, rows: undefined })))
    })
  })

  it('survive JSON, which is the point', () => {
    const wire = JSON.parse(JSON.stringify(form.toFormTree(values, { expandRows: true })))
    const rows = wire.fieldsByKey.shipments.rows
    expect(rows[0].children.map((c: any) => c.key)).toContain('rushNote')
    expect(rows[1].children.map((c: any) => c.key)).not.toContain('rushNote')
    expect(rows[0].children.find((c: any) => c.key === 'packages').rows).toHaveLength(2)
  })

  it('are empty for an empty or missing list, and need no values', () => {
    expect(shipments(form.toFormTree({ shipments: [] }, { expandRows: true })).rows).toEqual([])
    expect(shipments(form.toFormTree({}, { expandRows: true })).rows).toBeUndefined()
    expect(() => form.toFormTree(undefined, { expandRows: true })).not.toThrow()
  })

  it('follow the data, row for row, for any shipments', () => {
    const priority = fc.constantFrom('high', 'low')
    const rows = fc.array(
      fc.record({ priority, packages: fc.array(fc.record({ label: fc.constant('p') }), { maxLength: 3 }) }),
      { maxLength: 5 },
    )
    fc.assert(
      fc.property(rows, fc.boolean(), (data, anyHazard) => {
        const all = { warehouses: [{ name: 'w', bins: [{ hazard: anyHazard }] }], shipments: data }
        const list = shipments(form.toFormTree(all, { expandRows: true }))
        expect(list.rows?.length ?? 0).toBe(data.length)
        data.forEach((row, i) => {
          const childKeys = keys(list.rows![i].children)
          expect(childKeys.includes('rushNote')).toBe(row.priority === 'high')
          expect(childKeys.includes('hazmatCert')).toBe(anyHazard)
          const pk = list.rows![i].children!.find((c) => c.key === 'packages') as FormFieldNode
          expect(pk.rows?.length ?? 0).toBe(row.packages.length)
          pk.rows?.forEach((p) => expect(keys(p.children).includes('courier')).toBe(row.priority === 'high'))
        })
      }),
      { numRuns: 300 },
    )
  })
})
