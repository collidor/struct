<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

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
  <section id="form-inspector" class="docs-section">
    <h2>Form Inspector &amp; Widget Heuristics</h2>
    <p>
      <code>@collidor/struct</code> includes a dedicated form inspection subsystem that extracts rich UI metadata, labels, descriptions, and automatic widget inferences from schemas:
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

  <section id="collidor-ui-form" class="docs-section">
    <h2>Native <code>&lt;ui-struct-form&gt;</code> Integration</h2>
    <p>
      The <code>@collidor/ui</code> Web Component library contains a native <code>&lt;ui-struct-form&gt;</code> component.
      Pass any struct schema directly to its <code>.schema</code> property to generate fully functional forms styled with Golden Ratio spacing and OKLCH color palettes:
    </p>
    <CodeBlock title="SettingsForm.vue" language="vue" :code="collidorUiSnippet" />
    <Callout type="tip" title="Try it Live!">
      Head to the <a href="#workbench">Live Workbench</a> below to see <code>&lt;ui-struct-form&gt;</code> rendered live in action!
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
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
