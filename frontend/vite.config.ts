import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'design-studio-index',
    configureServer(server) {
      // Match production's directory index before Vite's React SPA fallback.
      server.middlewares.use((request, _response, next) => {
        request.url = request.url?.replace(/^\/design-studio\/(?=\?|$)/, '/design-studio/index.html')
        next()
      })
    },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:8765' } },
})
