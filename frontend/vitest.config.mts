import { defineConfig } from "vitest/config";

/**
 * Тесты фронта.
 *
 * Node проверяет модули lib, локальный адаптер и IndexedDB через fake-indexeddb.
 * Тесты TSX используют React server rendering: проверяют состав экранов,
 * но не заменяют браузерную проверку взаимодействий, гидратации и вёрстки.
 *
 * `tsconfigPaths` — чтобы `@/lib/...` в тестах разрешался так же, как в сборке.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    root: "./",
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
  },
});
