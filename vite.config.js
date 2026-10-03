import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1', // strictly localhost
    watch: {
      ignored: ['**/server/data/**', '**/server/data/videos/**', '**/server/data/exports/**', '**/server/data/cache/**']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
});
