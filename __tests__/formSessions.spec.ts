import { describe, expect, it, vi } from 'vitest'
import { s } from '../src'
import { f, FormValidationError } from '../src/form'

describe('steps and tabs by container', () => {
  const form = f.struct({
    first: f.steps({
      a: f.section('A', { name: s.string().min(2) }),
      b: f.section('B', { email: s.string().email() }),
      c: f.section('C', { note: s.string().optional() }),
    }),
    holder: f.section('Holder', {
      second: f.steps({
        a: f.section('A', { nick: s.string().min(2) }),
        b: f.section('B', { zip: s.string().min(3) }),
      }),
    }),
    tabsOne: f.tabs({ x: f.section('X', { t1: s.string().optional() }), y: f.section('Y', { t2: s.string().optional() }) }),
    tabsTwo: f.tabs({ x: f.section('X', { t3: s.string().optional() }), y: f.section('Y', { t4: s.string().optional() }) }),
  })

  const ids = (controller: ReturnType<typeof f.createController>) => {
    const containers: Record<string, string> = {}
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === 'layout') {
          containers[node.key] = node.id
          walk(node.children)
        }
      }
    }
    walk(controller.getTree().nodes)
    return containers
  }

  it('keeps each steps container on its own position', () => {
    const controller = f.createController(form, { initialValues: { name: 'ok', email: 'a@b.co', nick: 'ok', zip: '12345' } })
    const { first, second } = ids(controller)
    expect(first).not.toBe(second)

    expect(controller.setStep(1, first)).toBe(true)
    expect(controller.getStep(first)).toBe(1)
    expect(controller.getStep(second)).toBe(0)
    expect(controller.setStep(1, second)).toBe(true)
    expect(controller.getStep(first)).toBe(1)
    expect(controller.getTotalSteps(first)).toBe(3)
    expect(controller.getTotalSteps(second)).toBe(2)
  })

  it('stops at the first step that cannot be left, and says why', () => {
    const onStepError = vi.fn()
    const controller = f.createController(form, { initialValues: { name: 'x' }, onStepError })
    const { first } = ids(controller)

    expect(controller.setStep(2, first)).toBe(false) // jumping ahead checks step a, then b
    expect(controller.getStep(first)).toBe(0) // stays on the first failing step
    expect(controller.getErrors()['name']).toBeDefined()
    expect(controller.getState().stepErrors[first]).toHaveLength(1)
    expect(onStepError).toHaveBeenCalledWith(first, 'a', expect.objectContaining({ name: expect.any(String) }))

    controller.setValue('name', 'fine')
    expect(controller.setStep(1, first)).toBe(true)
    expect(controller.getState().stepErrors[first]).toBeUndefined()
    // step b's own field is still empty: going on is refused, and only b's errors are touched
    expect(controller.setStep(2, first)).toBe(false)
    expect(Object.keys(controller.getErrors())).toEqual(['email'])
  })

  it('a step only owns its own fields', () => {
    const controller = f.createController(form, { initialValues: { name: 'ok' } })
    const { second } = ids(controller)
    // `nick` is invalid but belongs to the other container
    expect(controller.validateStep(0, ids(controller).first)).toBe(true)
    expect(controller.validateStep(0, second)).toBe(false)
    expect(Object.keys(controller.getErrors())).toEqual(['nick'])
  })

  it('moving backwards never validates', () => {
    const controller = f.createController(form, { initialValues: { name: 'ok', email: 'a@b.co' } })
    const { first } = ids(controller)
    controller.setStep(1, first)
    controller.setValue('name', '')
    expect(controller.prevStep(first)).toBe(true)
    expect(controller.getStep(first)).toBe(0)
  })

  it('keeps tabs containers with identical keys apart', () => {
    const controller = f.createController(form)
    const { tabsOne, tabsTwo } = ids(controller)
    expect(controller.getTab(tabsOne)).toBe('x')
    controller.setTab(tabsOne, 'y')
    expect(controller.getTab(tabsOne)).toBe('y')
    expect(controller.getTab(tabsTwo)).toBe('x')
    expect(controller.getState().activeTabs).toEqual({ [tabsOne]: 'y' })
  })

  it('the single-wizard API still refers to the first steps container', () => {
    const controller = f.createController(form, { initialValues: { name: 'ok' } })
    expect(controller.getTotalSteps()).toBe(3)
    expect(controller.nextStep()).toBe(true)
    expect(controller.getCurrentStep()).toBe(1)
    expect(controller.nextStep()).toBe(false)
    expect(controller.prevStep()).toBe(true)
  })
})

