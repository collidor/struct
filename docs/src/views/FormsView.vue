<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const unifiedFormSnippet = `import { f } from '@collidor/struct/form'

// Unified Form Structure: UI layout, decorators, and data schemas unified
export const UserOnboardingForm = f.struct({
  banner: f.alert({
    title: 'Welcome',
    message: 'Please complete your profile to continue.',
    tone: 'info',
  }),

  // Spatial Layout Container: 2 inputs on the same line!
  nameRow: f.row({
    firstName: f.string().min(2).describe('Given Name'),
    lastName: f.string().min(2).describe('Family Name'),
  }, { gap: '1rem' }),

  accountType: f.enum(['personal', 'business'] as const).default('personal'),

  // Conditional rendering & validation coupling
  businessDetails: f.when('accountType == "business"', {
    companyName: f.string().describe('Company Legal Name'),
    vatNumber: f.string().describe('Tax VAT ID'),
  }),

  // Collection View Mode: tags
  skills: f.array(f.string()).asTags().describe('Skills & Tags'),

  divider: f.divider(),
  submitBtn: f.button({ label: 'Complete Sign Up', action: 'submit' }),
})

// Parsed / Inferred TypeScript output is completely flat:
// { firstName: string; lastName: string; accountType: 'personal' | 'business'; companyName?: string; vatNumber?: string; skills: string[] }
const data = UserOnboardingForm.parse({
  firstName: 'Ada',
  lastName: 'Lovelace',
  accountType: 'personal',
  skills: ['computing', 'logic'],
})`

const spatialLayoutSnippet = `import { f } from '@collidor/struct/form'

const LayoutsForm = f.struct({
  // Horizontal line grouping
  credentialsRow: f.row({
    username: f.string(),
    password: f.string().meta({ widget: 'password' }),
  }, { gap: '1rem' }),

  // Responsive Grid
  addressGrid: f.grid({
    street: f.string(),
    apartment: f.string().optional(),
    city: f.string(),
    postalCode: f.string(),
  }, { columns: 2, gap: '0.75rem' }),

  // Multi-tab layout
  settingsTabs: f.tabs({
    profile: f.section('Public Profile', { displayName: f.string() }),
    security: f.section('Security', { twoFactorEnabled: f.boolean() }),
  }),
})`

const uiOnlySnippet = `import { f } from '@collidor/struct/form'

const FormWithDecorators = f.struct({
  header: f.heading('Security Configuration', 2),
  alertBanner: f.alert({ message: 'Keep your secret key safe', tone: 'warning' }),
  spacer: f.spacer('1.5rem'),
  apiKey: f.string(),
  taxCalculation: f.computedDisplay('subtotal * 0.2', { label: 'Estimated Tax' }),
  separator: f.divider(),
  actionSlot: f.slot('custom-actions'),
})

// None of header, alertBanner, spacer, taxCalculation, separator, or actionSlot
// will appear in the parsed data payload!`

const collectionViewSnippet = `import { f } from '@collidor/struct/form'

const OrderForm = f.struct({
  orderNumber: f.string(),
  
  // Array rendered as interactive table with column definitions & summary
  items: f.array(
    f.struct({
      description: f.string(),
      quantity: f.number().integer().min(1),
      unitPrice: f.number().positive(),
    })
  ).asTable({
    sortable: true,
    columns: [
      { key: 'description', label: 'Item Description', width: '50%' },
      { key: 'quantity', label: 'Qty', width: '20%', align: 'center' },
      { key: 'unitPrice', label: 'Unit Price', width: '30%', align: 'right' },
    ],
    aggregations: [{ column: 'unitPrice', op: 'sum', label: 'Order Subtotal' }],
  }),

  // Array rendered as repeater cards or tags
  tags: f.array(f.string()).asTags({ maxTags: 5 }),
})`

