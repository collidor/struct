<script setup vapor lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Navbar from './components/Navbar.vue'
import Sidebar from './components/Sidebar.vue'
import QuickstartView from './views/QuickstartView.vue'
import BuildersView from './views/BuildersView.vue'
import BridgesView from './views/BridgesView.vue'
import FormsView from './views/FormsView.vue'
import MigrationsView from './views/MigrationsView.vue'
import ComputedView from './views/ComputedView.vue'
import Playground from './components/Playground.vue'

const currentTab = ref<'docs' | 'playground'>('docs')
const activeSectionId = ref('overview')

function onTabChange(tab: 'docs' | 'playground') {
  currentTab.value = tab
  if (tab === 'playground') {
    window.location.hash = 'playground'
  } else {
    window.location.hash = activeSectionId.value || 'overview'
  }
}

function scrollToSection(id: string) {
  if (id === 'workbench') {
    onTabChange('playground')
    return
  }

  if (currentTab.value !== 'docs') {
    currentTab.value = 'docs'
  }

  activeSectionId.value = id
  setTimeout(() => {
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' })
    }
  }, 50)
}

function handleScroll() {
  if (currentTab.value !== 'docs') return

  const sections = document.querySelectorAll('section[id]')
  const scrollY = window.scrollY + 120

  for (let i = sections.length - 1; i >= 0; i--) {
    const el = sections[i] as HTMLElement
    if (el.offsetTop <= scrollY) {
      activeSectionId.value = el.id
      break
    }
  }
}

function syncHash() {
  const hash = window.location.hash.slice(1)
  if (hash === 'playground' || hash === 'workbench') {
    currentTab.value = 'playground'
  } else {
    currentTab.value = 'docs'
    if (hash) {
      setTimeout(() => scrollToSection(hash), 100)
    }
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('hashchange', syncHash)
  syncHash()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('hashchange', syncHash)
})
</script>

<template>
  <div class="docs-layout">
    <Navbar :current-tab="currentTab" @tab-change="onTabChange" />

    <!-- 1. Documentation View (with Sidebar & Standard Reading Width) -->
    <div v-show="currentTab === 'docs'" class="docs-body">
      <Sidebar :active-id="activeSectionId" @navigate="scrollToSection" />

      <main class="docs-main">
        <QuickstartView />
        <BuildersView />
        <BridgesView />
        <FormsView />
        <MigrationsView />
        <ComputedView />

        <div class="playground-promo-card">
          <div class="promo-text">
            <h3>⚡ Full-Screen Interactive Playground</h3>
            <p>
              Test and experiment with <code>@collidor/struct</code> in our expansive, full-screen schema workbench.
              Inspect live forms, test sample JSON inputs, and preview real-time JSON Schema &amp; SQL DDL conversions.
            </p>
          </div>
          <button class="promo-btn" @click="onTabChange('playground')">
            Launch Workbench →
          </button>
        </div>
      </main>
    </div>

    <!-- 2. Full-Screen Playground Page (No Sidebar, Maximum Width & Space) -->
    <div v-show="currentTab === 'playground'" class="playground-page">
      <div class="playground-page-header">
        <div>
          <h2>Interactive Schema Workbench</h2>
          <p class="subtitle">
            Wide-screen live development workbench for <code>@collidor/struct</code> with Vue 3 Vapor mode &amp; <code>@collidor/ui</code>.
          </p>
        </div>
        <button class="back-docs-btn" @click="onTabChange('docs')">
          ← Back to Docs
        </button>
      </div>

      <Playground :full-screen="true" />
    </div>
  </div>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}

/* Promo Card in Docs */
.playground-promo-card {
  background: linear-gradient(135deg, var(--ui-color-surface-elevated, oklch(0.18 0.025 260)) 0%, oklch(0.22 0.04 260) 100%);
  border: 1px solid var(--ui-color-primary-border, oklch(0.65 0.19 230 / 0.4));
  border-radius: var(--ui-radius-lg, 12px);
  padding: 1.618em 2em;
  margin: 3em 0 1em 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.618em;
}

.promo-text h3 {
  margin-top: 0;
  color: var(--ui-color-text, #ffffff);
}
.promo-text p {
  margin-bottom: 0;
  color: var(--ui-color-text-muted, oklch(0.8 0.02 260));
}

.promo-btn {
  background: var(--ui-color-primary, oklch(0.62 0.2 260));
  color: #ffffff;
  border: none;
  border-radius: var(--ui-radius-md, 8px);
  padding: 0.8em 1.4em;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.146s ease, transform 0.146s ease;
}
.promo-btn:hover {
  opacity: 0.95;
  transform: translateY(-2px);
}

/* Dedicated Full-Screen Playground Page */
.playground-page {
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 1.2em 2em 2em 2em;
  box-sizing: border-box;
}

.playground-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1em;
  flex-wrap: wrap;
  gap: 1em;
}

.playground-page-header h2 {
  margin: 0;
  border-bottom: none;
  padding-bottom: 0;
  font-size: 1.8rem;
}

.subtitle {
  margin: 0.3em 0 0 0;
  color: var(--ui-color-text-muted, oklch(0.78 0.02 260));
  font-size: 0.95rem;
}

.back-docs-btn {
  background: var(--ui-color-surface-elevated, oklch(0.18 0.025 260));
  border: 1px solid var(--ui-color-border, oklch(0.28 0.025 260));
  color: var(--ui-color-text, #ffffff);
  border-radius: var(--ui-radius-sm, 6px);
  padding: 0.5em 1.1em;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.146s ease;
}
.back-docs-btn:hover {
  background: var(--ui-color-surface-hover, oklch(0.24 0.03 260));
}

@media (max-width: 900px) {
  .playground-page {
    padding: 1em;
  }
  .playground-promo-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
