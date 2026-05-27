import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 8080,
    open: false,
    watch: {
      ignored: ['**/coverage/**', '**/test-results/**', '**/dist/**']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html'
    }
  }
});
