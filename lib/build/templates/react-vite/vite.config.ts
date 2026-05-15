import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Mini-apps load inside apna-app iframes; CORS headers are needed in dev.
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
