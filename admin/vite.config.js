import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // The storefront owns 5173, so both apps can run side by side.
    port: 5174,
    host: '127.0.0.1',
    open: true,
    // The backend service owns all data — admin reads and writes go through
    // this proxy to /api. There is no bundled-fixture fallback any more.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
