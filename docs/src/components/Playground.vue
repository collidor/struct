<script setup vapor lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { s, toZod, toJSONSchema, generateStructDDL, getFormFields } from '@collidor/struct'
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

const activeTab = ref<'form' | 'validation' | 'jsonschema' | 'ddl' | 'zod' | 'fields'>('form')

const structFormRef = ref<HTMLElement | null>(null)
const validationResult = ref<any>(null)
const jsonSchemaOutput = ref('')
const ddlSqliteOutput = ref('')
const ddlPostgresOutput = ref('')
const formFieldsOutput = ref('')
const zodCodeOutput = ref('')
const compileError = ref<string | null>(null)
const formSubmittedValues = ref<any>(null)

const schemaHighlightRef = ref<HTMLElement | null>(null)
const payloadHighlightRef = ref<HTMLElement | null>(null)

const highlightedSchemaCode = computed(() => highlightCode(schemaCode.value, 'typescript'))
const highlightedJsonPayload = computed(() => highlightCode(jsonPayload.value, 'json'))

const highlightedJsonSchema = computed(() => highlightCode(jsonSchemaOutput.value, 'json'))
const highlightedDdlSqlite = computed(() => highlightCode(ddlSqliteOutput.value, 'sql'))
const highlightedDdlPostgres = computed(() => highlightCode(ddlPostgresOutput.value, 'sql'))
const highlightedFormFields = computed(() => highlightCode(formFieldsOutput.value, 'json'))
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

function onSchemaScroll(e: Event) {
  const target = e.target as HTMLTextAreaElement
  if (schemaHighlightRef.value) {
    schemaHighlightRef.value.scrollTop = target.scrollTop
    schemaHighlightRef.value.scrollLeft = target.scrollLeft
  }
}

function onPayloadScroll(e: Event) {
  const target = e.target as HTMLTextAreaElement
  if (payloadHighlightRef.value) {
    payloadHighlightRef.value.scrollTop = target.scrollTop
    payloadHighlightRef.value.scrollLeft = target.scrollLeft
  }
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const target = e.target as HTMLTextAreaElement
    const start = target.selectionStart
    const end = target.selectionEnd
    const val = target.value
    target.value = val.substring(0, start) + '  ' + val.substring(end)
    target.selectionStart = target.selectionEnd = start + 2
    target.dispatchEvent(new Event('input'))
  }
}

let compiledSchema: any = null

