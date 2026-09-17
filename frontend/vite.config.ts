import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8690',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) {
              return 'vendor-charts';
            }
            if (id.includes('@douyinfe/semi-ui') || id.includes('@douyinfe/semi-icons')) {
              return 'vendor-semi';
            }
            if (id.includes('gsap') || id.includes('@gsap')) {
              return 'vendor-animation';
            }
            if (id.includes('react') || id.includes('zustand') || id.includes('scheduler')) {
              return 'vendor-core';
            }
            return 'vendor-other';
          }
        }
      }
    }
  }
})
