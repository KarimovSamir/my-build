import { defineConfig } from "vitest/config";

/**
 * Тесты фронта.
 *
 * Окружение — `node`, а не `jsdom`: проверяются чистые модули `src/lib`,
 * `src/proxy.ts` и клиент API, то есть код без DOM. Компонентные тесты
 * потребуют отдельной инфраструктуры (jsdom + Testing Library) и место
 * для неё — подфаза 7.2.
 *
 * `tsconfigPaths` — чтобы `@/lib/...` в тестах разрешался так же, как в сборке.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    root: "./",
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
