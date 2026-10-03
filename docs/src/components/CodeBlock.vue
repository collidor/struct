<script setup vapor lang="ts">
import { ref, computed } from 'vue'
import { highlightCode } from '../utils/highlight'

const props = withDefaults(
  defineProps<{
    code: string
    language?: string
    title?: string
  }>(),
  {
    language: 'typescript',
    title: '',
  }
)

const copied = ref(false)

const highlightedHtml = computed(() => {
  return highlightCode(props.code, props.language)
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy', err)
  }
}
</script>

<template>
  <div class="code-block">
    <div class="code-header">
      <div class="header-tag">
        <span class="lang-dot"></span>
        <span>{{ title || language }}</span>
      </div>
      <button class="copy-btn" @click="copyCode">
        {{ copied ? '✓ Copied' : 'Copy' }}
      </button>
    </div>
    <pre class="code-pre" spellcheck="false"><code :class="'language-' + language" spellcheck="false" v-html="highlightedHtml"></code></pre>
  </div>
</template>

<style scoped>
.header-tag {
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-weight: 600;
  color: var(--ui-card-header-color, var(--ui-color-text, #ffffff));
}

.lang-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-color-accent, var(--ui-color-primary, oklch(0.65 0.19 230)));
  display: inline-block;
}
</style>
