import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const pubspec = readFileSync(fileURLToPath(new URL('../pubspec.yaml', import.meta.url)), 'utf8');
const appVersion = pubspec.match(/^version:\s*([^\s+]+)/m)?.[1];
if (!appVersion) throw new Error('Pixora version is missing from pubspec.yaml');

export default defineConfig({
  base: './',
  define: { __PIXORA_VERSION__: JSON.stringify(appVersion) },
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
