import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Проект живёт в npm workspaces: зависимости подняты в корневой node_modules,
  // а `shared/` лежит рядом. Без явного корня Turbopack считает корнем папку
  // frontend и не находит ни next, ни общие типы.
  turbopack: {
    root: resolve(here, ".."),
  },

  // Пакет общих типов собирается в ESM локально и не публикуется в npm.
  transpilePackages: ["@mybuild/shared"],
};

export default nextConfig;
