import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures relative paths work on GH Pages
  build: {
    outDir: 'dist',
  }
});
