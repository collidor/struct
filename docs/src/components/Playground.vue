<script setup vapor lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { s, toZod, toJSONSchema, generateStructDDL, getFormFields } from '@collidor/struct'
import { f, form } from '@collidor/struct/form'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { PLAYGROUND_PRESETS, type PlaygroundPreset } from '../data/playgroundSnippets'
import { highlightCode } from '../utils/highlight'

const props = withDefaults(
  defineProps<{
    fullScreen?: boolean
  }>(),
  {
    fullScreen: false,
  }
)

const presets = PLAYGROUND_PRESETS
const selectedPresetId = ref(presets[0].id)
const schemaCode = ref(presets[0].code)
const jsonPayload = ref(presets[0].sampleValid)

const activeTab = ref<'form' | 'validation' | 'formtree' | 'jsonschema' | 'ddl' | 'zod' | 'fields'>('form')

const structFormRef = ref<HTMLElement | null>(null)
const validationResult = ref<any>(null)
const jsonSchemaOutput = ref('')
const ddlSqliteOutput = ref('')
const ddlPostgresOutput = ref('')
const formFieldsOutput = ref('')
const formTreeOutput = ref('')
const zodCodeOutput = ref('')
const compileError = ref<string | null>(null)
const formSubmittedValues = ref<any>(null)
const isFormFetching = ref(false)

const schemaEditorHost = ref<HTMLElement | null>(null)
const payloadEditorHost = ref<HTMLElement | null>(null)

let schemaEditorView: EditorView | null = null
let payloadEditorView: EditorView | null = null

let isInternalSchemaUpdate = false
let isInternalPayloadUpdate = false

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.86rem',
    background: 'transparent',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "var(--ui-font-mono, 'SF Mono', 'Fira Code', Menlo, Consolas, monospace)",
    lineHeight: '1.55',
  },
  '.cm-content': {
    padding: '8px 0',
  },
  '.cm-gutters': {
    background: 'var(--ui-color-surface-dim, oklch(0.14 0.015 260))',
    color: 'var(--ui-color-text-subtle, oklch(0.55 0.02 260))',
    borderRight: '1px solid var(--ui-color-border-subtle, oklch(0.25 0.02 260))',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--ui-color-primary, oklch(0.65 0.19 230))',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--ui-color-primary-subtle, rgba(99, 102, 241, 0.35))',
  },
})

function updateSchemaEditor(newCode: string) {
  if (!schemaEditorView) return
  if (schemaEditorView.state.doc.toString() !== newCode) {
    isInternalSchemaUpdate = true
    try {
      schemaEditorView.dispatch({
        changes: { from: 0, to: schemaEditorView.state.doc.length, insert: newCode },
      })
    } finally {
      isInternalSchemaUpdate = false
    }
  }
}

function updatePayloadEditor(newJson: string) {
  if (!payloadEditorView) return
  if (payloadEditorView.state.doc.toString() !== newJson) {
    isInternalPayloadUpdate = true
    try {
      payloadEditorView.dispatch({
        changes: { from: 0, to: payloadEditorView.state.doc.length, insert: newJson },
      })
    } finally {
      isInternalPayloadUpdate = false
    }
  }
}

function initEditors() {
  if (schemaEditorHost.value && !schemaEditorView) {
    schemaEditorView = new EditorView({
      doc: schemaCode.value,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        baseTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isInternalSchemaUpdate) {
            schemaCode.value = update.state.doc.toString()
            compileAndInspect()
          }
        }),
      ],
      parent: schemaEditorHost.value,
    })
  }

  if (payloadEditorHost.value && !payloadEditorView) {
    payloadEditorView = new EditorView({
      doc: jsonPayload.value,
      extensions: [
        basicSetup,
        json(),
        oneDark,
        baseTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isInternalPayloadUpdate) {
            jsonPayload.value = update.state.doc.toString()
            compileAndInspect()
          }
        }),
      ],
      parent: payloadEditorHost.value,
    })
  }
}

const highlightedJsonSchema = computed(() => highlightCode(jsonSchemaOutput.value, 'json'))
const highlightedDdlSqlite = computed(() => highlightCode(ddlSqliteOutput.value, 'sql'))
const highlightedDdlPostgres = computed(() => highlightCode(ddlPostgresOutput.value, 'sql'))
const highlightedFormFields = computed(() => highlightCode(formFieldsOutput.value, 'json'))
const highlightedFormTree = computed(() => highlightCode(formTreeOutput.value, 'json'))
const highlightedValidationValue = computed(() =>
  validationResult.value?.value
    ? highlightCode(JSON.stringify(validationResult.value.value, null, 2), 'json')
    : ''
)
const highlightedFormSubmitted = computed(() =>
  formSubmittedValues.value
    ? highlightCode(JSON.stringify(formSubmittedValues.value, null, 2), 'json')
    : ''
)

