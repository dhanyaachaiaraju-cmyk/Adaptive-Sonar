import { afterEach } from 'vitest'

// Unmount React trees between component tests (Testing Library does not auto-clean without globals).
afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
