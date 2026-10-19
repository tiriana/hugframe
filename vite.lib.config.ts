import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  // The site's static assets live in public/ and belong to the demo build only;
  // without this, the library build copies them into dist and ships them.
  publicDir: false,
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
