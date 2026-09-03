import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // e2e поднимают приложение целиком — параллельный запуск даёт гонки.
    fileParallelism: false,
    // Часть e2e ходит в реальную базу Supabase: десятки запросов подряд
    // по сети в дефолтные 5 секунд не укладываются.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