let compiledSchema: any = null

function buildPresetSchema(id: string) {
  if (id === 'complex-wizard') {
    return f.struct({
      onboarding: f.steps({
        organization: f.section({
          title: '1. Organization',
          description: 'Corporate identity and compliance tier',
        }, {
          notice: f.alert({
            title: 'Enterprise Tenant Provisioning',
            message: 'Specify your corporate identity and primary compliance profile. Step validation blocks Next if required fields are missing.',
            tone: 'info',
          }),
          companyRow: f.row({
            companyName: f.string().min(2).describe('Company Legal Name'),
            workspaceSlug: f.string().min(2).toLowerCase().describe('Workspace URL Slug'),
          }),
          corpGrid: f.grid({
            industry: f.enum(['technology', 'finance', 'healthcare', 'retail']).default('technology').describe('Industry Sector'),
            foundedYear: f.number().integer().min(1900).max(2026).default(2021).describe('Founded Year'),
            taxId: f.string().min(5).describe('Corporate Tax / VAT ID'),
          }, { columns: 3 }),
          complianceWhen: f.when('industry == "finance" || industry == "healthcare"', {
            complianceOfficer: f.string().describe('Data Compliance Officer'),
            auditSchedule: f.enum(['quarterly', 'continuous']).default('continuous').describe('Audit Frequency'),
          }),
        }),
        plan: f.section('2. Plan & Billing', {
          planRow: f.row({
            tier: f.enum(['starter', 'pro', 'enterprise']).default('enterprise').describe('Subscription Tier'),
            billingCycle: f.enum(['monthly', 'annual']).default('annual').describe('Billing Frequency'),
          }),
          teamSize: f.number().min(5).max(500).step(5).default(25).describe('Team Seat Allocation'),
          enterpriseWhen: f.when('tier == "enterprise"', {
            customDomain: f.optional(f.string().url()).describe('Custom Vanity Domain (SSO)'),
            dedicatedSupport: f.boolean().default(true).describe('24/7 Dedicated Support & SLA'),
          }),
          costEstimate: f.computedDisplay('teamSize * (tier == "enterprise" ? 45 : tier == "pro" ? 25 : 10)', {
            label: 'Estimated Cost ($/mo)',
          }),
        }),
        resources: f.section('3. Infrastructure', {
          clusterNodes: f.array(
            f.struct({
              name: f.string().describe('Node Name'),
              service: f.enum(['database', 'compute', 'storage', 'ingress']).describe('Service Type'),
              instances: f.number().integer().positive().describe('Instances'),
              costPerHour: f.number().positive().describe('Rate ($/hr)'),
            })
          ).asTable({
            sortable: true,
            columns: [
              { key: 'name', label: 'Node Cluster', width: '35%' },
              { key: 'service', label: 'Service', width: '25%' },
              { key: 'instances', label: 'Qty', width: '15%', align: 'center' },
              { key: 'costPerHour', label: 'Rate/Hr', width: '25%', align: 'right' },
            ],
            aggregations: [
              { column: 'costPerHour', op: 'sum', label: 'Total Hourly Rate' },
            ],
          }).describe('Allocated Cluster Infrastructure'),
          environmentTags: f.array(f.string()).asTags().describe('Environment Tags (e.g. prod, us-east, pci-dss)'),
        }),
        governance: f.section('4. Review & Security', {
          governanceHeading: f.heading('Security Controls & Review', 3),
          adminRow: f.row({
            rootAdminEmail: f.string().email().describe('Root Admin Email'),
            contactPhone: f.string().min(6).describe('Emergency Security Phone'),
          }),
          securityRow: f.row({
            enforceMfa: f.boolean().default(true).describe('Enforce Hardware FIDO2 / MFA'),
            auditLogging: f.boolean().default(true).describe('Enable Immutable Audit Logs (SOC2)'),
          }),
          acceptTerms: f.boolean().default(true).describe('I confirm agreement to the Enterprise Master Terms & DPA'),
        }),
      }, { validateOnNext: true }),
    })
  }

  if (id === 'unified-form') {
    return f.struct({
      banner: f.alert({
        title: 'Profile Setup',
        message: 'Layout nodes flatten data; UI-only nodes are stripped from output.',
        tone: 'info',
      }),
      nameRow: f.row({
        firstName: f.string().min(2).describe('First Name'),
        lastName: f.string().min(2).describe('Last Name'),
      }, { gap: '1rem' }),
      accountType: f.enum(['personal', 'business']).default('personal'),
      businessInfo: f.when('accountType == "business"', {
        companyName: f.string().describe('Registered Company'),
        vatNumber: f.string().describe('Tax VAT ID'),
      }),
      interests: f.array(f.string()).asTags().describe('Skills & Tags'),
      submitBtn: f.button({ label: 'Save Profile', action: 'submit' }),
    })
  }

  if (id === 'table-collection') {
    return f.struct({
      orderNumber: f.string().min(3).describe('Order Reference'),
      items: f.array(
        f.struct({
          description: f.string().describe('Product Description'),
          quantity: f.number().integer().positive().describe('Quantity'),
          unitPrice: f.number().positive().describe('Unit Price ($)'),
        })
      ).asTable({
        sortable: true,
        columns: [
          { key: 'description', label: 'Item Name', width: '50%' },
          { key: 'quantity', label: 'Qty', width: '20%', align: 'center' },
          { key: 'unitPrice', label: 'Price', width: '30%', align: 'right' },
        ],
        aggregations: [{ column: 'unitPrice', op: 'sum', label: 'Subtotal' }],
      }).describe('Purchased Line Items'),
    })
  }

  if (id === 'async-virtual-lists') {
    return f.struct({
      clusterConfig: f.section({
        title: '1. Region & Cluster Selection',
        description: 'Cascading reactive HTTP data sources and 10,000-item virtualized combobox',
      }, {
        regionRow: f.row({
          region: f.enum(['us-east', 'us-west', 'eu-central', 'ap-southeast'])
            .default('eu-central')
            .describe('Deployment Region'),
          cluster: f.string()
            .asCombobox({ searchable: true, placeholder: 'Search cluster in selected region...' })
            .fromHttp({
              url: '/api/v1/clusters',
              query: { region: '$values.region', q: '$search' },
              valueKey: 'id',
              labelKey: 'name',
              dependsOn: ['region'],
            })
            .describe('Target Kubernetes Cluster'),
        }),
        nodeInstance: f.string()
          .asCombobox({ searchable: true, placeholder: 'Select from 10,000 virtualized nodes...' })
          .fromHttp({
            url: '/api/v1/nodes',
            query: { cluster: '$values.cluster', page: '$page', limit: '$pageSize', q: '$search' },
            valueKey: 'id',
            labelKey: 'label',
            dependsOn: ['cluster'],
          })
          .paginate({ mode: 'infinite', pageSize: 50 })
          .virtual({ enabled: true, itemHeight: 36, viewportHeight: '260px' })
          .describe('Virtual Node Pool (10,000 items)'),
      }),
      allocatedPool: f.section('2. Cluster Services', {
        services: f.array(
          f.struct({
            serviceName: f.string().describe('Service Name'),
            port: f.number().integer().min(80).max(65535).describe('Port'),
            replicas: f.number().integer().min(1).max(50).default(3).describe('Replicas'),
          })
        ).asTable({
          sortable: true,
          columns: [
            { key: 'serviceName', label: 'Service', width: '40%' },
            { key: 'port', label: 'Port', width: '30%', align: 'center' },
            { key: 'replicas', label: 'Replicas', width: '30%', align: 'center' },
          ],
        }).virtual({ itemHeight: 40 }).describe('Cluster Ingress & Services'),
      }),
    })
  }

  if (id === 'user-profile') {
    return s.struct({
      username: s.string().trim().toLowerCase().min(3).max(20).describe('Account handle'),
      email: s.string().trim().email().describe('Primary contact address'),
      age: s.number().integer().min(18).max(120).describe('User age'),
      role: s.enum(['admin', 'editor', 'viewer']).default('viewer'),
      website: s.optional(s.string().url()),
      newsletter: s.boolean().default(false).describe('Receive product updates'),
      bio: s.optional(s.string().max(200)),
    })
  }

  if (id === 'ecommerce-order') {
    return s.struct({
      orderId: s.string().uuid(),
      status: s.enum(['pending', 'processing', 'shipped', 'delivered']).default('pending'),
      currency: s.string().toUpperCase().min(3).max(3).default('USD'),
      items: s.array(
        s.struct({
          sku: s.string().toUpperCase().min(3),
          quantity: s.number().integer().positive().max(100),
          unitPrice: s.number().positive(),
        })
      ).min(1).describe('Order line items'),
      notes: s.optional(s.string().max(500)),
    })
  }

  if (id === 'axon-node') {
    return s.struct({
      nodeId: s.string().min(1),
      channel: s.string().toLowerCase(),
      payload: s.union([
        s.string(),
        s.number(),
        s.struct({ signal: s.string(), value: s.number() }),
      ]),
      timestamp: s.number().positive(),
      metadata: s.record(s.string(), s.unknown()),
    })
  }

  return null
}

