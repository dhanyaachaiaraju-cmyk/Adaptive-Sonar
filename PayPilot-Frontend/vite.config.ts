import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api → Adaptive Sonar FastAPI backend. The browser sees one origin, so no CORS
// configuration is needed in development. Override with SONAR_API_URL.
const proxy = {
  '/api': { target: process.env.SONAR_API_URL ?? 'http://localhost:8000', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { proxy },
  build: {
    // three.js (~540 kB, 135 kB gzip) is its own lazily loaded chunk, fetched only by 3D pages.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
    },
  },
})
