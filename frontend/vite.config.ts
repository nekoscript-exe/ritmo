import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173, strictPort: true, host: '127.0.0.1',
        proxy: { '/api': { target: process.env.RITMO_API_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: false } },
    },
    build: { rollupOptions: { input: { dashboard: 'index.html', legacy: 'legacy.html' } } },
});
