import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    // jsdom should always provide localStorage; this guard is just in case
  }
})

afterEach(() => {
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
})
