import { describe, it, expect } from 'vitest'
import { f } from '../src/form/index'
import type { Infer } from '../src/types/inference'

describe('@collidor/struct/form Unified Form Builder', () => {
  it('unifies spatial layouts: puts two inputs on the same line with f.row and flattens data shape', () => {
    const UserProfileForm = f.struct({
      nameRow: f.row({
        firstName: f.string().describe('Given name'),
        lastName: f.string().describe('Family name'),
      }, { gap: '1rem' }),
      email: f.string().describe('Email address'),
    })

    // TypeScript inferred data shape should be completely flat:
    // { firstName: string; lastName: string; email: string }
    type UserProfileData = Infer<typeof UserProfileForm>
    const sampleData: UserProfileData = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    }

    // Validation parses the flat data structure
    const parsed = UserProfileForm.parse(sampleData)
    expect(parsed).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    })

    // UI Form Node Tree retains the hierarchical row layout
    const tree = UserProfileForm.toFormTree(sampleData)
    expect(tree.nodes.length).toBe(2) // nameRow (layout) and email (field)

    const rowNode = tree.nodes[0]
    expect(rowNode.kind).toBe('layout')
    if (rowNode.kind === 'layout') {
      expect(rowNode.layoutKind).toBe('row')
      expect(rowNode.options?.gap).toBe('1rem')
      expect(rowNode.children.length).toBe(2)
      expect(rowNode.children[0].kind).toBe('field')
      expect(rowNode.children[0].key).toBe('firstName')
      expect(rowNode.children[1].kind).toBe('field')
      expect(rowNode.children[1].key).toBe('lastName')
    }

    expect(tree.fieldsByKey.firstName).toBeDefined()
    expect(tree.fieldsByKey.lastName).toBeDefined()
    expect(tree.fieldsByKey.email).toBeDefined()
  })

  it('strips UI-only nodes from data model while keeping them in UI tree', () => {
    const CheckoutForm = f.struct({
      topAlert: f.alert({
        title: 'Review Order',
        message: 'Please double-check your shipping info before proceeding.',
        tone: 'info',
      }),
      header: f.heading('Customer Information', 2),
      email: f.string(),
      divider1: f.divider(),
      spacer1: f.spacer('2rem'),
      computedTax: f.computedDisplay('subtotal * 0.2', { label: 'Estimated VAT (20%)' }),
      submitBtn: f.button({ label: 'Place Order', action: 'submit' }),
    })

    // Data parsing: UI-only nodes do not expect data, and do not pollute output
    const data = {
      email: 'customer@collidor.dev',
      subtotal: 100,
    }

    const result = CheckoutForm.parse(data)
    expect(result).toEqual({ email: 'customer@collidor.dev' })
    expect('topAlert' in result).toBe(false)
    expect('header' in result).toBe(false)
    expect('divider1' in result).toBe(false)
    expect('spacer1' in result).toBe(false)
    expect('computedTax' in result).toBe(false)
    expect('submitBtn' in result).toBe(false)

    // In the UI tree, UI-only nodes are preserved and computed values are evaluated
    const tree = CheckoutForm.toFormTree({ email: 'customer@collidor.dev', subtotal: 100 })
    expect(tree.nodes.length).toBe(7)

    const alertNode = tree.nodes[0]
    expect(alertNode.kind).toBe('ui_only')
    if (alertNode.kind === 'ui_only') {
      expect(alertNode.uiKind).toBe('alert')
      expect(alertNode.descriptor.title).toBe('Review Order')
    }

    const computedNode = tree.nodes[5]
    expect(computedNode.kind).toBe('ui_only')
    if (computedNode.kind === 'ui_only') {
      expect(computedNode.uiKind).toBe('computedDisplay')
      expect(computedNode.computedValue).toBe(20) // 100 * 0.2 = 20
    }
  })

  it('supports conditional rendering and coupled validation with f.when (expression and predicate)', () => {
    const RegistrationForm = f.struct({
      accountType: f.enum(['personal', 'business']),
      businessFields: f.when('accountType == "business"', {
        companyName: f.string(),
        vatNumber: f.string(),
      }),
    })

    // 1. When accountType is personal, businessFields validation is skipped!
    const personalResult = RegistrationForm.safeParse({
      accountType: 'personal',
    })
    expect(personalResult.success).toBe(true)
    if (personalResult.success) {
      expect(personalResult.data).toEqual({ accountType: 'personal' })
    }

    // 2. When accountType is business, companyName and vatNumber are required!
    const businessIncomplete = RegistrationForm.safeParse({
      accountType: 'business',
    })
    expect(businessIncomplete.success).toBe(false)

    const businessComplete = RegistrationForm.safeParse({
      accountType: 'business',
      companyName: 'Collidor Inc',
      vatNumber: 'GB123456789',
    })
    expect(businessComplete.success).toBe(true)
    if (businessComplete.success) {
      expect(businessComplete.data).toEqual({
        accountType: 'business',
        companyName: 'Collidor Inc',
        vatNumber: 'GB123456789',
      })
    }

    // Form tree dynamically mounts/unmounts conditional fields based on values
    const personalTree = RegistrationForm.toFormTree({ accountType: 'personal' })
    expect(personalTree.nodes.map((n) => n.key)).toEqual(['accountType'])

    const businessTree = RegistrationForm.toFormTree({ accountType: 'business' })
    expect(businessTree.nodes.map((n) => n.key)).toEqual([
      'accountType',
      'companyName',
      'vatNumber',
    ])
  })

  it('supports predicate functions in f.when', () => {
    const SurveyForm = f.struct({
      score: f.number(),
      feedback: f.when((vals) => Number(vals.score) < 5, {
        reason: f.string(),
      }),
    })

    const goodScore = SurveyForm.safeParse({ score: 9 })
    expect(goodScore.success).toBe(true)

    const badScoreMissingReason = SurveyForm.safeParse({ score: 2 })
    expect(badScoreMissingReason.success).toBe(false)

    const badScoreWithReason = SurveyForm.safeParse({ score: 2, reason: 'Too slow' })
    expect(badScoreWithReason.success).toBe(true)
  })

  it('supports numeric comparison and string contains/equality to show or hide fields', () => {
    const DynamicForm = f.struct({
      quantity: f.number().default(1),
      notes: f.string().default(''),

      // Show extraShippingDetails if quantity > 5
      bulkOptions: f.when('quantity > 5', {
        palletCount: f.number().min(1),
      }),

      // Hide promotionalOffer if notes equals "subtext" or contains "subtext"
      promoBanner: f.unless('notes == "subtext" || contains(notes, "subtext")', {
        discountCode: f.string(),
      }),
    })

    // Case 1: quantity <= 5, notes does NOT contain subtext
    // Expected: palletCount hidden (validation skipped), discountCode active (required)
    const tree1 = DynamicForm.toFormTree({ quantity: 3, notes: 'standard order' })
    expect(tree1.fieldsByKey.palletCount).toBeUndefined()
    expect(tree1.fieldsByKey.discountCode).toBeDefined()

    // Validation passes without palletCount, fails without discountCode
    expect(DynamicForm.safeParse({ quantity: 3, notes: 'standard order' }).success).toBe(false)
    expect(DynamicForm.safeParse({ quantity: 3, notes: 'standard order', discountCode: 'SAVE10' }).success).toBe(true)

    // Case 2: quantity > 5, notes contains "subtext"
    // Expected: palletCount active (required), discountCode hidden (suppressed)
    const tree2 = DynamicForm.toFormTree({ quantity: 10, notes: 'order with subtext promo' })
    expect(tree2.fieldsByKey.palletCount).toBeDefined()
    expect(tree2.fieldsByKey.discountCode).toBeUndefined()

    // Validation requires palletCount, but discountCode is optional/suppressed
    expect(DynamicForm.safeParse({ quantity: 10, notes: 'order with subtext promo' }).success).toBe(false)
    expect(DynamicForm.safeParse({ quantity: 10, notes: 'order with subtext promo', palletCount: 2 }).success).toBe(true)
  })

  it('supports 100% pure JSON serializable rule objects without any JS functions', () => {
    // Both condition and schema descriptor are pure JSON serializable
    const PureJsonRuleForm = f.struct({
      numericField: f.number(),
      textField: f.string(),

      // Numeric > 5 as structured JSON rule
      numericBranch: f.when({ field: 'numericField', op: '>', value: 5 }, {
        highValueBonus: f.string(),
      }),

      // Hide if textField == 'subtext' OR textField contains 'subtext' as structured JSON rule
      textBranch: f.unless(
        {
          or: [
            { field: 'textField', op: '==', value: 'subtext' },
            { field: 'textField', op: 'contains', value: 'subtext' },
          ],
        },
        {
          regularOffer: f.string(),
        },
      ),
    })

    // Case A: numericField = 3, textField = 'hello'
    // numericBranch hidden, textBranch active
    const treeA = PureJsonRuleForm.toFormTree({ numericField: 3, textField: 'hello' })
    expect(treeA.fieldsByKey.highValueBonus).toBeUndefined()
    expect(treeA.fieldsByKey.regularOffer).toBeDefined()

    // Case B: numericField = 8, textField = 'contains subtext inside'
    // numericBranch active, textBranch hidden
    const treeB = PureJsonRuleForm.toFormTree({ numericField: 8, textField: 'contains subtext inside' })
    expect(treeB.fieldsByKey.highValueBonus).toBeDefined()
    expect(treeB.fieldsByKey.regularOffer).toBeUndefined()
  })

  it('supports list presence, contains, and not_contains in both string expressions and structured rules', () => {
    const TaggedForm = f.struct({
      roles: f.array(f.string()).default([]),
      tags: f.array(f.string()).default([]),

      // Expression string: show securityControls if roles contains "admin"
      securityBranch: f.when('contains(roles, "admin")', {
        adminToken: f.string(),
      }),

      // Expression string: hide stagingBanner if tags contains "prod"
      stagingBranch: f.when('not_contains(tags, "prod")', {
        stagingWatermark: f.string(),
      }),

      // Structured rule: show audit if roles contains "auditor"
      auditorBranch: f.when({ field: 'roles', op: 'contains', value: 'auditor' }, {
        auditLogRetention: f.number(),
      }),

      // Structured rule: hide sandbox if tags not_contains "sandbox" (or contains)
      sandboxBranch: f.when({ field: 'tags', op: 'not_contains', value: 'legacy' }, {
        modernPipeline: f.boolean(),
      }),
    })

    // Case 1: roles = ['developer'], tags = ['prod', 'legacy']
    // contains(roles, 'admin') -> false (adminToken hidden)
    // not_contains(tags, 'prod') -> false (stagingWatermark hidden)
    // contains(roles, 'auditor') -> false (auditLogRetention hidden)
    // not_contains(tags, 'legacy') -> false (modernPipeline hidden)
    const tree1 = TaggedForm.toFormTree({ roles: ['developer'], tags: ['prod', 'legacy'] })
    expect(tree1.fieldsByKey.adminToken).toBeUndefined()
    expect(tree1.fieldsByKey.stagingWatermark).toBeUndefined()
    expect(tree1.fieldsByKey.auditLogRetention).toBeUndefined()
    expect(tree1.fieldsByKey.modernPipeline).toBeUndefined()

    // Case 2: roles = ['developer', 'admin', 'auditor'], tags = ['staging', 'fast']
    // contains(roles, 'admin') -> true (adminToken visible)
    // not_contains(tags, 'prod') -> true (stagingWatermark visible)
    // contains(roles, 'auditor') -> true (auditLogRetention visible)
    // not_contains(tags, 'legacy') -> true (modernPipeline visible)
    const tree2 = TaggedForm.toFormTree({
      roles: ['developer', 'admin', 'auditor'],
      tags: ['staging', 'fast'],
    })
    expect(tree2.fieldsByKey.adminToken).toBeDefined()
    expect(tree2.fieldsByKey.stagingWatermark).toBeDefined()
    expect(tree2.fieldsByKey.auditLogRetention).toBeDefined()
    expect(tree2.fieldsByKey.modernPipeline).toBeDefined()
  })

  it('unifies collection view modes: asTable, asList, asCards, asTabs, asTags', () => {
    const ItemSchema = f.struct({
      id: f.string(),
      name: f.string(),
      quantity: f.number(),
      price: f.number(),
    })

    const OrderSchema = f.struct({
      orderId: f.string(),
      itemsTable: f.array(ItemSchema).asTable({
        sortable: true,
        columns: [
          { key: 'name', label: 'Item Name', width: '40%' },
          { key: 'quantity', label: 'Qty', width: '20%', align: 'center' },
          { key: 'price', label: 'Price', width: '20%', align: 'right' },
          { key: 'total', label: 'Total', computed: 'quantity * price' },
        ],
        aggregations: [{ column: 'price', op: 'sum', label: 'Total Order' }],
      }),
      tagsList: f.array(f.string()).asTags({ maxTags: 5 }),
    })

    expect(OrderSchema.shape.itemsTable.collectionView?.mode).toBe('table')
    expect(OrderSchema.shape.tagsList.collectionView?.mode).toBe('tags')

    const parsed = OrderSchema.parse({
      orderId: 'ORD-001',
      itemsTable: [{ id: '1', name: 'Widget', quantity: 2, price: 15 }],
      tagsList: ['priority', 'retail'],
    })

    expect(parsed.itemsTable.length).toBe(1)
    expect(parsed.tagsList).toEqual(['priority', 'retail'])
  })

  it('supports multi-level nested layouts: tabs -> grid -> row', () => {
    const ComplexForm = f.struct({
      settingsTabs: f.tabs({
        general: f.grid({
          appName: f.string(),
          rowDetails: f.row({
            host: f.string(),
            port: f.number(),
          }),
        }, { columns: 2 }),
        security: f.section('Security Keys', {
          apiKey: f.string(),
          secretKey: f.string(),
        }),
      }),
    })

    // Data shape is completely flat at the root!
    const valid = ComplexForm.safeParse({
      appName: 'My App',
      host: 'localhost',
      port: 8080,
      apiKey: 'xyz',
      secretKey: 'topsecret',
    })

    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data).toEqual({
        appName: 'My App',
        host: 'localhost',
        port: 8080,
        apiKey: 'xyz',
        secretKey: 'topsecret',
      })
    }

    const tree = ComplexForm.toFormTree()
    expect(tree.nodes[0].kind).toBe('layout')
    if (tree.nodes[0].kind === 'layout') {
      expect(tree.nodes[0].layoutKind).toBe('tabs')
    }
  })

  it('manages reactive form state and step validation with HeadlessFormController', () => {
    const WizardForm = f.struct({
      wizardSteps: f.steps({
        step1: f.section('Step 1: Account', {
          username: f.string().nonempty('Username is required'),
        }),
        step2: f.section('Step 2: Profile', {
          bio: f.string(),
        }),
      }),
    })

    const controller = f.createController(WizardForm, {
      initialValues: { username: '' },
    })

    expect(controller.getCurrentStep()).toBe(0)
    expect(controller.getTotalSteps()).toBe(2)

    // Cannot advance to step 2 while step 1 has invalid data
    const advanced = controller.nextStep()
    expect(advanced).toBe(false)
    expect(controller.getCurrentStep()).toBe(0)
    expect(controller.getErrors()['username']).toBeDefined()

    // Provide valid username
    controller.setValue('username', 'alovelace')
    expect(controller.getValue('username')).toBe('alovelace')
    expect(controller.isDirty()).toBe(true)

    // Now step 1 is valid, should advance to step 2!
    const advanced2 = controller.nextStep()
    expect(advanced2).toBe(true)
    expect(controller.getCurrentStep()).toBe(1)

    // Step 2 validation
    controller.setValue('bio', 'Mathematician & Pioneer')
    expect(controller.validate()).toBe(true)
  })

  it('provides array collection helpers on HeadlessFormController', () => {
    const TeamForm = f.struct({
      members: f.array(
        f.struct({
          name: f.string(),
          role: f.string(),
        }),
      ).asList(),
    })

    const controller = f.createController(TeamForm, {
      initialValues: {
        members: [{ name: 'Alice', role: 'Dev' }],
      },
    })

    // Array push
    controller.arrayPush('members', { name: 'Bob', role: 'Designer' })
    expect((controller.getValue('members') as any[]).length).toBe(2)

    // Array duplicate
    controller.arrayDuplicate('members', 0)
    expect((controller.getValue('members') as any[]).length).toBe(3)
    expect((controller.getValue('members') as any[])[1]).toEqual({ name: 'Alice', role: 'Dev' })

    // Array move
    controller.arrayMove('members', 0, 2)
    expect((controller.getValue('members') as any[])[2].name).toBe('Alice')

    // Array remove
    controller.arrayRemove('members', 0)
    expect((controller.getValue('members') as any[]).length).toBe(2)
  })

  it('satisfies Standard Schema V1 spec', () => {
    const Form = f.struct({
      title: f.string(),
      row: f.row({
        a: f.number(),
        b: f.number(),
      }),
    })

    const standardProps = Form['~standard']
    expect(standardProps.version).toBe(1)
    expect(standardProps.vendor).toBe('collidor-struct')

    const resSuccess = standardProps.validate({ title: 'Test', a: 1, b: 2 })
    expect('value' in resSuccess).toBe(true)

    const resFail = standardProps.validate({ title: 'Test', a: 'invalid' })
    expect('issues' in resFail).toBe(true)
  })
})
