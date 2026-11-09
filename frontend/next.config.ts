import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";



const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Проект живёт в npm workspaces: зависимости подняты в корневой node_modules,
  // а `shared/` лежит рядом. Без явного корня Turbopack считает корнем папку
  // frontend и не находит ни next, ни общие типы.
  turbopack: {
    root: process.env.MYBUILD_WORKSPACE_ROOT ?? resolve(here, ".."),
  },

  // Пакет общих типов собирается в ESM локально и не публикуется в npm.
  transpilePackages: ["@mybuild/shared"],

  // `X-Powered-By: Next.js` ничего не даёт посетителю, а сканеру сразу
  // называет фреймворк и сужает перебор известных уязвимостей.
  poweredByHeader: false,

};

export default nextConfig;