const controllerSnippet = `import { f } from '@collidor/struct/form'

const CheckoutWizard = f.struct({
  steps: f.steps({
    step1: f.section('Account', { email: f.string().email() }),
    step2: f.section('Shipping', { address: f.string().min(5) }),
  }),
})

// Create framework-agnostic headless controller
const controller = f.createController(CheckoutWizard, {
  initialValues: { email: 'user@example.com' },
  onSubmit: (values) => console.log('Checkout completed:', values),
})

// Navigation with per-step validation gating
console.log('Current Step:', controller.getCurrentStep()) // 0
const ok = controller.nextStep() // Validates Step 1 only; advances if valid

// Path mutations & array operations
controller.setValue('email', 'ada@example.com')
controller.arrayPush('items', { description: 'Book', qty: 1, price: 20 })

// Subscribe to reactive state updates
const unsubscribe = controller.subscribe((state) => {
  console.log('Dirty:', state.dirty, 'Valid:', state.isValid, 'Errors:', state.errors)
})`

const formInspectorSnippet = `import { s, getFormFields, inferWidget } from '@collidor/struct'

const SettingsSchema = s.struct({
  apiKey: s.string().describe('API Access Key'),
  volume: s.number().min(0).max(100).default(80).describe('Sound Output Level'),
  notifications: s.boolean().default(true).describe('Enable push alerts'),
  theme: s.enum(['dark', 'light', 'system']).default('system'),
  feedback: s.string().meta({ widget: 'textarea' }).describe('Optional comments')
})

// Automatically infer UI form fields and widget metadata:
const fields = getFormFields(SettingsSchema)
/*
[
  { key: 'apiKey', label: 'ApiKey', widget: 'text', required: true, description: 'API Access Key' },
  { key: 'volume', label: 'Volume', widget: 'slider', required: true, min: 0, max: 100, defaultValue: 80 },
  { key: 'notifications', label: 'Notifications', widget: 'switch', required: true, defaultValue: true },
  { key: 'theme', label: 'Theme', widget: 'select', required: true, options: [...] },
  { key: 'feedback', label: 'Feedback', widget: 'textarea', required: true }
]
*/`

const collidorUiSnippet = `<script setup vapor lang="ts">
import { ref } from 'vue'
import { SettingsSchema } from './schemas'

function onFormSubmit(event: CustomEvent<{ values: Record<string, unknown> }>) {
  console.log('Submitted values:', event.detail.values)
}

function onFieldChange(event: CustomEvent<{ fieldKey: string; fieldValue: unknown }>) {
  console.log('Field updated:', event.detail.fieldKey, event.detail.fieldValue)
}
<\/script>

<template>
  <!-- Direct DOM property binding in Vue 3 Vapor mode -->
  <ui-struct-form
    .schema="SettingsSchema"
    bordered
    submit-label="Save Preferences"
    @submit="onFormSubmit"
    @change="onFieldChange"
  />
</template>`
</script>

