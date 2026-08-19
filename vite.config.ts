import { defineConfig } from 'vite';

export default defineConfig({
  base: '/DungeonNuckler/',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
