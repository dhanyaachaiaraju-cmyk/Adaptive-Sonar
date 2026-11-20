import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_DEV_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    // The customer form is lazy-loaded, so Vite's dev server only discovers these
    // on first use and then force-reloads the page (losing anything typed). Pre-bundle them.
    optimizeDeps: { include: ['libphonenumber-js/max'] },
    server: {
      port: 5174, // 5173 is used by another local project on this machine
      strictPort: true,
      // In development, /api is proxied to FastAPI so the browser sees a
      // single origin (no CORS issues, no backend URL baked into the bundle).
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
      },
    },
  }
})
