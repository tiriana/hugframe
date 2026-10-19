import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
        child: fileURLToPath(new URL('./src/lib/child.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
