import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // xlsx uses global in some paths
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['xlsx'],
  },
})
