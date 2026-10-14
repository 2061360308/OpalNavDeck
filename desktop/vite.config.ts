import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/icons': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/plugins': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/skins': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/public': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