function buildPresetSchema(id: string) {
  if (id === 'user-profile') {
    return s.struct({
      username: s.string().trim().toLowerCase().min(3).max(20).describe('Account handle'),
      email: s.string().trim().email().describe('Primary contact address'),
      age: s.number().integer().min(18).max(120).describe('User age'),
      role: s.enum(['admin', 'editor', 'viewer'] as const).default('viewer'),
      website: s.optional(s.string().url()),
      newsletter: s.boolean().default(false).describe('Receive product updates'),
      bio: s.optional(s.string().max(200)),
    })
  }

  if (id === 'ecommerce-order') {
    return s.struct({
      orderId: s.string().uuid(),
      status: s.enum(['pending', 'processing', 'shipped', 'delivered'] as const).default('pending'),
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

function compileAndInspect() {
  compileError.value = null
  try {
    let schemaInstance = buildPresetSchema(selectedPresetId.value)
    
    // If user edited custom code, attempt evaluating safely
    const currentPreset = presets.find((p) => p.id === selectedPresetId.value)
    if (schemaCode.value.trim() !== currentPreset?.code.trim()) {
      try {
        const fn = new Function('s', `return (${schemaCode.value.trim()});`)
        schemaInstance = fn(s)
      } catch (evalErr: any) {
        compileError.value = `Syntax / Evaluation Error: ${evalErr.message}`
        return
      }
    }

    if (!schemaInstance) return
    compiledSchema = schemaInstance

    // 1. JSON Schema
    try {
      const js = toJSONSchema(schemaInstance)
      jsonSchemaOutput.value = JSON.stringify(js, null, 2)
    } catch (e: any) {
      jsonSchemaOutput.value = `Error generating JSON Schema: ${e.message}`
    }

    // 2. DDL
    try {
      ddlSqliteOutput.value = generateStructDDL(schemaInstance, { tableName: 'records', dialect: 'sqlite' })
      ddlPostgresOutput.value = generateStructDDL(schemaInstance, { tableName: 'records', dialect: 'postgres' })
    } catch (e: any) {
      ddlSqliteOutput.value = `-- DDL generation note: ${e.message}`
      ddlPostgresOutput.value = `-- DDL generation note: ${e.message}`
    }

    // 3. Form Fields
    try {
      const fields = getFormFields(schemaInstance)
      formFieldsOutput.value = JSON.stringify(fields, null, 2)
    } catch (e: any) {
      formFieldsOutput.value = `Error inspecting fields: ${e.message}`
    }

    // 4. Zod Bridge
    try {
      const zodSchema = toZod(schemaInstance)
      zodCodeOutput.value = `// Successfully converted to Zod schema:\nconst zodSchema = toZod(schema);\n// Zod description: ${zodSchema.description ?? 'N/A'}`
    } catch (e: any) {
      zodCodeOutput.value = `// Zod conversion note: ${e.message}`
    }

    // 5. Update Web Component <ui-struct-form>
    if (structFormRef.value) {
      ;(structFormRef.value as any).schema = schemaInstance
    }

    // 6. Run validation on current payload
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
    compileAndInspect()
  }
}

function loadSample(valid: boolean) {
  const preset = presets.find((p) => p.id === selectedPresetId.value)
  if (preset) {
    jsonPayload.value = valid ? preset.sampleValid : preset.sampleInvalid
    runValidation()
  }
}

function onFormSubmit(e: CustomEvent) {
  formSubmittedValues.value = e.detail?.values ?? null
}

onMounted(() => {
  if (structFormRef.value) {
    structFormRef.value.addEventListener('submit', onFormSubmit as EventListener)
  }
  compileAndInspect()
})

watch(jsonPayload, () => {
  runValidation()
})
</script>

<template>
  <div :class="['playground-container', { 'full-screen': fullScreen }]" id="workbench">
    <div class="playground-header">
      <div class="header-presets">
        <span class="preset-label">Schema Preset:</span>
        <select
          :value="selectedPresetId"
          @change="selectPreset(($event.target as HTMLSelectElement).value)"
          class="preset-select"
        >
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="header-actions">
        <button class="action-btn" @click="compileAndInspect">
          ⚡ Re-evaluate Schema
        </button>
        <button class="action-btn secondary" @click="loadSample(true)">
          Load Valid Payload
        </button>
        <button class="action-btn secondary" @click="loadSample(false)">
          Load Invalid Payload
        </button>
      </div>
    </div>

    <div v-if="compileError" class="compile-error-banner">
      ⚠️ {{ compileError }}
    </div>

    <div class="playground-grid">
      <!-- Left Pane: Code & Input Payload -->
      <div class="pane pane-left">
        <div class="pane-header">
          <span>Schema Definition (TypeScript)</span>
          <span class="pane-hint">Editable live</span>
        </div>
        <div class="code-area">
          <div class="code-editor-wrapper">
            <pre ref="schemaHighlightRef" class="editor-highlight" aria-hidden="true"><code class="language-typescript" v-html="highlightedSchemaCode"></code></pre>
            <textarea
              v-model="schemaCode"
              class="editor-textarea"
              spellcheck="false"
              @input="compileAndInspect"
              @scroll="onSchemaScroll"
              @keydown="onEditorKeydown"
            ></textarea>
          </div>
        </div>

        <div class="pane-header sub-header">
          <span>Test JSON Input Payload</span>
          <span class="pane-hint">Live reactive validation</span>
        </div>
        <div class="payload-area">
          <div class="code-editor-wrapper">
            <pre ref="payloadHighlightRef" class="editor-highlight" aria-hidden="true"><code class="language-json" v-html="highlightedJsonPayload"></code></pre>
            <textarea
              v-model="jsonPayload"
              class="editor-textarea"
              spellcheck="false"
              @input="compileAndInspect"
              @scroll="onPayloadScroll"
              @keydown="onEditorKeydown"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Right Pane: Real-Time Outputs -->
      <div class="pane pane-right">
        <div class="tabs-header">
          <button
            :class="['tab-btn', { active: activeTab === 'form' }]"
            @click="activeTab = 'form'"
          >
            Live Form (&lt;ui-struct-form&gt;)
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'validation' }]"
            @click="activeTab = 'validation'"
          >
            Validation Result
            <span
              v-if="validationResult"
              :class="['status-dot', validationResult.issues ? 'invalid' : 'valid']"
            ></span>
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'jsonschema' }]"
            @click="activeTab = 'jsonschema'"
          >
            JSON Schema
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'ddl' }]"
            @click="activeTab = 'ddl'"
          >
            SQL DDL
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'fields' }]"
            @click="activeTab = 'fields'"
          >
            Form Fields
          </button>
        </div>

        <div class="pane-content">
          <!-- Tab 1: Live Form -->
          <div v-show="activeTab === 'form'" class="form-preview">
            <div class="form-info-bar">
              <span>Automatically generated from Struct descriptor via <code>&lt;ui-struct-form&gt;</code></span>
            </div>
            
            <div class="form-card-wrapper">
              <ui-struct-form
                ref="structFormRef"
                bordered
                submit-label="Save Record"
              ></ui-struct-form>
            </div>

            <div v-if="formSubmittedValues" class="form-submit-output">
              <span class="submit-title">Submitted Values:</span>
              <pre class="output-pre"><code class="language-json" v-html="highlightedFormSubmitted"></code></pre>
            </div>
          </div>

          <!-- Tab 2: Validation Result -->
          <div v-show="activeTab === 'validation'" class="validation-preview">
            <div v-if="validationResult" class="result-header">
              <div v-if="!validationResult.issues" class="validation-status valid">
                <span class="status-icon">✓</span>
                <span class="status-text">VALID — All schema constraints and refinements passed!</span>
              </div>
              <div v-else class="validation-status invalid">
                <span class="status-icon">✗</span>
                <span class="status-text">INVALID — {{ validationResult.issues.length }} issue(s) detected:</span>
              </div>
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
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground-container {
  margin: 2.618em 0;
}