<template>
  <!-- 1. Unified Form Builder -->
  <section id="unified-form-builder" class="docs-section">
    <div class="section-badge">New Subpath Export</div>
    <h2>Unified Form Builder (<code>@collidor/struct/form</code>)</h2>
    <p>
      <code>@collidor/struct/form</code> allows you to unify UI form building directly with your data structures.
      By using the <code>f</code> builder namespace, you can declare spatial layouts, non-data UI elements, conditional branches,
      and collection presentation modes in a single keyed structure without polluting your parsed data models or TypeScript types.
    </p>

    <Callout type="tip" title="Pure Core Separation">
      Core <code>@collidor/struct</code> remains 100% focused on pure schema validation and data inference.
      Import from <code>@collidor/struct/form</code> when you need UI layout trees, decorators, or form controllers.
    </Callout>

    <CodeBlock title="unified-form.ts" language="typescript" :code="unifiedFormSnippet" />
  </section>

  <!-- 2. Spatial Layouts -->
  <section id="spatial-layouts" class="docs-section">
    <h2>Spatial Layout Containers</h2>
    <p>
      Arrange fields visually on the same line, in multi-column grids, tabs, accordions, or split panes.
      Layout containers are <strong>transparent</strong> in the data shape: their child fields are flattened directly to the parent object.
    </p>

    <div class="features-grid">
      <div class="feature-card">
        <h3><code>f.row(shape, options)</code></h3>
        <p>Places multiple inputs side-by-side on the same horizontal row with customizable <code>gap</code> and child <code>spans</code>.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.grid(shape, options)</code></h3>
        <p>Responsive CSS grid layout specifying <code>columns</code> (e.g. <code>2</code>, <code>repeat(3, 1fr)</code>) and <code>gap</code>.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.tabs(shape, options)</code></h3>
        <p>Organizes fields into tabbed panels without nesting data keys.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.section(title, shape)</code></h3>
        <p>Groups fields under a visual fieldset or section header with an optional description.</p>
      </div>
    </div>

    <CodeBlock title="spatial-layouts.ts" language="typescript" :code="spatialLayoutSnippet" />
  </section>

  <!-- 3. UI-Only Nodes -->
  <section id="ui-only-nodes" class="docs-section">
    <h2>UI-Only Nodes (Non-Data Elements)</h2>
    <p>
      Include titles, callouts, spacers, computed displays, and trigger buttons inside the form tree.
      These nodes are rendered in the UI tree (<code>toFormTree()</code>) but are <strong>automatically stripped</strong> from validation and output types.
    </p>

    <div class="widget-table-wrapper">
      <table class="widget-table">
        <thead>
          <tr>
            <th>Helper Function</th>
            <th>Node Kind</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>f.heading(text, level?)</code></td>
            <td><code>heading</code></td>
            <td>Typography heading (h1-h6)</td>
          </tr>
          <tr>
            <td><code>f.text(content)</code></td>
            <td><code>text</code></td>
            <td>Informational paragraphs or notes</td>
          </tr>
          <tr>
            <td><code>f.alert({ title, message, tone })</code></td>
            <td><code>alert</code></td>
            <td>Callout banner with <code>info | warning | error | success</code></td>
          </tr>
          <tr>
            <td><code>f.divider()</code></td>
            <td><code>divider</code></td>
            <td>Horizontal visual separator</td>
          </tr>
          <tr>
            <td><code>f.spacer(size?)</code></td>
            <td><code>spacer</code></td>
            <td>Vertical or horizontal spacing block</td>
          </tr>
          <tr>
            <td><code>f.computedDisplay(formula, options)</code></td>
            <td><code>computedDisplay</code></td>
            <td>Reactive read-only computed value evaluated against live form values</td>
          </tr>
          <tr>
            <td><code>f.button({ label, action })</code></td>
            <td><code>button</code></td>
            <td>Action or submit trigger button</td>
          </tr>
        </tbody>
      </table>
    </div>

    <CodeBlock title="ui-only-nodes.ts" language="typescript" :code="uiOnlySnippet" />
  </section>

  <!-- 4. Conditional Rendering -->
  <section id="conditional-rendering" class="docs-section">
    <h2>Conditional Rendering &amp; Validation Coupling</h2>
    <p>
      Use <code>f.when(condition, branchShape, elseShape?)</code> to mount or unmount form fields based on other field values:
    </p>
    <ul>
      <li><strong>Formula String</strong>: e.g. <code>f.when('accountType == "business"', { ... })</code> using the built-in AST expression evaluator.</li>
      <li><strong>Typed Predicate</strong>: e.g. <code>f.when((values) => values.score &lt; 5, { ... })</code>.</li>
      <li><strong>Coupled Validation</strong>: Inactive fields skip validation automatically. When hidden, they are not required and are omitted from parsed results.</li>
    </ul>
  </section>

  <!-- 5. Collection Views -->
  <section id="collection-views" class="docs-section">
    <h2>Collection View Modes (Table, List, Cards)</h2>
    <p>
      Arrays can define their UI presentation mode directly on the schema using fluent builder methods:
    </p>
    <div class="features-grid">
      <div class="feature-card">
        <h3><code>.asTable(config)</code></h3>
        <p>Renders items as an interactive data table with column widths, sorting, and footer aggregations (sum, avg, count).</p>
      </div>
      <div class="feature-card">
        <h3><code>.asList(config)</code></h3>
        <p>Repeater list with dynamic item headers, reordering, and collapsible cards.</p>
      </div>
      <div class="feature-card">
        <h3><code>.asCards(config)</code></h3>
        <p>Responsive card grid for complex item structs.</p>
      </div>
      <div class="feature-card">
        <h3><code>.asTags(config)</code></h3>
        <p>Compact tag or chip collection for primitive arrays.</p>
      </div>
    </div>
    <CodeBlock title="collection-views.ts" language="typescript" :code="collectionViewSnippet" />
  </section>

  <!-- 6. Headless Form Controller -->
  <section id="headless-controller" class="docs-section">
    <h2>Headless Form Controller</h2>
    <p>
      A framework-agnostic reactive controller that manages path-based mutations, dirty/touched states, multi-step wizards, and collection array helpers:
    </p>
    <CodeBlock title="form-controller.ts" language="typescript" :code="controllerSnippet" />
  </section>

  <!-- 7. Legacy Form Inspector -->
  <section id="form-inspector" class="docs-section">
    <h2>Form Inspector &amp; Widget Heuristics</h2>
    <p>
      <code>@collidor/struct</code> also includes the low-level <code>getFormFields</code> inspection function that extracts UI metadata and widget inferences:
    </p>
    <CodeBlock title="form-inspector.ts" language="typescript" :code="formInspectorSnippet" />

    <div class="widget-table-wrapper">
      <table class="widget-table">
        <thead>
          <tr>
            <th>Schema Kind / Rule</th>
            <th>Default Inferred Widget</th>
            <th>Override with <code>.meta(&#123; widget &#125;)</code></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>s.string()</code></td>
            <td><code>'text'</code></td>
            <td><code>'textarea' | 'password' | 'color' | 'date'</code></td>
          </tr>
          <tr>
            <td><code>s.number().min(a).max(b)</code></td>
            <td><code>'slider'</code></td>
            <td><code>'number' | 'stepper'</code></td>
          </tr>
          <tr>
            <td><code>s.number()</code> (unbounded)</td>
            <td><code>'number'</code></td>
            <td><code>'stepper' | 'slider'</code></td>
          </tr>
          <tr>
            <td><code>s.boolean()</code></td>
            <td><code>'switch'</code></td>
            <td><code>'checkbox'</code></td>
          </tr>
          <tr>
            <td><code>s.enum([...])</code></td>
            <td><code>'select'</code></td>
            <td><code>'radio-group' | 'segmented-control'</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 8. Native UI Form Component -->
  <section id="collidor-ui-form" class="docs-section">
    <h2>Native <code>&lt;ui-struct-form&gt;</code> Integration</h2>
    <p>
      The <code>@collidor/ui</code> Web Component library contains a native <code>&lt;ui-struct-form&gt;</code> component.
      Pass any struct schema directly to its <code>.schema</code> property to generate fully functional forms styled with Golden Ratio spacing and OKLCH color palettes:
    </p>
    <CodeBlock title="SettingsForm.vue" language="vue" :code="collidorUiSnippet" />
    <Callout type="tip" title="Try it Live!">
      Head to the <a href="#workbench">Live Workbench</a> below to see <code>&lt;ui-struct-form&gt;</code> and <code>Form Tree (AST)</code> in action!
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}

