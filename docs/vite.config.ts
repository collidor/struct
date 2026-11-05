import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const structSrc = resolve(__dirname, '../src')

const localUiSrc = resolve(__dirname, '../../ui/src')
const localUiDist = resolve(__dirname, '../../ui/dist')
const hasLocalUi = existsSync(localUiSrc)

const uiDir = resolve(__dirname, 'node_modules/@collidor/ui')
const uiSrc = hasLocalUi ? localUiSrc : resolve(uiDir, 'src')
const uiDist = hasLocalUi ? localUiDist : resolve(uiDir, 'dist')

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'vue': 'vue/dist/vue.runtime-with-vapor.esm-browser.js',
      '@collidor/ui/dist/ui.css': resolve(uiDist, 'ui.css'),
      '@collidor/ui/themes': resolve(uiSrc, 'themes'),
      '@collidor/ui': hasLocalUi ? resolve(uiSrc, 'index.ts') : '@collidor/ui',
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
