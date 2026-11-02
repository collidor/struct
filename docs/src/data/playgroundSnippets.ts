export interface PlaygroundPreset {
  id: string
  name: string
  description: string
  code: string
  sampleValid: string
  sampleInvalid: string
}

export const PLAYGROUND_PRESETS: PlaygroundPreset[] = [
  {
    id: 'complex-wizard',
    name: 'Enterprise Cloud Onboarding (Multi-Step Wizard)',
    description: 'A 4-step wizard with f.steps, spatial f.row & f.grid, f.when conditions, f.computedDisplay formulas, f.array().asTable(), and f.array().asTags().',
    code: `f.struct({
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
})`,
    sampleValid: `{
  "companyName": "Acme Global Dynamics",
  "workspaceSlug": "acme-global",
  "industry": "finance",
  "foundedYear": 2018,
  "taxId": "EU-987654321",
  "complianceOfficer": "Sarah Connor",
  "auditSchedule": "continuous",
  "tier": "enterprise",
  "billingCycle": "annual",
  "teamSize": 50,
  "customDomain": "https://auth.acme.com",
  "dedicatedSupport": true,
  "clusterNodes": [
    { "name": "pg-primary-aurora", "service": "database", "instances": 2, "costPerHour": 1.45 },
    { "name": "k8s-workers-us-east", "service": "compute", "instances": 6, "costPerHour": 0.85 }
  ],
  "environmentTags": ["prod", "us-east-1", "soc2", "pci-dss"],
  "rootAdminEmail": "admin@acme.com",
  "contactPhone": "+1 (555) 019-2834",
  "enforceMfa": true,
  "auditLogging": true,
  "acceptTerms": true
}`,
    sampleInvalid: `{
  "companyName": "",
  "workspaceSlug": "",
  "industry": "technology",
  "foundedYear": 1850,
  "taxId": "",
  "tier": "enterprise",
  "billingCycle": "annual",
  "teamSize": 2,
  "clusterNodes": [],
  "environmentTags": [],
  "rootAdminEmail": "invalid-email",
  "contactPhone": "",
  "enforceMfa": false,
  "auditLogging": false,
  "acceptTerms": false
}`,
  },
  {
    id: 'async-virtual-lists',
    name: 'Cloud Infrastructure (Async HTTP & 10k Virtual Nodes)',
    description: '100% JSON-serializable HTTP data sources with reactive $values.<dep> query params, virtualized <ui-combobox> (10,000 nodes), and virtualized <ui-table>.',
    code: `f.struct({
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
})`,
    sampleValid: `{
  "region": "eu-central",
  "cluster": "cls-eu-frankfurt-01",
  "nodeInstance": "node-cls-eu-frankfurt-01-00042",
  "services": [
    { "serviceName": "api-gateway", "port": 443, "replicas": 4 },
    { "serviceName": "auth-service", "port": 8080, "replicas": 2 },
    { "serviceName": "payment-worker", "port": 9090, "replicas": 3 }
  ]
}`,
    sampleInvalid: `{
  "region": "invalid-region",
  "cluster": "",
  "nodeInstance": "",
  "services": []
}`,
  },
  {
    id: 'unified-form',
    name: 'Unified Form: Row, Alert & When (f.*)',
    description: 'Layout containers (f.row), non-data UI decorators (f.alert, f.button), and conditional rendering (f.when).',
    code: `f.struct({
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
})`,
    sampleValid: `{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "accountType": "business",
  "companyName": "Analytical Engines Ltd",
  "vatNumber": "GB123456789",
  "interests": ["math", "algorithms", "computing"]
}`,
    sampleInvalid: `{
  "firstName": "A",
  "lastName": "",
  "accountType": "business",
  "interests": []
}`,
  },
  {
    id: 'table-collection',
    name: 'Collection View Mode: Interactive Table',
    description: 'Array schema rendered as an interactive table with custom columns, widths, and footer aggregations.',
    code: `f.struct({
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
})`,
    sampleValid: `{
  "orderNumber": "ORD-2026-X1",
  "items": [
    { "description": "Mechanical Keyboard", "quantity": 1, "unitPrice": 120 },
    { "description": "USB-C Braided Cable", "quantity": 2, "unitPrice": 15 }
  ]
}`,
    sampleInvalid: `{
  "orderNumber": "",
  "items": [
    { "description": "", "quantity": 0, "unitPrice": -10 }
  ]
}`,
  },
  {
    id: 'user-profile',
    name: 'User Registration Profile',
    description: 'Object schema with string sanitizers, email rules, enum selection, and widget hints.',
    code: `s.struct({
  username: s.string().trim().toLowerCase().min(3).max(20).describe('Account handle'),
  email: s.string().trim().email().describe('Primary contact address'),
  age: s.number().integer().min(18).max(120).describe('User age'),
  role: s.enum(['admin', 'editor', 'viewer']).default('viewer'),
  website: s.optional(s.string().url()),
  newsletter: s.boolean().default(false).describe('Receive product updates'),
  bio: s.optional(s.string().max(200)),
})`,
    sampleValid: `{
  "username": "   JohnDoe  ",
  "email": "john.doe@example.com",
  "age": 28,
  "role": "editor",
  "website": "https://example.com",
  "newsletter": true,
  "bio": "Software architect and open source enthusiast."
}`,
    sampleInvalid: `{
  "username": "jd",
  "email": "not-an-email",
  "age": 15,
  "role": "superuser",
  "newsletter": "yes"
}`,
  },
  {
    id: 'ecommerce-order',
    name: 'E-Commerce Order & Line Items',
    description: 'Nested structs, array item validation, and numeric constraints.',
    code: `s.struct({
  orderId: s.string().uuid(),
  status: s.enum(['pending', 'processing', 'shipped', 'delivered']).default('pending'),
  currency: s.string().toUpperCase().min(3).max(3).default('USD'),
  items: s.array(
    s.struct({
      sku: s.string().toUpperCase().min(3),
      quantity: s.number().integer().positive().max(100),
      unitPrice: s.number().positive()
    })
  ).min(1).describe('Order line items'),
  notes: s.optional(s.string().max(500))
})`,
    sampleValid: `{
  "orderId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "currency": "usd",
  "items": [
    { "sku": "pro-keyboard-90", "quantity": 1, "unitPrice": 149.99 },
    { "sku": "mouse-mat-xxl", "quantity": 2, "unitPrice": 24.50 }
  ],
  "notes": "Please leave at front porch."
}`,
    sampleInvalid: `{
  "orderId": "invalid-order-uuid",
  "status": "unknown-status",
  "currency": "DOLLAR",
  "items": []
}`,
  },
  {
    id: 'axon-node',
    name: 'Axon Graph Node Port',
    description: 'Data structure contract for Axon computation graphs and port subtyping.',
    code: `s.struct({
  nodeId: s.string().min(1),
  channel: s.string().toLowerCase(),
  payload: s.union([
    s.string(),
    s.number(),
    s.struct({ signal: s.string(), value: s.number() })
  ]),
  timestamp: s.number().positive(),
  metadata: s.record(s.string(), s.unknown())
})`,
    sampleValid: `{
  "nodeId": "node-sensor-01",
  "channel": "telemetry/temperature",
  "payload": {
    "signal": "TEMP_C",
    "value": 24.8
  },
  "timestamp": 1727980000000,
  "metadata": {
    "firmware": "v2.4.1",
    "calibrated": true
  }
}`,
    sampleInvalid: `{
  "nodeId": "",
  "channel": "TELEMETRY",
  "payload": false,
  "timestamp": -50,
  "metadata": null
}`,
  },
]
