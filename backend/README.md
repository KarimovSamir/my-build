# MyBuild — backend

NestJS 12 (TypeScript, ESM) + Prisma + Supabase Postgres. Единственная точка
входа к данным приложения: браузер обращается к Supabase напрямую только за
авторизацией, всё остальное идёт сюда.

Требования и доменная модель — в `MyBuild_NestJS_TZ.md` в корне репозитория,
правила работы над проектом — в `CLAUDE.md`.

## Запуск

Пакет входит в npm workspaces, поэтому зависимости ставятся из корня репозитория:

```bash
npm install                 # из корня
cp backend/env.example backend/.env   # заполнить значения
npm run dev                 # backend + frontend вместе
npm run dev:api             # только backend
```

API поднимается на `http://localhost:4000`, проверка живости —
`GET /health` (200 при живой базе, 503 с причиной при недоступной).

## Переменные окружения

Шаблон со всеми переменными и пояснениями, где их взять в панели Supabase, —
в `env.example`. Набор проверяется при старте: приложение с неполным `.env`
не поднимется молча, а упадёт со списком того, чего не хватает
(`src/config/env.validation.ts`).

`DATABASE_URL` — пул соединений (порт 6543), по нему работает приложение.
`DIRECT_URL` — прямое подключение (порт 5432), нужно только Prisma для миграций.

## База данных

```bash
npm run db:migrate    # применить миграции (prisma migrate dev)
npm run db:generate   # пересобрать клиент Prisma
npm run db:seed       # тестовые данные: клиент, компании, заказы всех статусов
npm run db:studio     # Prisma Studio
```

Клиент Prisma генерируется в `src/generated/prisma/` и в git не хранится —
после клонирования репозитория нужен `npm run db:generate`.

На всех таблицах включён RLS без политик (ТЗ §6): Prisma ходит в базу напрямую
и RLS не подчиняется, а публичный anon-ключ из браузера не прочитает ни строки.

## Тесты

```bash
npm test              # unit
npm run test:e2e      # e2e
```

Unit-тесты базы не требуют. Часть e2e работает с реальным подключением из
`.env`: создаёт своих пользователей и удаляет их после прогона.

## Структура

```
prisma/schema.prisma   доменная модель и enum-ы
prisma/migrations/     SQL-миграции
prisma/seed.ts         тестовые данные
prisma.config.ts       конфигурация Prisma CLI (миграции идут по DIRECT_URL)
src/
  main.ts              точка входа
  bootstrap.ts         helmet, CORS, ValidationPipe, формат ошибок
  config/              проверка .env при старте
  common/filters/      единый формат ошибок API
  prisma/              PrismaModule и PrismaService
  modules/health/      GET /health
  modules/orders/      OrderStateMachine и транзакционная обёртка
```
