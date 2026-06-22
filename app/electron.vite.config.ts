import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          fileSearchWorker: resolve(__dirname, 'electron/main/fileSearchWorker.ts'),
          embeddingWorker: resolve(__dirname, 'electron/main/embeddingWorker.ts'),
          largeFileWorker: resolve(__dirname, 'electron/main/largeFileWorker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    root: '.',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src')
      }
    },
    plugins: [
      react(),
      {
        name: 'remove-crossorigin',
        transformIndexHtml(html: string) {
          return html.replace(/ crossorigin/g, '')
        }
      }
    ]
  }
})
