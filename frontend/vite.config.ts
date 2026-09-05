import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Quick HTTPS tunnels are supported for real-device development; production uses an exact deployed host.
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } }
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true }
});
