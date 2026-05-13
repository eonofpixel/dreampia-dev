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
    chunkSizeWarningLimit: 560,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('@codemirror') ||
            id.includes(`${resolve('node_modules', 'codemirror')}`)
          ) {
            return 'codemirror';
          }
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },

  plugins: [
    react(),

    electron([
      {
        // Main process — vite root 가 'src/renderer' 라 절대 경로 필요
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src'),
              '@/main': resolve(__dirname, 'src/main'),
              '@/renderer': resolve(__dirname, 'src/renderer'),
              '@/types': resolve(__dirname, 'src/types'),
            },
          },
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            sourcemap: true,
            chunkSizeWarningLimit: 1300,
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      {
        // v2.3.0 (US-700 hotfix): pluginWorkerEntry — utility_process 가
        // utilityProcess.fork() 로 spawn 하는 child entry. main 번들에
        // inline 되면 안 되고 dist/main/plugins/pluginWorkerEntry.js 위치에
        // 별도 파일로 emit 되어야 함 (PluginUtilityProcessRunner.ts:115 의
        // workerEntryPath default = join(__dirname, 'pluginWorkerEntry.js')
        // 참조). v2.0.0 latent issue — v2.3.0 default 'utility_process'
        // 전환에서 surface.
        entry: resolve(__dirname, 'src/main/plugins/pluginWorkerEntry.ts'),
        vite: {
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src'),
              '@/main': resolve(__dirname, 'src/main'),
              '@/types': resolve(__dirname, 'src/types'),
            },
          },
          build: {
            outDir: resolve(__dirname, 'dist/main/plugins'),
            sourcemap: true,
            emptyOutDir: false,
            lib: {
              entry: resolve(__dirname, 'src/main/plugins/pluginWorkerEntry.ts'),
              formats: ['es'],
              fileName: () => 'pluginWorkerEntry.js',
            },
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'node:path', 'node:fs'],
            },
          },
        },
      },
      {
        // Preload script — CommonJS (.cjs) 강제.
        // Electron preload + sandbox=true 는 ESM 미지원.
        // package.json 의 "type":"module" 때문에 .js 는 ESM 로 해석되므로
        // .cjs 확장자 + format:'cjs' 명시 필요. (E2E 실행 중 발견)
        entry: resolve(__dirname, 'src/main/preload.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          resolve: {
            alias: {
              '@': resolve(__dirname, 'src'),
              '@/main': resolve(__dirname, 'src/main'),
              '@/types': resolve(__dirname, 'src/types'),
            },
          },
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            sourcemap: true,
            // lib mode 로 명시해야 vite-plugin-electron 의 default ESM 설정
            // 을 override 가능. format:'cjs' 만으론 import 가 그대로 남음.
            lib: {
              entry: resolve(__dirname, 'src/main/preload.ts'),
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
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
