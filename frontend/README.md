# MyBuild — frontend

Next.js 16 (App Router) + Tailwind 4 + shadcn/ui. Интерфейс на русском, обе роли
(клиент и компания) живут в одном кабинете. За данными фронт ходит в NestJS
(`backend/`), напрямую в Supabase — только за авторизацией.

Требования и макеты — в `MyBuild_NestJS_TZ.md` в корне репозитория и в
`docs/design/`, правила работы над проектом — в `CLAUDE.md`.

## Запуск

Пакет входит в npm workspaces, поэтому зависимости ставятся из корня репозитория:

```bash
npm install                             # из корня
cp frontend/env.example frontend/.env    # заполнить значения
npm run dev                             # frontend + backend вместе
npm run dev:web                         # только frontend
```

Приложение поднимается на `http://localhost:3000`, API ожидается на
`http://localhost:4000`.

## Переменные окружения

Шаблон — в `env.example`. Наружу (в браузер) уходит только то, что начинается с
`NEXT_PUBLIC_`: адрес проекта Supabase, публичный anon-ключ и адрес API.
Секретных ключей и строки подключения к базе здесь нет и быть не должно — они
живут в `backend/.env` (ТЗ §6).

## Авторизация и защита маршрутов

`src/proxy.ts` (в Next.js 16 заменил `middleware.ts`) на каждом запросе продлевает
сессию Supabase, уводит гостя на `/login`, а вошедшего — в раздел его роли.
Это удобство и первый барьер; настоящую проверку прав делает backend.

## Тема оформления

Светлая, тёмная и «как в системе» (ТЗ §7). Класс `dark` на `<html>` выставляет
`next-themes` (`components/theme-provider.tsx`), переключатель —
`components/theme-toggle.tsx` в шапке кабинета, на лендинге и на экранах входа.
Цвета берутся только из токенов `globals.css`: захардкоженный `bg-white`
сломает тёмную тему.

## Структура

```
src/
  app/
    page.tsx              лендинг (публичный)
    (auth)/               вход, регистрация, сброс пароля, /callback
    (app)/                кабинет обеих ролей: меню + шапка + разделы
  components/ui/          компоненты дизайн-системы (shadcn)
  components/layout/      боковое меню, шапка, хлебные крошки
  components/orders/      экраны заказов
  components/brand/       логотип
  components/status-badge.tsx   badge статусов заказа и предложения
  lib/api.ts              транспорт к NestJS; api.server.ts / api.client.ts берут токен
  lib/supabase/           клиенты Supabase (browser / server / proxy)
  lib/navigation.ts       состав бокового меню по ролям
  lib/types.ts            единственный вход к типам из `shared/`
  proxy.ts                сессия и защита маршрутов
```

Доменные типы, enum-ы и общие для формы и API правила лежат в пакете
`shared/` и импортируются через `@/lib/types` — дублировать их здесь нельзя
(`CLAUDE.md` §5). После правки `shared/` нужен `npm run build:shared` из корня,
иначе фронт не увидит новых типов.

## Проверки

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production-сборка
```

Своих автотестов у фронта пока нет — это отдельная задача Фазы 7.