function normalizeCode(str: string): string {
  return str.replace(/\r\n/g, '\n').trim()
}

function cleanExecutableCode(code: string): string {
  return code
    .replace(/\s+as\s+const\b/g, '')
    .trim()
}

const MOCK_REGIONAL_CLUSTERS: Record<string, Array<{ id: string; name: string }>> = {
  'us-east': [
    { id: 'cls-us-virginia-01', name: 'us-east-1 (N. Virginia Prod)' },
    { id: 'cls-us-virginia-02', name: 'us-east-1 (N. Virginia Staging)' },
    { id: 'cls-us-ohio-01', name: 'us-east-2 (Ohio Analytics)' },
  ],
  'us-west': [
    { id: 'cls-us-oregon-01', name: 'us-west-2 (Oregon Prod)' },
    { id: 'cls-us-california-01', name: 'us-west-1 (California Edge)' },
  ],
  'eu-central': [
    { id: 'cls-eu-frankfurt-01', name: 'eu-central-1 (Frankfurt Primary)' },
    { id: 'cls-eu-frankfurt-02', name: 'eu-central-1 (Frankfurt DR)' },
    { id: 'cls-eu-berlin-01', name: 'eu-central-2 (Berlin Microservices)' },
  ],
  'ap-southeast': [
    { id: 'cls-ap-singapore-01', name: 'ap-southeast-1 (Singapore Hub)' },
    { id: 'cls-ap-sydney-01', name: 'ap-southeast-2 (Sydney DC)' },
  ],
}

