import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    // Explicit, so the output does not depend on what the tsconfig happens to say.
    jsx: 'automatic',
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.tsx', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // React belongs to the consumer, and the engine is a runtime dependency rather
      // than something to ship a second copy of.
      external: ['react', 'react/jsx-runtime', 'hugframe', 'hugframe/child'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