.section-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25em 0.75em;
  border-radius: var(--ui-radius-sm, 4px);
  background: var(--ui-color-primary, oklch(0.65 0.18 150));
  color: #000;
  margin-bottom: 0.8em;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.236em;
  margin: 1.618em 0;
}

.feature-card {
  background: var(--ui-color-surface-elevated, oklch(0.18 0.02 260));
  border: 1px solid var(--ui-color-border, oklch(0.26 0.02 260));
  border-radius: var(--ui-radius-md, 8px);
  padding: 1.236em;
}

.feature-card h3 {
  margin-top: 0;
  font-size: 1rem;
  color: var(--ui-color-primary-light, oklch(0.8 0.15 150));
}

.feature-card p {
  margin-bottom: 0;
  font-size: 0.88rem;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
  line-height: 1.5;
}

.widget-table-wrapper {
  margin: 1.618em 0;
  overflow-x: auto;
}

.widget-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--ui-color-surface-elevated, oklch(0.16 0.02 260));
  border-radius: var(--ui-radius-md, 8px);
  overflow: hidden;
  font-size: 0.9rem;
}

.widget-table th, .widget-table td {
  padding: 0.618em 1em;
  text-align: left;
  border-bottom: 1px solid var(--ui-color-border, oklch(0.25 0.02 260));
}

.widget-table th {
  background: var(--ui-card-header-bg, oklch(0.2 0.02 260));
  font-weight: 600;
  color: var(--ui-color-text, #ffffff);
}
</style>
