This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Запросы к API

`QueryProvider` подключён в корневом layout. В клиентских компонентах используйте
`authenticatedApiClient` и передавайте сигнал отмены из TanStack Query:

```tsx
import { useQuery } from "@tanstack/react-query";
import { authenticatedApiClient } from "@/shared/api";
import { API_ROUTES } from "@/shared/config";

const session = useQuery({
  queryKey: ["auth", "me"],
  queryFn: ({ signal }) => authenticatedApiClient.get(API_ROUTES.AUTH.ME, { signal }).json<{ user: { id: string } }>(),
});
```

Для публичных эндпоинтов используйте один и тот же клиент в браузере, Server Components и Route Handlers:

```ts
import { anonymousApiClient } from "@/shared/api";

const health = await anonymousApiClient.get("health/live").json();
```

В разработке оба клиента используют `http://localhost:3001`. Для деплоя задайте
`NEXT_PUBLIC_API_ORIGIN` при сборке фронтенда (либо проксируйте маршруты API
на том же origin). Для Next.js на сервере задайте `API_SERVER_ORIGIN` во время
выполнения, например внутренний адрес API в Docker. Если он пропущен,
используется `NEXT_PUBLIC_API_ORIGIN`. Значения содержат схему и хост с
необязательным портом. Для текущих SameSite-cookie используйте HTTPS и размещайте
фронтенд и API на одном site. Добавьте origin фронтенда в `TRUSTED_ORIGINS` бэкенда.

Вход, регистрацию, выход и смену пароля выполняйте через `authenticatedApiClient`, чтобы
кэш запросов очищался при смене сессии. Браузер передаёт HttpOnly-cookie
автоматически. Метки смены сессии живут в памяти вкладки. Открытые вкладки
обмениваются событиями через BroadcastChannel и при наличии Web Locks
выполняют операции обновления сессии по очереди. После 401 защищённый запрос ждёт обновления сессии и повторяется
один раз. Для проверки транспорта запустите `npm test` на Node.js 22.13+.

Настройки приложения доступны через `CONFIG` из `@/shared/config`.
`CONFIG.API_URL` задаёт публичный адрес API, `CONFIG.SERVER_API_URL` — внутренний
адрес для серверных запросов. Чтение переменных окружения и проверка адресов
сосредоточены в `shared/config/env.ts`. Маршруты страниц доступны через `ROUTES`,
эндпоинты авторизации — через `API_ROUTES`.
