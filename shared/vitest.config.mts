import { defineConfig } from 'vitest/config';

/**
 * Тесты общего пакета.
 *
 * Здесь только чистые функции и таблицы — ни Nest, ни React, ни декораторов,
 * поэтому ни SWC, ни особого окружения не нужно: хватает esbuild самого Vite.
 *
 * Спеки лежат рядом с кодом (`src/*.spec.ts`), как в backend и frontend,
 * и в сборку пакета не попадают: `tsconfig.build.json` их исключает.
 */
export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