function handleMockClustersRequest(params: URLSearchParams): Response {
  const selectedRegion = params.get('region') || 'eu-central'
  const searchQuery = (params.get('q') || '').toLowerCase().trim()

  const availableClusters = MOCK_REGIONAL_CLUSTERS[selectedRegion] || MOCK_REGIONAL_CLUSTERS['eu-central']
  const matchedClusters = searchQuery
    ? availableClusters.filter(
        (cluster) =>
          cluster.name.toLowerCase().includes(searchQuery) ||
          cluster.id.toLowerCase().includes(searchQuery)
      )
    : availableClusters

  return {
    ok: true,
    status: 200,
    json: async () => ({
      items: matchedClusters,
      total: matchedClusters.length,
    }),
  } as unknown as Response
}

function handleMockNodesRequest(params: URLSearchParams): Response {
  const clusterPrefix = params.get('cluster') || 'cls'
  const pageIndex = parseInt(params.get('page') || '1', 10)
  const pageSize = parseInt(params.get('limit') || '50', 10)
  const searchQuery = (params.get('q') || '').toLowerCase().trim()

  const TOTAL_VIRTUAL_NODES = 10000
  const matchingNodes: Array<{ id: string; label: string }> = []

  for (let nodeIndex = 1; nodeIndex <= TOTAL_VIRTUAL_NODES; nodeIndex++) {
    const nodeId = `node-${clusterPrefix}-${String(nodeIndex).padStart(5, '0')}`
    const nodeLabel = `${nodeId} (CPU: ${(nodeIndex % 32) + 2} cores, RAM: ${((nodeIndex % 64) + 4) * 2}GB, Zone: zone-${(nodeIndex % 3) + 1})`
    if (!searchQuery || nodeId.includes(searchQuery) || nodeLabel.toLowerCase().includes(searchQuery)) {
      matchingNodes.push({ id: nodeId, label: nodeLabel })
    }
  }

  const offsetStart = (pageIndex - 1) * pageSize
  const pagedItems = matchingNodes.slice(offsetStart, offsetStart + pageSize)

  return {
    ok: true,
    status: 200,
    json: async () => ({
      items: pagedItems,
      total: matchingNodes.length,
      page: pageIndex,
      pageSize,
    }),
  } as unknown as Response
}

async function mockFetchInterceptor(url: string, _init: RequestInit): Promise<Response> {
  // Simulate network latency (280ms)
  await new Promise((resolve) => setTimeout(resolve, 280))

  const urlObject = new URL(url, 'http://localhost')
  const pathname = urlObject.pathname
  const queryParams = urlObject.searchParams

  if (pathname.includes('/api/v1/clusters')) {
    return handleMockClustersRequest(queryParams)
  }

  if (pathname.includes('/api/v1/nodes')) {
    return handleMockNodesRequest(queryParams)
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({ items: [], total: 0 }),
  } as unknown as Response
}

