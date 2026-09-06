import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reviewPages } from './build/review.ts';
export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH || '/',
  plugins: [react(), reviewPages()],
  // Poll source edits on Windows: missed native file events served stale modules.
  server: { host: '127.0.0.1', port: 5174, strictPort: true, watch: { usePolling: true, interval: 250, ignored: ['**/artifacts/**'] } },
});
