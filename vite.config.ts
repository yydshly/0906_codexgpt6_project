import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reviewPages } from './build/review.ts';
export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH || '/',
  plugins: [react(), reviewPages()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
