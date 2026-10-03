import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const structSrc = resolve(__dirname, '../src')
const uiDir = resolve(__dirname, 'node_modules/@collidor/ui')

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'vue': 'vue/dist/vue.runtime-with-vapor.esm-browser.js',
      '@collidor/ui/dist/ui.css': resolve(uiDir, 'dist/ui.css'),
      '@collidor/ui/themes': resolve(uiDir, 'src/themes'),
      '@collidor/struct/bridges/axon': resolve(structSrc, 'bridges/axon.ts'),
      '@collidor/struct/bridges/zod': resolve(structSrc, 'bridges/zod.ts'),
      '@collidor/struct/bridges/jsonSchema': resolve(structSrc, 'bridges/jsonSchema.ts'),
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
