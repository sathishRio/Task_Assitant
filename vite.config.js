import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the API runs separately (server/ on port 4000); proxy /api to it so the
// browser sees one origin, exactly as in production where Express serves this build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:4000' },
  },
});
