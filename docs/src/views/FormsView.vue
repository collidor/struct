<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const unifiedFormSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

// Unified Form Structure: UI layout, decorators, and data schemas unified.
// Data schemas come from s.*; f.* is exclusively for form concerns.
export const UserOnboardingForm = f.struct({
  banner: f.alert({
    title: 'Welcome',
    message: 'Please complete your profile to continue.',
    tone: 'info',
  }),

  // Spatial Layout Container: 2 inputs on the same line!
  // Raw s.* schemas are direct fields and get a default widget inferred.
  nameRow: f.row({
    firstName: s.string().min(2).describe('Given Name'),
    lastName: s.string().min(2).describe('Family Name'),
  }, { gap: '1rem' }),

  accountType: s.enum(['personal', 'business'] as const).default('personal'),

  // Conditional rendering & validation coupling
  businessDetails: f.when('accountType == "business"', {
    companyName: s.string().describe('Company Legal Name'),
    vatNumber: s.string().describe('Tax VAT ID'),
  }),

  // Explicit widget for a collection: f.field(schema, { widget })
  skills: f.field(s.array(s.string()), { widget: f.tags() }),

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

const spatialLayoutSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const LayoutsForm = f.struct({
  // Horizontal line grouping
  credentialsRow: f.row({
    username: s.string(),
    password: s.string().meta({ widget: 'password' }),
  }, { gap: '1rem' }),

  // Responsive Grid
  addressGrid: f.grid({
    street: s.string(),
    apartment: s.string().optional(),
    city: s.string(),
    postalCode: s.string(),
  }, { columns: 2, gap: '0.75rem' }),

  // Multi-tab layout
  settingsTabs: f.tabs({
    profile: f.section('Public Profile', { displayName: s.string() }),
    security: f.section('Security', { twoFactorEnabled: s.boolean() }),
  }),
})`

const uiOnlySnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const FormWithDecorators = f.struct({
  header: f.heading('Security Configuration', 2),
  alertBanner: f.alert({ message: 'Keep your secret key safe', tone: 'warning' }),
  spacer: f.spacer('1.5rem'),
  apiKey: s.string(),
  taxCalculation: f.computedDisplay('subtotal * 0.2', { label: 'Estimated Tax' }),
  separator: f.divider(),
  actionSlot: f.slot('custom-actions'),
})

// None of header, alertBanner, spacer, taxCalculation, separator, or actionSlot
// will appear in the parsed data payload!`

const fieldWidgetSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const ProfileForm = f.struct({
  // Raw s.* schema as a direct field: the default widget is inferred.
  email: s.string().email(),

  // f.field(schema, { widget }) picks the widget explicitly.
  displayName: f.field(s.string().min(2), { widget: f.textInput() }),
  bio: f.field(s.string().max(500), { widget: f.textarea().rows(4) }),

  age: f.field(s.number().int().min(0), { widget: f.numberInput() }),
  volume: f.field(s.number().min(0).max(100), { widget: f.slider() }),
  priceRange: f.field(s.number().min(0).max(1000), { widget: f.range() }),
})`

const reactiveFieldSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const OrderForm = f.struct({
  plan: s.enum(['free', 'team', 'enterprise']),
  country: s.string(),
  qty: s.number().min(1),
  price: s.number(),

  // evaluated against the current values, scoped like f.when (a bare name is a sibling)
  seats: f.field(s.number(), { disabledWhen: 'plan == "free"' }),
  coupon: f.field(s.string().optional(), { hiddenWhen: 'plan == "free"', readonlyWhen: 'qty > 100' }),

  // requiredWhen decides whether empty is acceptable (and exports as optional)
  vat: f.field(s.string().min(3), { requiredWhen: 'plan == "enterprise"' }),

  // choices that follow another field; a value from another country fails validation
  city: f.field(s.string().optional(), {
    widget: f.combobox(),
    options: { by: 'country', map: { DE: ['Berlin', 'Munich'], FR: [{ value: 'PAR', label: 'Paris' }] } },
  }),

  // a computed value: the parsed output always holds it, whatever was sent
  total: f.field(s.number().optional(), { derive: 'qty * price' }),
})`

const collectionViewSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const OrderForm = f.struct({
  orderNumber: s.string(),

  // s.array(...) rendered as an interactive table with column definitions & summary
  items: f.field(
    s.array(
      s.struct({
        description: s.string(),
        quantity: s.number().integer().min(1),
        unitPrice: s.number().positive(),
      }),
    ),
    {
      widget: f.table({
        sortable: true,
        columns: [
          { key: 'description', label: 'Item Description', width: '50%' },
          { key: 'quantity', label: 'Qty', width: '20%', align: 'center' },
          { key: 'unitPrice', label: 'Unit Price', width: '30%', align: 'right' },
        ],
        aggregations: [{ column: 'unitPrice', op: 'sum', label: 'Order Subtotal' }],
      }),
    },
  ),

  // Primitive array rendered as tags
  tags: f.field(s.array(s.string()), { widget: f.tags({ maxTags: 5 }) }),
})`

const controllerSnippet = `import { s } from '@collidor/struct'
import { f } from '@collidor/struct/form'

const CheckoutWizard = f.struct({
  steps: f.steps({
    step1: f.section('Account', { email: s.string().email() }),
    step2: f.section('Shipping', { address: s.string().min(5) }),
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
    @ui-form-submit="onFormSubmit"
    @ui-form-change="onFieldChange"
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

    <Callout type="warning" title="Major release: f.* is form-only">
      In the next major release, <code>f.*</code> is exclusively for form concerns. The data-schema builders on <code>f</code>
      (<code>f.string()</code>, <code>f.number()</code>, <code>f.enum()</code>, <code>f.optional()</code>, <code>f.coerce</code>, ...)
      are removed: use <code>s.*</code> data schemas, which are valid direct <code>f.struct</code> fields. The fluent array
      presentation methods (<code>.asTable()</code>, <code>.asTags()</code>, ...) are replaced by collection widgets, see
      <a href="#form-inspector">Fields &amp; Widgets</a> and <a href="#collection-views">Collection Widgets</a>.
    </Callout>

    <CodeBlock title="unified-form.ts" language="typescript" :code="unifiedFormSnippet" />
  </section>

  <!-- 1b. Fields & Widgets -->
  <!-- id kept as "form-inspector" so the existing sidebar entry in navigation.ts still resolves -->
  <section id="form-inspector" class="docs-section">
    <h2>Fields &amp; Widgets (<code>f.field</code>)</h2>
    <p>
      A raw <code>s.*</code> schema used directly as an <code>f.struct</code> field gets a default widget inferred from its type.
      To choose the widget yourself, wrap the schema: <code>f.field(schema, &#123; widget &#125;)</code>.
    </p>

    <div class="widget-table-wrapper">
      <table class="widget-table">
        <thead>
          <tr>
            <th>Widget factory</th>
            <th>Intended schema</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>f.textInput()</code></td>
            <td><code>s.string()</code></td>
          </tr>
          <tr>
            <td><code>f.textarea().rows(n)</code></td>
            <td><code>s.string()</code></td>
          </tr>
          <tr>
            <td><code>f.numberInput()</code></td>
            <td><code>s.number()</code></td>
          </tr>
          <tr>
            <td><code>f.slider()</code></td>
            <td><code>s.number()</code></td>
          </tr>
          <tr>
            <td><code>f.range()</code></td>
            <td><code>s.number()</code></td>
          </tr>
          <tr>
            <td><code>f.table(config)</code>, <code>f.tags(config)</code>, <code>f.list(config)</code>, <code>f.cards(config)</code>, <code>f.tabsWidget(config)</code>, <code>f.combobox(config)</code></td>
            <td><code>s.array(...)</code> (see <a href="#collection-views">Collection Widgets</a>)</td>
          </tr>
        </tbody>
      </table>
    </div>

    <CodeBlock title="field-widgets.ts" language="typescript" :code="fieldWidgetSnippet" />

    <Callout type="info" title="Display text vs. text input">
      <code>f.text(content)</code> remains a display-only informational node. It is not an input: use
      <code>f.textInput()</code> or <code>f.textarea()</code> as a widget for editable strings.
    </Callout>

    <h3>Reactive field options</h3>
    <p>
      <code>f.field</code> also takes options that depend on the other values. They use the same expression language and scoping as
      <code>f.when</code>: a bare name is a sibling, and <code>$root</code>, <code>$parent</code>, <code>$item</code> and
      <code>$index</code> reach outward.
    </p>
    <CodeBlock title="reactive-fields.ts" language="typescript" :code="reactiveFieldSnippet" />

    <div class="widget-table-wrapper">
      <table class="widget-table">
        <thead>
          <tr>
            <th>Option</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>disabledWhen</code>, <code>readonlyWhen</code>, <code>hiddenWhen</code></td><td>Presentation only. The field keeps its value and still obeys its schema.</td></tr>
          <tr><td><code>requiredWhen</code></td><td>Decides requiredness, replacing the schema's: while true an empty value is an error, while false it is accepted. Exported as optional.</td></tr>
          <tr><td><code>options</code></td><td>A list, a function, or <code>&#123; by, map, otherwise &#125;</code> that follows another field. A value outside the current choices is invalid.</td></tr>
          <tr><td><code>derive</code></td><td>An expression or function. The parsed output always holds the computed value and the field is shown read-only.</td></tr>
        </tbody>
      </table>
    </div>

    <Callout type="info" title="Rows">
      Inside a list, these are judged against the row. The shared row template has no values, so use a list field's
      <code>resolveItem(root, rowPath)</code> (the renderer does) to get one real row's settings.
    </Callout>

    <Callout type="warning" title="Renderer support">
      This page describes the form-builder API. Support for each widget in the <code>&lt;ui-struct-form&gt;</code> renderer and the
      Live Workbench is not guaranteed by this page; check the renderer's own release notes before relying on a specific widget there.
    </Callout>
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
        <p>Places multiple inputs side-by-side on the same horizontal row with customizable <code>gap</code> and <code>align</code>.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.grid(shape, options)</code></h3>
        <p>Responsive CSS grid layout specifying <code>columns</code> (e.g. <code>2</code>, <code>repeat(3, 1fr)</code>), <code>gap</code>, <code>align</code>, and per-child <code>spans</code> keyed by child key (<code>&#123; notes: 2 &#125;</code>).</p>
      </div>
      <div class="feature-card">
        <h3><code>f.tabs(shape, options)</code></h3>
        <p>Organizes fields into tabbed panels without nesting data keys. <code>defaultTab</code> picks the tab shown first.</p>
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
    <h2>Collection Widgets (Table, List, Cards, Tags, Tabs, Combobox)</h2>
    <p>
      An array's UI presentation is a widget, passed to <code>f.field(s.array(...), &#123; widget &#125;)</code> by one of the
      collection builders. These replace the removed <code>f.array(...).asTable()</code> / <code>.asTags()</code> family.
    </p>
    <div class="features-grid">
      <div class="feature-card">
        <h3><code>f.table(config)</code></h3>
        <p>Renders items as an interactive data table with column widths, sorting, and footer aggregations (sum, avg, count).</p>
      </div>
      <div class="feature-card">
        <h3><code>f.list(config)</code></h3>
        <p>Repeater list with dynamic item headers, reordering, and collapsible cards.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.cards(config)</code></h3>
        <p>Responsive card grid for complex item structs.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.tags(config)</code></h3>
        <p>Compact tag or chip collection for primitive arrays.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.tabsWidget(config)</code></h3>
        <p>Presents array items as tabbed panels.</p>
      </div>
      <div class="feature-card">
        <h3><code>f.combobox(config)</code></h3>
        <p>Searchable selection control for choosing array values.</p>
      </div>
    </div>
    <CodeBlock title="collection-widgets.ts" language="typescript" :code="collectionViewSnippet" />
  </section>

  <!-- 6. Headless Form Controller -->
  <section id="headless-controller" class="docs-section">
    <h2>Headless Form Controller</h2>
    <p>
      A framework-agnostic reactive controller that manages path-based mutations, dirty/touched states, multi-step wizards, and collection array helpers:
    </p>
    <CodeBlock title="form-controller.ts" language="typescript" :code="controllerSnippet" />
  </section>

  <!-- 7. Native UI Form Component -->
  <section id="collidor-ui-form" class="docs-section">
    <h2>Native <code>&lt;ui-struct-form&gt;</code> Integration</h2>
    <p>
      The <code>@collidor/ui</code> Web Component library contains a native <code>&lt;ui-struct-form&gt;</code> component.
      The published 0.1.0 renderer supports basic, flat schemas. It does not consume the form tree and cannot render nested tables, dialogs, layouts, or the new widget builders.
    </p>
    <CodeBlock title="SettingsForm.vue" language="vue" :code="collidorUiSnippet" />
    <Callout type="warning" title="Renderer compatibility">
      The <a href="#workbench">Live Workbench</a> can inspect the form tree, but advanced form rendering requires an updated UI renderer.
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
