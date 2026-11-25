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
    port: 5173,
    open: true,
    // Pinned to IPv4. Left as `localhost`, Node resolves it to `::1` first and
    // binds *only* that, so anything that reaches for 127.0.0.1 — which is most
    // tools, and Chrome on some loads — is refused at the door. That refusal
    // arrives as a blank page or a missing image, not as a network error worth
    // reading, so it is worth pinning rather than diagnosing twice.
    host: '127.0.0.1',
    // The backend service owns all data. Until it is running,
    // the app falls back to the local mock catalogue in src/data.
    proxy: {
      '/api': {
        // Also pinned to IPv4: Node resolves `localhost` to `::1` first, so a
        // backend bound only to 127.0.0.1 is unreachable through the proxy even
        // while it is running.
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