function compileAndInspect() {
  compileError.value = null
  try {
    let schemaInstance = buildPresetSchema(selectedPresetId.value)
    
    // If user edited custom code, attempt evaluating safely
    const currentPreset = presets.find((p) => p.id === selectedPresetId.value)
    if (normalizeCode(schemaCode.value) !== normalizeCode(currentPreset?.code || '')) {
      try {
        const cleanCode = cleanExecutableCode(schemaCode.value)
        const fn = new Function('s', 'f', 'form', `return (${cleanCode});`)
        schemaInstance = fn(s, f, form)
      } catch (evalErr: any) {
        compileError.value = `Syntax / Evaluation Error: ${evalErr.message}`
        return
      }
    }

    if (!schemaInstance) return
    compiledSchema = schemaInstance

    // 1. Update Web Component <ui-struct-form> immediately (Primary Goal)
    if (structFormRef.value) {
      let parsedVal: Record<string, unknown> = {}
      try {
        parsedVal = JSON.parse(jsonPayload.value)
      } catch {}
      ;(structFormRef.value as any).fetchInterceptor = mockFetchInterceptor
      ;(structFormRef.value as any).values = parsedVal
      ;(structFormRef.value as any).schema = schemaInstance
    }

    // 2. Form Tree AST (for FormStructSchema)
    try {
      if (typeof (schemaInstance as any).toFormTree === 'function') {
        let parsedVal = {}
        try { parsedVal = JSON.parse(jsonPayload.value) } catch {}
        const tree = (schemaInstance as any).toFormTree(parsedVal)
        formTreeOutput.value = JSON.stringify(tree, null, 2)
      } else {
        formTreeOutput.value = '// Standard StructSchema (use Form Fields tab for field inspection)'
      }
    } catch (e: any) {
      formTreeOutput.value = `Error generating Form Tree: ${e.message}`
    }

    // 3. JSON Schema
    try {
      const js = toJSONSchema(schemaInstance)
      jsonSchemaOutput.value = JSON.stringify(js, null, 2)
    } catch (e: any) {
      jsonSchemaOutput.value = `Error generating JSON Schema: ${e.message}`
    }

    // 4. DDL
    try {
      ddlSqliteOutput.value = generateStructDDL(schemaInstance, { tableName: 'records', dialect: 'sqlite' })
      ddlPostgresOutput.value = generateStructDDL(schemaInstance, { tableName: 'records', dialect: 'postgres' })
    } catch (e: any) {
      ddlSqliteOutput.value = `-- DDL generation note: ${e.message}`
      ddlPostgresOutput.value = `-- DDL generation note: ${e.message}`
    }

    // 5. Form Fields
    try {
      const fields = getFormFields(schemaInstance)
      formFieldsOutput.value = JSON.stringify(fields, null, 2)
    } catch (e: any) {
      formFieldsOutput.value = `Error inspecting fields: ${e.message}`
    }

    // 6. Zod Bridge
    try {
      const zodSchema = toZod(schemaInstance)
      zodCodeOutput.value = `// Successfully converted to Zod schema:\nconst zodSchema = toZod(schema);\n// Zod description: ${zodSchema.description ?? 'N/A'}`
    } catch (e: any) {
      zodCodeOutput.value = `// Zod conversion note: ${e.message}`
    }

    // 7. Run validation on current payload
    runValidation()
  } catch (err: any) {
    compileError.value = err.message
  }
}

function runValidation() {
  if (!compiledSchema) return
  try {
    const parsedData = JSON.parse(jsonPayload.value)
    // Standard schema run
    const result = compiledSchema['~standard'].validate(parsedData)
    validationResult.value = result
  } catch (parseErr: any) {
    validationResult.value = {
      issues: [
        {
          message: `Invalid JSON payload: ${parseErr.message}`,
          path: [],
        },
      ],
    }
  }
}

function selectPreset(presetId: string) {
  selectedPresetId.value = presetId
  const preset = presets.find((p) => p.id === presetId)
  if (preset) {
    schemaCode.value = preset.code
    jsonPayload.value = preset.sampleValid
    updateSchemaEditor(preset.code)
    updatePayloadEditor(preset.sampleValid)
    compileAndInspect()
  }
}

function loadSample(valid: boolean) {
  const preset = presets.find((p) => p.id === selectedPresetId.value)
  if (preset) {
    const sample = valid ? preset.sampleValid : preset.sampleInvalid
    jsonPayload.value = sample
    updatePayloadEditor(sample)
    if (structFormRef.value) {
      try {
        const parsed = JSON.parse(sample)
        ;(structFormRef.value as any).values = parsed
      } catch {}
    }
    runValidation()
  }
}

let isUpdatingFromForm = false

function onFormChange(e: CustomEvent) {
  if (e.detail?.values) {
    isUpdatingFromForm = true
    const newJson = JSON.stringify(e.detail.values, null, 2)
    jsonPayload.value = newJson
    updatePayloadEditor(newJson)
    nextTick(() => {
      isUpdatingFromForm = false
    })
  }
}

