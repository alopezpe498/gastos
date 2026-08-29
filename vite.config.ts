import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El backend Express escucha en PORT (3003 por defecto). En desarrollo Vite
// sirve el frontend y hace de proxy de /api hacia ese backend.
const PUERTO_API = process.env.PORT || '3003'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${PUERTO_API}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
