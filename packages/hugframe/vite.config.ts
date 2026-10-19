import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  // The package ships nothing but dist, so a public directory would only ever be
  // copied into the published artifact by accident.
  publicDir: false,
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        child: fileURLToPath(new URL('./src/child.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
