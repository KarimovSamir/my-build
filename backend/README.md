# MyBuild — backend

NestJS 12 (TypeScript, ESM) + Prisma + Supabase Postgres. Единственная точка
входа к данным приложения: браузер обращается к Supabase напрямую только за
авторизацией, всё остальное идёт сюда.

Обзор проекта целиком, стек и схема доменной модели — в корневом
[`README.md`](../README.md).

## Запуск

Пакет входит в npm workspaces, поэтому зависимости ставятся из корня репозитория:

```bash
npm install                 # из корня
cp backend/env.example backend/.env   # заполнить значения
npm run dev                 # backend + frontend вместе
npm run dev:api             # только backend
```

API поднимается на `http://localhost:4000`, проверка живости —
`GET /health`: отдаёт `database: "up" | "down"`, причина недоступности уходит
в лог, а не в ответ.

## Переменные окружения

Шаблон со всеми переменными и пояснениями, где их взять в панели Supabase, —
в `env.example`. Набор проверяется при старте: приложение с неполным `.env`
не поднимется молча, а упадёт со списком того, чего не хватает
(`src/config/env.validation.ts`).

`DATABASE_URL` — пул соединений (порт 6543), по нему работает приложение.
`DIRECT_URL` — прямое подключение (порт 5432), нужно только Prisma для миграций.

## База данных

```bash
npm run db:deploy     # применить миграции (prisma migrate deploy)
npm run db:generate   # пересобрать клиент Prisma
npm run db:seed       # тестовые данные: клиент, компании, заказы всех статусов
npm run db:studio     # Prisma Studio
npm run storage:setup # бакет Supabase Storage на свежем проекте
```

Миграции применяются через `db:deploy`, а не `db:migrate`: `prisma migrate dev`
на этой базе падает с `P4002` — ему мешает ссылка `public."User"` на
`auth.users`, то есть внешний ключ на схему Supabase Auth. Это диагностика
самой команды, а не миграций; `migrate deploy` теневую базу не поднимает и
работает штатно.

Клиент Prisma генерируется в `src/generated/prisma/` и в git не хранится —
после клонирования репозитория нужен `npm run db:generate`.

На всех таблицах включён RLS без политик: Prisma ходит в базу напрямую
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
  common/              guard'ы, фильтр ошибок, интерсепторы, семафор, isUuid
  prisma/              PrismaModule и PrismaService
  supabase/            клиент с секретным ключом, проверка JWT по JWKS
  modules/health/      GET /health
  modules/auth/        guard'ы Supabase Auth и роль из токена
  modules/users/       профиль и каталог подрядчиков
  modules/files/       Storage, валидация файлов, /documents
  modules/orders/      заказы, OrderStateMachine и транзакционная обёртка
  modules/offers/      предложения компаний и кабинет компании
  modules/notifications/  уведомления и счётчик непрочитанных
  modules/realtime/    WebSocket-шлюз и рассылка событий
```
