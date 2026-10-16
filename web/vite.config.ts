import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In sviluppo le chiamate /api e /uploads vanno al server su localhost:3000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000' },
  },
});
