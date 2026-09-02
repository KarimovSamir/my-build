import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // esbuild, которым Vitest собирает файлы по умолчанию, не умеет
    // emitDecoratorMetadata. Без этого DI Nest и class-validator не видят
    // типы параметров. SWC это умеет.
    swc.vite({ module: { type: 'es6' } }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
