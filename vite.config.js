import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    base: './',
    build: {
        outDir: 'dist',
        sourcemap: false,
        chunkSizeWarningLimit: 1200,
    },
    server: {
        port: 5173,
        strictPort: true,
        host: true,
        // Allow remote/sandboxed preview hosts (Codespaces, e2b, tunnels) to
        // reach the dev server; Vite blocks unknown hosts by default.
        allowedHosts: true,
    },
});