function onFormSubmit(e: CustomEvent) {
  formSubmittedValues.value = e.detail?.values ?? null
}

function setupStructForm(el: HTMLElement | null) {
  if (!el) return
  ;(el as any).fetchInterceptor = mockFetchInterceptor
  el.addEventListener('ui-form-submit', onFormSubmit as EventListener)
  el.addEventListener('ui-form-change', onFormChange as EventListener)
  el.addEventListener('ui-form-loading', () => {
    isFormFetching.value = Boolean((el as any)?.isFetching)
  })
}

onMounted(() => {
  initEditors()
  setupStructForm(structFormRef.value)
  compileAndInspect()

  nextTick(() => {
    setupStructForm(structFormRef.value)
    if (structFormRef.value && !(structFormRef.value as any).schema && compiledSchema) {
      let parsedVal: Record<string, unknown> = {}
      try {
        parsedVal = JSON.parse(jsonPayload.value)
      } catch {}
      ;(structFormRef.value as any).values = parsedVal
      ;(structFormRef.value as any).schema = compiledSchema
    }
  })
})

watch(structFormRef, (el) => {
  if (el) {
    setupStructForm(el)
    if (compiledSchema) {
      let parsedVal: Record<string, unknown> = {}
      try {
        parsedVal = JSON.parse(jsonPayload.value)
      } catch {}
      ;(el as any).values = parsedVal
      ;(el as any).schema = compiledSchema
    }
  }
})

onUnmounted(() => {
  schemaEditorView?.destroy()
  schemaEditorView = null
  payloadEditorView?.destroy()
  payloadEditorView = null
})

watch(jsonPayload, () => {
  if (!isUpdatingFromForm && structFormRef.value) {
    try {
      const parsedVal = JSON.parse(jsonPayload.value)
      ;(structFormRef.value as any).values = parsedVal
    } catch {}
  }
  runValidation()
})
</script>

