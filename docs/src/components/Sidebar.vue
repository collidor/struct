<script setup vapor lang="ts">
import { ref, computed } from 'vue'
import { NAV_SECTIONS, type NavItem } from '../data/navigation'

const props = defineProps<{
  activeId: string
}>()

const emit = defineEmits<{
  (e: 'navigate', id: string): void
}>()

const searchQuery = ref('')

const filteredSections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return NAV_SECTIONS

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.title.toLowerCase().includes(query) || item.id.toLowerCase().includes(query)
    ),
  })).filter((section) => section.items.length > 0)
})

function onSelect(item: NavItem) {
  emit('navigate', item.id)
}
</script>

<template>
  <aside class="docs-sidebar">
    <div class="sidebar-search">
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Filter topics..."
        class="search-input"
      />
    </div>

    <div v-for="section in filteredSections" :key="section.title" class="sidebar-group">
      <div class="sidebar-title">{{ section.title }}</div>
      <ul class="sidebar-nav">
        <li v-for="item in section.items" :key="item.id">
          <a
            :href="'#' + item.id"
            :class="['sidebar-link', { active: activeId === item.id }]"
            @click.prevent="onSelect(item)"
          >
            <span>{{ item.title }}</span>
            <span v-if="item.badge" class="ui-badge ui-badge--sm ui-badge--accent">{{ item.badge }}</span>
          </a>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-search {
  margin-bottom: 1.236em;
  padding: 0 0.236em;
}

.search-input {
  width: 100%;
  padding: 0.382em 0.618em;
  background: var(--ui-color-surface-elevated, oklch(0.18 0.025 260));
  border: 1px solid var(--ui-color-border, oklch(0.25 0.02 260));
  border-radius: var(--ui-radius-sm, 6px);
  color: var(--ui-color-text, #ffffff);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.146s ease;
}

.search-input:focus {
  border-color: var(--ui-color-primary, oklch(0.65 0.19 230));
}
</style>
