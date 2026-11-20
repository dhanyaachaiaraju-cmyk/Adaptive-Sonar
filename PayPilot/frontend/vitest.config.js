import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pure-module tests (*.test.js) run in Node. Component tests (*.test.jsx) opt
// into a DOM with a `// @vitest-environment jsdom` comment at the top of the file.
// Run via `npm test` (scripts/run-vitest.mjs normalises the Windows drive letter).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
  },
})
