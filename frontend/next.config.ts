import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

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

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
          wsUrl: process.env.NEXT_PUBLIC_WS_URL,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          dev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