<template>
  <div :class="['playground-container', { 'full-screen': fullScreen }]" id="workbench">
    <div class="playground-header">
      <div class="header-presets">
        <span class="preset-label">Schema Preset:</span>
        <ui-select
          size="sm"
          :value="selectedPresetId"
          @ui-change="selectPreset(($event as CustomEvent).detail?.value || ($event.target as any).value)"
          aria-label="Schema Preset"
        >
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </ui-select>
      </div>

      <div class="header-actions">
        <ui-button variant="primary" size="sm" @click="compileAndInspect">
          ⚡ Re-evaluate Schema
        </ui-button>
        <ui-button variant="secondary" size="sm" @click="loadSample(true)">
          Load Valid Payload
        </ui-button>
        <ui-button variant="secondary" size="sm" @click="loadSample(false)">
          Load Invalid Payload
        </ui-button>
      </div>
    </div>

    <ui-alert v-if="compileError" variant="danger" title="Evaluation Error">
      {{ compileError }}
    </ui-alert>

    <div class="playground-grid">
      <!-- Left Pane: Code & Input Payload -->
      <div class="pane pane-left">
        <div class="pane-header">
          <span>Schema Definition (TypeScript)</span>
          <span class="pane-hint">Editable live</span>
        </div>
        <div class="code-area">
          <div ref="schemaEditorHost" class="code-editor-wrapper"></div>
        </div>

        <div class="pane-header sub-header">
          <span>Test JSON Input Payload</span>
          <span class="pane-hint">Live reactive validation</span>
        </div>
        <div class="payload-area">
          <div ref="payloadEditorHost" class="code-editor-wrapper"></div>
        </div>
      </div>

      <!-- Right Pane: Real-Time Outputs -->
      <div class="pane pane-right">
        <ui-tabs :value="activeTab" @ui-change="activeTab = ($event as CustomEvent).detail?.value">
          <ui-tab value="form">Live Form (&lt;ui-struct-form&gt;)</ui-tab>
          <ui-tab value="validation">
            Validation Result
            <ui-chip
              v-if="validationResult"
              size="sm"
              :variant="validationResult.issues ? 'danger' : 'success'"
            >
              {{ validationResult.issues ? `${validationResult.issues.length} Issues` : 'Valid' }}
            </ui-chip>
          </ui-tab>
          <ui-tab value="jsonschema">JSON Schema</ui-tab>
          <ui-tab value="ddl">SQL DDL</ui-tab>
          <ui-tab value="fields">Form Fields</ui-tab>
          <ui-tab value="formtree">Form Tree (AST)</ui-tab>
        </ui-tabs>

        <div class="pane-content">
          <!-- Tab 1: Live Form -->
          <div v-show="activeTab === 'form'" class="form-preview">
            <div class="form-info-bar">
              <span>Automatically generated from Struct descriptor via <code>&lt;ui-struct-form&gt;</code></span>
              <span v-if="isFormFetching" class="fetching-pill" role="status" aria-live="polite">
                <span class="fetching-spinner"></span> Loading async data...
              </span>
            </div>
            
            <ui-card bordered class="form-card-wrapper">
              <ui-struct-form
                ref="structFormRef"
                bordered
                submit-label="Save Record"
              ></ui-struct-form>
            </ui-card>

            <div v-if="formSubmittedValues" class="form-submit-output">
              <span class="submit-title">Submitted Values:</span>
              <pre class="output-pre"><code class="language-json" v-html="highlightedFormSubmitted"></code></pre>
            </div>
          </div>

          <!-- Tab 2: Validation Result -->
          <div v-show="activeTab === 'validation'" class="validation-preview">
            <div v-if="validationResult" class="result-header">
              <ui-alert
                v-if="!validationResult.issues"
                variant="success"
                title="VALID"
              >
                All schema constraints and refinements passed!
              </ui-alert>
              <ui-alert
                v-else
                variant="danger"
                :title="`INVALID — ${validationResult.issues.length} issue(s) detected`"
              >
                Please correct the schema validation errors below.
              </ui-alert>
            </div>

            <div v-if="validationResult?.value" class="result-body">
              <div class="section-tag">Sanitized & Transformed Output Value:</div>
              <pre class="output-pre"><code class="language-json" v-html="highlightedValidationValue"></code></pre>
            </div>

            <div v-if="validationResult?.issues" class="issues-list">
              <div v-for="(issue, idx) in validationResult.issues" :key="idx" class="issue-item">
                <div class="issue-path">
                  Path: <code>{{ issue.path?.length ? issue.path.join('.') : '(root)' }}</code>
                </div>
                <div class="issue-msg">{{ issue.message }}</div>
              </div>
            </div>
          </div>

          <!-- Tab 3: JSON Schema -->
          <div v-show="activeTab === 'jsonschema'" class="code-preview">
            <pre class="output-pre"><code class="language-json" v-html="highlightedJsonSchema"></code></pre>
          </div>

          <!-- Tab 4: SQL DDL -->
          <div v-show="activeTab === 'ddl'" class="code-preview">
            <div class="ddl-section">
              <div class="section-tag">SQLite DDL:</div>
              <pre class="output-pre"><code class="language-sql" v-html="highlightedDdlSqlite"></code></pre>
            </div>
            <div class="ddl-section">
              <div class="section-tag">PostgreSQL DDL:</div>
              <pre class="output-pre"><code class="language-sql" v-html="highlightedDdlPostgres"></code></pre>
            </div>
          </div>

          <!-- Tab 5: Form Fields -->
          <div v-show="activeTab === 'fields'" class="code-preview">
            <pre class="output-pre"><code class="language-json" v-html="highlightedFormFields"></code></pre>
          </div>

          <!-- Tab 6: Form Tree (AST) -->
          <div v-show="activeTab === 'formtree'" class="code-preview">
            <pre class="output-pre"><code class="language-json" v-html="highlightedFormTree"></code></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground-container {
  margin: 2.618em 0;
  display: flex;
  flex-direction: column;
}

.playground-container:not(.full-screen) {
  height: 720px;
  max-height: 85vh;
}

.playground-container:not(.full-screen) .playground-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.playground-container:not(.full-screen) .pane-left,
.playground-container:not(.full-screen) .pane-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.playground-container:not(.full-screen) .code-area {
  flex: 3;
  height: auto;
  min-height: 160px;
}

.playground-container:not(.full-screen) .payload-area {
  flex: 2;
  height: auto;
  min-height: 130px;
}

.playground-container:not(.full-screen) .pane-content {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.4em;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-color-border-strong, oklch(0.38 0.025 260)) transparent;
}

.header-presets {
  display: flex;
  align-items: center;
  gap: 0.618em;
  flex-wrap: wrap;
}

.preset-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
}

.header-presets ui-select {
  min-width: 240px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.618em;
  flex-wrap: wrap;
}

.code-area {
  height: 290px;
  position: relative;
}

.sub-header {
  border-top: 1px solid var(--ui-color-border-subtle, oklch(0.24 0.02 260));
}

.payload-area {
  height: 200px;
  position: relative;
}

.code-editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--ui-color-surface-elevated, oklch(0.12 0.015 260));
}

.code-editor-wrapper .cm-editor {
  height: 100%;
  width: 100%;
}

