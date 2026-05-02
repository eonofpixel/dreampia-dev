import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/main': resolve(__dirname, 'src/main'),
      '@/renderer': resolve(__dirname, 'src/renderer'),
      '@/types': resolve(__dirname, 'src/types'),
    },
  },

  root: 'src/renderer',

  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    cssCodeSplit: true,

    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },

  plugins: [
    react(),

    electron([
      {
        // Main process
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            sourcemap: true,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        // Preload script
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/main',
            sourcemap: true,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),

    renderer(),
  ],

  server: {
    port: 5173,
    strictPort: true,
  },
});