describe('parsed submit', () => {
  const form = f.struct({ name: s.string().min(2), role: s.string().default('member'), note: f.when('false', { x: s.string() }) })

  it('hands over the parsed output, not the raw values', async () => {
    const onSubmit = vi.fn()
    const controller = f.createController(form, { initialValues: { name: 'Ada', extra: 1 } as any, onSubmit })
    const data = await controller.submit()
    expect(data).toEqual({ name: 'Ada', role: 'member' })
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', role: 'member' })
  })

  it('refuses invalid data with the errors attached', async () => {
    const onSubmit = vi.fn()
    const controller = f.createController(form, { initialValues: { name: 'x' }, onSubmit })
    const error = await controller.submit().catch((e) => e)
    expect(error).toBeInstanceOf(FormValidationError)
    expect(Object.keys(error.errors)).toEqual(['name'])
    expect(onSubmit).not.toHaveBeenCalled()
    expect(controller.getState().isSubmitting).toBe(false)
  })
})

describe('row drafts', () => {
  const hazard = 'some($root.warehouses, "bins[].hazard", true)'
  const form = f.struct({
    warehouses: s.array(f.struct({ name: s.string(), bins: s.array(s.struct({ code: s.string(), hazard: s.boolean() })) })),
    shipments: f.field(
      s.array(
        f.struct({
          priority: s.string(),
          certificate: f.when(hazard, { hazmatCert: s.string() }),
          rush: f.when('priority == "high"', { rushNote: s.string() }),
          packages: f.field(
            s.array(
              f.struct({
                label: s.string().min(2),
                express: f.when(`$parent.priority == "high" && ${hazard}`, { courier: s.string() }),
                parts: f.field(s.array(s.struct({ sku: s.string().min(2) })), { widget: f.table() }),
              }),
            ),
            { widget: f.table() },
          ),
        }),
      ),
      { widget: f.table() },
    ),
  })
  const hazardous = [{ name: 'w', bins: [{ code: 'a', hazard: true }] }]
  const safe = [{ name: 'w', bins: [{ code: 'a', hazard: false }] }]
  const keys = (nodes: { key: string }[]) => nodes.map((n) => n.key)

  const make = (warehouses = safe) =>
    f.createController(form, {
      initialValues: { warehouses, shipments: [{ priority: 'low', packages: [] }] } as any,
    })

  it('edits a copy: the form changes only on commit', () => {
    const controller = make()
    const row = controller.scoped('shipments', 0)
    row.setValue('priority', 'high')
    expect(row.getValue('priority')).toBe('high')
    expect(controller.getValue('shipments[0].priority')).toBe('low')
    expect(row.getState().dirty).toBe(true)

    expect(row.commit()).toBe(false) // priority high now needs rushNote
    expect(controller.getValue('shipments[0].priority')).toBe('low')
    row.setValue('rushNote', 'asap')
    expect(row.commit()).toBe(true)
    expect(controller.getValue('shipments[0].priority')).toBe('high')
    expect(controller.getValue('shipments[0].rushNote')).toBe('asap')
  })

  it('discarding leaves the form untouched', () => {
    const controller = make()
    const row = controller.scoped('shipments', 0)
    row.setValue('priority', 'high')
    row.discard()
    expect(controller.getValue('shipments[0].priority')).toBe('low')
  })

  it('a new row starts from blanks and is appended on commit', () => {
    const controller = make()
    const row = controller.scoped('shipments')
    expect(row.isNew).toBe(true)
    expect(row.index).toBe(1)
    expect(row.getValues()).toMatchObject({ priority: '', packages: [] })
    row.setValue('priority', 'low')
    expect(row.commit()).toBe(true)
    expect(controller.getValue('shipments')).toHaveLength(2)
    expect(controller.getValue('shipments[1].priority')).toBe('low')
  })

  it('shows fields as the draft changes, and as the other list changes', () => {
    const controller = make(hazardous)
    const row = controller.scoped('shipments', 0)
    expect(keys(row.getTree().nodes)).toEqual(['priority', 'hazmatCert', 'packages'])
    row.setValue('priority', 'high')
    expect(keys(row.getTree().nodes)).toEqual(['priority', 'hazmatCert', 'rushNote', 'packages'])
    row.setValue('priority', 'low')
    expect(keys(row.getTree().nodes)).toEqual(['priority', 'hazmatCert', 'packages'])

    const calm = make(safe).scoped('shipments', 0)
    expect(keys(calm.getTree().nodes)).toEqual(['priority', 'packages'])
  })

  it('reports errors relative to the row, judged against the whole form', () => {
    const controller = make(hazardous)
    const row = controller.scoped('shipments', 0)
    expect(row.validate()).toBe(false)
    expect(Object.keys(row.getErrors())).toEqual(['hazmatCert'])
    expect(row.getFieldError('hazmatCert')).toBeDefined()
    row.setValue('hazmatCert', 'c')
    expect(row.validate()).toBe(true)
  })

  it('edits rows three lists deep, committing inward to outward', () => {
    const controller = make(hazardous)
    controller.setValue('shipments[0].hazmatCert', 'c')

    const shipment = controller.scoped('shipments', 0)
    const pkg = shipment.scoped('packages')
    expect(pkg.base).toEqual(['shipments', 0, 'packages', 0])
    // the nested row sees its parent's priority (low) and the other list (hazardous): no courier
    expect(keys(pkg.getTree().nodes)).toEqual(['label', 'parts'])
    shipment.setValue('priority', 'high')
    shipment.setValue('rushNote', 'n')
    expect(keys(pkg.getTree().nodes)).toEqual(['label', 'courier', 'parts']) // live: parent changed

    const part = pkg.scoped('parts')
    expect(part.base).toEqual(['shipments', 0, 'packages', 0, 'parts', 0])
    part.setValue('sku', 'x')
    expect(part.commit()).toBe(false)
    expect(part.getErrors()['sku']).toBeDefined()
    part.setValue('sku', 'ok')
    expect(part.commit()).toBe(true)
    // landed in the package draft only
    expect(pkg.getValue('parts')).toEqual([{ sku: 'ok' }])
    expect(shipment.getValue('packages')).toEqual([])

    pkg.setValue('label', 'box')
    pkg.setValue('courier', 'ups')
    expect(pkg.commit()).toBe(true)
    expect(shipment.getValue('packages')).toEqual([{ label: 'box', courier: 'ups', parts: [{ sku: 'ok' }] }])
    expect(controller.getValue('shipments[0].packages')).toEqual([])

    expect(shipment.commit()).toBe(true)
    expect(controller.getValue('shipments[0]')).toMatchObject({
      priority: 'high',
      packages: [{ label: 'box', courier: 'ups', parts: [{ sku: 'ok' }] }],
    })
  })

  it('addresses fields relative to the row at every depth', () => {
    const controller = make(hazardous)
    controller.setValue('shipments[0].hazmatCert', 'c')
    const shipment = controller.scoped('shipments', 0)
    const pkg = shipment.scoped('packages')
    const part = pkg.scoped('parts')

    const paths = (nodes: any[]): string[] => nodes.map((n) => n.path)
    expect(paths(shipment.getTree().nodes)).toEqual(['priority', 'hazmatCert', 'packages'])
    expect(paths(pkg.getTree().nodes)).toEqual(['label', 'parts'])
    expect(paths(part.getTree().nodes)).toEqual(['sku'])
    // the nested list field remembers where it sits from the form root
    expect(pkg.findField('parts')?.absPath).toBe('shipments[].packages[].parts')
    // and every path in a draft's tree is something that draft can read and write
    for (const draft of [shipment, pkg, part]) {
      for (const field of draft.getTree().nodes.flatMap((n: any) => (n.kind === 'field' ? [n] : []))) {
        draft.setValue(field.path, field.type === 'array' ? [] : 'v')
        expect(draft.getValue(field.path)).toEqual(field.type === 'array' ? [] : 'v')
      }
    }
  })

  it('discarding a middle draft throws away what its inner draft committed', () => {
    const controller = make()
    const shipment = controller.scoped('shipments', 0)
    const pkg = shipment.scoped('packages')
    pkg.setValue('label', 'box')
    expect(pkg.commit()).toBe(true)
    expect(shipment.getValue('packages')).toHaveLength(1)
    shipment.discard()
    expect(controller.getValue('shipments[0].packages')).toEqual([])
  })

  it('notifies subscribers of the draft, not of the form', () => {
    const controller = make()
    const onForm = vi.fn()
    controller.subscribe(onForm)
    onForm.mockClear()
    const row = controller.scoped('shipments', 0)
    const onRow = vi.fn()
    row.subscribe(onRow)
    onRow.mockClear()
    row.setValue('priority', 'low2')
    expect(onRow).toHaveBeenCalled()
    expect(onForm).not.toHaveBeenCalled()
  })
})

describe('validation work', () => {
  it('parses the form once for a jump over several steps, not once per step', () => {
    const form = f.struct({
      wizard: f.steps(
        Object.fromEntries(
          Array.from({ length: 5 }, (_, i) => [`s${i}`, f.section(`Step ${i}`, { [`f${i}`]: s.string().min(1) })]),
        ),
      ),
    })
    const values = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}`, 'x']))
    let parses = 0
    const counted = {
      toFormTree: (v: any, c?: any) => form.toFormTree(v, c),
      safeParse: (v: unknown) => (parses++, form.safeParse(v)),
    }
    const controller = f.createController(counted as any, { initialValues: values })
    const wizard = (controller.getTree().nodes[0] as any).id

    expect(controller.setStep(4, wizard)).toBe(true)
    expect(controller.getStep(wizard)).toBe(4)
    expect(parses).toBe(1) // four steps were checked on the way
  })
})
