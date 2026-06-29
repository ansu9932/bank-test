import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Strip console.* and debugger statements from the production bundle. They're
  // dead weight in shipped JS (contributes to "unused JavaScript") and leak
  // internal logs to end users. Errors still surface via the app's UI/toasts.
  esbuild: {
    drop: ['console', 'debugger'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Show gzip (compressed) sizes in the build summary so the output reflects
    // real over-the-wire transfer size, not just raw bytes.
    reportCompressedSize: true,
    // Headroom above the default 500kB: after route-based code splitting the
    // only chunk that legitimately approaches this is `charts` (recharts).
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Readable, content-hashed names so chunks in the build table map back
        // to their source (e.g. assets/DashboardPage-<hash>.js).
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          icons: ['lucide-react', 'react-icons'],
        },
      },
    },
  },
});
