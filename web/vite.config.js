import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['aiflow.iman.qzz.io'],
    proxy: {
      '/api': 'http://localhost:8790',
      '/mcp': 'http://localhost:8790',
    },
  },
  preview: {
    port: 4931,
    host: true,
    allowedHosts: ['aiflow.iman.qzz.io'],
    proxy: {
      '/api': 'http://localhost:8790',
      '/mcp': 'http://localhost:8790',
    },
  },
})
