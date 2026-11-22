/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cleanUrls } from './vite-plugins/cleanUrls.ts'
import { theme } from './vite-plugins/theme.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cleanUrls(), theme()],
  test: {
    environment: 'jsdom',
  },
})
