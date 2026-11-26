import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const structSrc = resolve(__dirname, '../src')

// A sibling checkout of @collidor/ui wins over the registry copy, so form rendering
// can be developed against the unreleased renderer.
const localUiRoot =
  // `.siblings/` is where CI puts the unpublished packages (see .github/workflows/deploy-docs.yml)
  ['../../ui', '../../collidor/ui', '../.siblings/ui']
    .map((candidate) => resolve(__dirname, candidate))
    .find((candidate) => existsSync(resolve(candidate, 'src'))) ?? resolve(__dirname, '../../ui')
const localUiSrc = resolve(localUiRoot, 'src')
const localUiDist = resolve(localUiRoot, 'dist')
const hasLocalUi = existsSync(localUiSrc)

const uiFormsSrc = resolve(localUiRoot, '../ui-forms/src')
const uiDir = resolve(__dirname, 'node_modules/@collidor/ui')
const uiSrc = hasLocalUi ? localUiSrc : resolve(uiDir, 'src')
const uiDist = hasLocalUi ? localUiDist : resolve(uiDir, 'dist')

export default defineConfig({
  base: './',
  resolve: {
    dedupe: ['lit', 'lit-html', '@lit/reactive-element'],
    alias: {
      'vue': 'vue/dist/vue.runtime-with-vapor.esm-browser.js',
      // UI 2.x ships its tokens as src/tokens.css instead of a built dist/ui.css.
      '@collidor/ui/dist/ui.css': existsSync(resolve(uiDist, 'ui.css'))
        ? resolve(uiDist, 'ui.css')
        : resolve(uiSrc, 'tokens.css'),
      '@collidor/ui/themes': resolve(uiSrc, 'themes'),
      '@collidor/ui': hasLocalUi ? resolve(uiSrc, 'index.ts') : '@collidor/ui',
      // <ui-struct-form> lives in its own package; use the sibling checkout until it is published.
      ...(existsSync(uiFormsSrc) ? { '@collidor/ui-forms': resolve(uiFormsSrc, 'index.ts') } : {}),
      '@collidor/struct/bridges/axon': resolve(structSrc, 'bridges/axon.ts'),
      '@collidor/struct/bridges/zod': resolve(structSrc, 'bridges/zod.ts'),
      '@collidor/struct/bridges/jsonSchema': resolve(structSrc, 'bridges/jsonSchema.ts'),
      '@collidor/struct/form': resolve(structSrc, 'form/index.ts'),
      '@collidor/struct': resolve(structSrc, 'index.ts'),
    },
  },
  plugins: [
    vue({
      features: {
        vapor: true,
      },
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('ui-'),
        },
      },
    }),
  ],
})