.code-editor-wrapper .cm-scroller {
  overflow: auto;
  font-family: var(--ui-font-mono, 'SF Mono', 'Fira Code', Menlo, Consolas, monospace);
  font-size: 0.86rem;
  line-height: 1.55;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-color-border-strong, oklch(0.38 0.025 260)) transparent;
}

.pane-hint {
  font-size: 0.7rem;
  color: var(--ui-color-text-subtle, oklch(0.6 0.02 260));
  font-weight: normal;
  text-transform: none;
}

ui-tabs {
  flex-shrink: 0;
  background: var(--ui-card-header-bg, oklch(0.18 0.02 260));
  border-bottom: 1px solid var(--ui-color-border, oklch(0.26 0.02 260));
  width: 100%;
}

.form-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.825rem;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
}

.fetching-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--ui-color-primary, oklch(0.65 0.19 230));
  font-weight: 500;
  padding: 2px 8px;
  background: color-mix(in oklch, var(--ui-color-primary, oklch(0.65 0.19 230)) 15%, transparent);
  border: 1px solid color-mix(in oklch, var(--ui-color-primary, oklch(0.65 0.19 230)) 30%, transparent);
  border-radius: 9999px;
}

.fetching-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 600ms linear infinite;
  flex-shrink: 0;
}

.result-header {
  margin-bottom: 1em;
}

.section-tag {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
  margin: 0.8em 0 0.382em 0;
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  margin-top: 1em;
}

.issue-item {
  background: var(--ui-color-surface-elevated, oklch(0.18 0.02 260));
  border-left: 3px solid var(--ui-color-danger, oklch(0.65 0.22 25));
  padding: 0.618em 1em;
  border-radius: 0 4px 4px 0;
}
.issue-path {
  font-size: 0.75rem;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
}
.issue-msg {
  color: var(--ui-color-danger, oklch(0.75 0.2 25));
  font-size: 0.88rem;
  margin-top: 0.2em;
}

.output-pre {
  margin: 0;
  padding: 1em;
  background: var(--ui-color-surface, oklch(0.12 0.015 260));
  border-radius: var(--ui-radius-sm, 6px);
  border: 1px solid var(--ui-color-border-subtle, oklch(0.24 0.02 260));
  font-family: var(--ui-font-mono, monospace);
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--ui-color-text, #ffffff);
  overflow-x: auto;
}

.ddl-section {
  margin-bottom: 1.236em;
}

/* Full Screen Page Layout */
.playground-container.full-screen {
  margin: 0;
  border-radius: var(--ui-radius-lg, 12px);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px);
  min-height: 560px;
  overflow: hidden;
}

.playground-container.full-screen .playground-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.playground-container.full-screen .pane-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.playground-container.full-screen .code-area {
  flex: 3;
  height: auto;
  min-height: 160px;
}

.playground-container.full-screen .payload-area {
  flex: 2;
  height: auto;
  min-height: 130px;
}

.playground-container.full-screen .code-editor-wrapper .cm-editor {
  font-size: 0.92rem;
}

.playground-container.full-screen .pane-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.playground-container.full-screen .pane-content {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.4em;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-color-border-strong, oklch(0.38 0.025 260)) transparent;
}

.playground-container.full-screen .output-pre {
  font-size: 0.92rem;
  line-height: 1.6;
}

/* Explicit scrollbar styles for pane-content, code editors and outputs */
.pane-content::-webkit-scrollbar,
.editor-textarea::-webkit-scrollbar,
.output-pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.pane-content::-webkit-scrollbar-track,
.editor-textarea::-webkit-scrollbar-track,
.output-pre::-webkit-scrollbar-track {
  background: transparent;
}

.pane-content::-webkit-scrollbar-thumb,
.editor-textarea::-webkit-scrollbar-thumb,
.output-pre::-webkit-scrollbar-thumb {
  background: var(--ui-color-border-strong, oklch(0.38 0.025 260));
  border-radius: var(--ui-radius-full, 9999px);
}

.pane-content::-webkit-scrollbar-thumb:hover,
.editor-textarea::-webkit-scrollbar-thumb:hover,
.output-pre::-webkit-scrollbar-thumb:hover {
  background: var(--ui-color-primary, oklch(0.65 0.2 260));
}

@media (max-width: 900px) {
  .playground-container,
  .playground-container.full-screen {
    height: auto !important;
    min-height: unset !important;
  }
  
  .playground-grid,
  .playground-container.full-screen .playground-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    height: auto;
    overflow: visible;
  }

  .pane-left,
  .playground-container.full-screen .pane-left {
    height: 520px;
    border-right: none;
    border-bottom: 1px solid var(--ui-color-border-subtle, oklch(0.24 0.02 260));
  }

  .pane-right,
  .playground-container.full-screen .pane-right {
    height: 680px;
  }
}
</style>