.preset-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
  margin-right: 0.5em;
}

.preset-select {
  background: var(--ui-color-surface, oklch(0.14 0.02 260));
  color: var(--ui-color-text, #ffffff);
  border: 1px solid var(--ui-color-border, oklch(0.28 0.025 260));
  border-radius: var(--ui-radius-sm, 6px);
  padding: 0.382em 0.8em;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  outline: none;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.618em;
  flex-wrap: wrap;
}

.action-btn {
  background: var(--ui-color-primary, oklch(0.62 0.2 260));
  color: #ffffff;
  border: none;
  border-radius: var(--ui-radius-sm, 6px);
  padding: 0.382em 0.8em;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.146s ease;
}
.action-btn:hover {
  opacity: 0.9;
}
.action-btn.secondary {
  background: var(--ui-color-surface-hover, oklch(0.22 0.025 260));
  color: var(--ui-color-text, oklch(0.95 0 0));
  border: 1px solid var(--ui-color-border, oklch(0.28 0.025 260));
}

.compile-error-banner {
  background: var(--ui-color-danger-subtle, oklch(0.65 0.22 25 / 0.15));
  color: var(--ui-color-danger, oklch(0.72 0.22 25));
  padding: 0.618em 1.236em;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--ui-color-danger-border, oklch(0.65 0.22 25 / 0.4));
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

.editor-highlight {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0.8em 1em;
  font-family: var(--ui-font-mono, 'SF Mono', 'Fira Code', Menlo, Consolas, monospace);
  font-size: 0.86rem;
  line-height: 1.55;
  white-space: pre;
  overflow: hidden;
  pointer-events: none;
  background: transparent !important;
  box-sizing: border-box;
  color: var(--ui-color-text, oklch(0.95 0 0));
  tab-size: 2;
}

.editor-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0.8em 1em;
  font-family: var(--ui-font-mono, 'SF Mono', 'Fira Code', Menlo, Consolas, monospace);
  font-size: 0.86rem;
  line-height: 1.55;
  white-space: pre;
  overflow: auto;
  box-sizing: border-box;
  background: transparent;
  color: transparent;
  caret-color: var(--ui-color-text, #ffffff);
  -webkit-text-fill-color: transparent;
  border: none;
  outline: none;
  resize: none;
  tab-size: 2;
}

.editor-textarea::selection {
  background: var(--ui-color-primary-subtle, rgba(99, 102, 241, 0.35));
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.pane-hint {
  font-size: 0.7rem;
  color: var(--ui-color-text-subtle, oklch(0.6 0.02 260));
  font-weight: normal;
  text-transform: none;
}

/* Tabs */
.tabs-header {
  display: flex;
  background: var(--ui-color-surface-elevated, oklch(0.18 0.02 260));
  border-bottom: 1px solid var(--ui-color-border, oklch(0.26 0.02 260));
  overflow-x: auto;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--ui-color-text-muted, oklch(0.7 0.02 260));
  padding: 0.618em 1em;
  font-size: 0.825rem;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  gap: 0.5em;
  white-space: nowrap;
}
.tab-btn:hover {
  color: var(--ui-color-text, #ffffff);
}
.tab-btn.active {
  color: var(--ui-color-primary, oklch(0.72 0.2 230));
  border-bottom-color: var(--ui-color-primary, oklch(0.65 0.19 230));
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.valid {
  background: var(--ui-color-success, oklch(0.68 0.18 145));
}
.status-dot.invalid {
  background: var(--ui-color-danger, oklch(0.65 0.22 25));
}

.form-info-bar {
  padding: 0.382em 0.618em;
  margin-bottom: 1em;
  font-size: 0.8rem;
  color: var(--ui-color-text-muted, oklch(0.75 0.02 260));
}

.form-card-wrapper {
  background: var(--ui-color-surface, oklch(0.14 0.02 260));
  border-radius: var(--ui-radius-md, 8px);
  padding: 1.236em;
}

.form-submit-output {
  margin-top: 1.236em;
  padding: 0.8em;
  background: var(--ui-color-surface-elevated, oklch(0.16 0.02 260));
  border-radius: var(--ui-radius-sm, 6px);
  border: 1px solid var(--ui-color-border-subtle, oklch(0.25 0.02 260));
}
.submit-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ui-color-success, oklch(0.72 0.18 145));
  text-transform: uppercase;
}

.validation-status {
  padding: 0.8em 1em;
  border-radius: var(--ui-radius-sm, 6px);
  display: flex;
  align-items: center;
  gap: 0.618em;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 1em;
}
.validation-status.valid {
  background: var(--ui-color-success-subtle, oklch(0.68 0.18 145 / 0.15));
  color: var(--ui-color-success, oklch(0.75 0.18 145));
  border: 1px solid var(--ui-color-success-border, oklch(0.68 0.18 145 / 0.3));
}
.validation-status.invalid {
  background: var(--ui-color-danger-subtle, oklch(0.65 0.22 25 / 0.15));
  color: var(--ui-color-danger, oklch(0.72 0.22 25));
  border: 1px solid var(--ui-color-danger-border, oklch(0.65 0.22 25 / 0.3));
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
  min-height: 640px;
}

.playground-container.full-screen .playground-grid {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.playground-container.full-screen .pane-left {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.playground-container.full-screen .code-area {
  flex: 3;
  height: auto;
  min-height: 280px;
}

.playground-container.full-screen .payload-area {
  flex: 2;
  height: auto;
  min-height: 180px;
}

.playground-container.full-screen .editor-textarea,
.playground-container.full-screen .payload-textarea {
  font-size: 0.95rem;
}

.playground-container.full-screen .pane-right {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.playground-container.full-screen .pane-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.4em;
}

.playground-container.full-screen .output-pre {
  font-size: 0.92rem;
  line-height: 1.6;
}
</style>
