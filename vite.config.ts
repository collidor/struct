import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'bridges/axon': resolve(__dirname, 'src/bridges/axon.ts'),
        'bridges/zod': resolve(__dirname, 'src/bridges/zod.ts'),
        'bridges/jsonSchema': resolve(__dirname, 'src/bridges/jsonSchema.ts'),
      },
      name: 'CollidorStruct',
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['zod', 'vee-validate'],
      output: {
        globals: {
          zod: 'Zod',
          'vee-validate': 'VeeValidate',
        },
      },
    },
  },
})
