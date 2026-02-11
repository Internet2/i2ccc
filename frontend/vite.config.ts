import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'https://x80jb6vrqd.execute-api.us-east-1.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true
      }
    }
  }
})
