# Task tracker API

NestJS 12 + Prisma 7 + PostgreSQL 18. Native ESM, Node.js 26 LTS.
Docker Compose v2.20+.

Модели организаций, ролей, проектов, задач и уведомлений описаны в
[docs/data-model.md](docs/data-model.md). Изолированная проверка миграций и
ограничений PostgreSQL, а также API пользователя и Redis: `npm run test:domain`.

Модуль пользователя, маршруты и правила доступа: [docs/user-module.md](docs/user-module.md).
Модуль организаций, owner и приглашения: [docs/organization-module.md](docs/organization-module.md).
Модуль проектов, участники, статусы и теги: [docs/project-module.md](docs/project-module.md).
Swagger доступен на `/docs`. Для существующего окружения требуется добавить
случайный `JWT_SECRET` (минимум 32 символа) и настроить `TRUSTED_ORIGINS`.

## Запуск в Docker

Из каталога `backend`:

```sh
npm run env:init
npm run docker:up
curl --fail http://127.0.0.1:3001/health/ready
```

`env:init` создаёт `.env` со случайными паролями PostgreSQL/Redis и JWT-секретом и правами
`0600`. Существующий файл не перезаписывается. Альтернатива — заполнить
`.env.example` и сохранить как `.env`. Пароли для Compose должны быть URL-safe
(например, hex, как у генератора); произвольные пароли в URL нужно percent-encode.
Ни `.env`, ни сгенерированный Prisma Client не попадают в Git или Docker context.

Compose запускает:

- `postgres`: постоянный named volume, SCRAM, healthcheck; без опубликованного порта.
- `migrate`: одноразовый `prisma migrate deploy`. Ошибка миграции блокирует запуск API.
- `api`: production-сборка без dev-зависимостей, UID `node`, read-only filesystem,
  `no-new-privileges`, без Linux capabilities, с ограничениями памяти/CPU и логов.

API опубликован только на `127.0.0.1:3001`. На сервере перед ним нужен reverse proxy
с HTTPS. Внутри Compose он слушает `0.0.0.0:3001`. Порт хоста задаётся `API_PORT`.
`GET /health/live` проверяет процесс, `/health/ready` — реальное соединение с БД
(HTTP 503 при отказе). Docker healthcheck использует readiness; сам по себе статус
`unhealthy` не перезапускает работающий процесс.

```sh
docker compose ps
docker compose logs --tail=100 api migrate
npm run docker:down
```

`docker compose down` сохраняет данные. Не добавляйте `--volumes`, если данные нужны.

## Prisma и права доступа

`src/common/database/database.module.ts` экспортирует `PrismaService`. Для доступа к данным
импортируйте `DatabaseModule` в нужный Nest-модуль и внедряйте `PrismaService`.
Пул создаётся один раз; соединение проверяется при старте, закрывается после
остановки HTTP-сервера. Размер пула и таймауты валидируются при запуске.

В БД три роли:

- `postgres`: только первоначальная настройка и администрирование.
- `task_tracker_migrator`: владелец БД и схем, выполняет DDL и миграции.
- `task_tracker_app`: CONNECT, USAGE схемы `app`, DML для её таблиц и доступ к sequence.
  Не может создавать таблицы или читать/менять `public._prisma_migrations`.

Первая миграция создаёт схему `app`, следующая — доменные модели.
Новые модели и enum в `prisma/schema.prisma` должны содержать `@@schema("app")`.
Prisma использует multi-schema; таблица истории миграций остаётся в `public`.
Default privileges выдаются будущим таблицам, созданным именно migrator-ролью.

Инициализация ролей в `docker/postgres/init.sh` выполняется только для пустого
volume. Изменение паролей в `.env` не меняет роли существующей БД: при ротации
нужно отдельно обновить пароль роли и конфигурацию приложения.

## Локальная разработка

```sh
nvm install
nvm use
npm ci
npm run env:init  # только если .env ещё нет
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis
npm run db:deploy
npm run start:dev
```

Dev override публикует PostgreSQL только на `127.0.0.1:5432`. `DATABASE_URL` из `.env`
использует app-роль, `MIGRATION_DATABASE_URL` — migrator-роль. При смене
`POSTGRES_PORT` обновите порт в обеих локальных URL. В production приложение читает
только переменные процесса; `.env` в runtime не загружается.

Создание новой миграции требует отдельной shadow database. Production-роль migrator
намеренно не имеет `CREATEDB`. Только в локальной среде один раз выполните:

```sh
docker compose exec -T postgres createdb -U postgres -O task_tracker_migrator task_tracker_shadow
```

Задайте `SHADOW_DATABASE_URL` в `.env`, используя migrator-пароль и имя
`task_tracker_shadow` (см. `.env.example`). Никогда не указывайте основную БД как
shadow database: Prisma очищает её при разработке миграций.

```sh
npm run db:migrate -- --name add_tasks
npm run prisma:generate
```

Коммитьте `schema.prisma` и SQL-миграции вместе. Применённые миграции не редактируют.
В production используются только `db:deploy` / migration job, без `migrate dev`,
`db push` или автоматического сброса БД.

## Проверки

```sh
npm run prisma:validate
npm run build
npm run lint
npm run typecheck
npm run audit:prod
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:integration
```

Unit и HTTP-тесты не требуют БД. HTTP-тесты подменяют Prisma и проверяют контракты
health endpoints. `test:integration` требует сборку, доступную локальную Compose БД
и применённые миграции: проверяет реальный Prisma Client, историю миграций и
изоляцию ролей, не меняя данные.

## Развёртывание

`Dockerfile` содержит независимые targets `runtime` и `migrate`. В CI собирайте оба
из одного commit, присваивайте один immutable `IMAGE_TAG` и публикуйте в свой registry.
Compose здесь — конфигурация для одного сервера; при обновлении уже работающего API
сначала явно выполните migration job и дождитесь успеха, затем обновите API:

```sh
docker compose build api migrate
docker compose run --rm migrate
docker compose up -d --no-deps api
```

Для первого запуска используйте `docker compose up --build -d --wait`.
Изменения схемы должны быть совместимы с предыдущей версией API (expand/contract).
Миграции и backup/restore следует проверять на staging перед применением к production.

Базовый Node-образ задаётся build arg `NODE_IMAGE`; для воспроизводимых релизов
обновляйте проверенные digest Node и PostgreSQL в deploy-конфигурации и регулярно
обновляйте их. `npm ci` использует committed lockfile.

На production передавайте секреты из secret manager/CI, не включайте их в image или
репозиторий. Для managed PostgreSQL задайте отдельные runtime и migration URL,
настройте эквивалентные роли и TLS с проверкой сертификата (`sslmode=verify-full`,
CA провайдера). Не отключайте проверку сертификата. Мигратор должен подключаться
напрямую, без transaction pooler. Размер пула умножается на число реплик API.

Named volume не является резервной копией. Нужны регулярные зашифрованные backups,
проверка восстановления и мониторинг readiness, памяти, диска и ошибок БД.

Официальная документация: [Prisma generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators),
[Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/),
[PostgreSQL Docker image](https://hub.docker.com/_/postgres).


## Redis и конфигурация

Настройки валидируются Zod-схемой `src/common/config/app-config/config.schema.ts`;
тип `ConfigSchema` выводится из неё. Ошибки содержат только названия полей.
`REDIS_PASSWORD` обязателен. TLS включается явно через `REDIS_TLS=true` для Redis
с TLS, независимо от NODE_ENV. В закрытой сети Compose используется обычный Redis.
Readiness проверяет PostgreSQL и Redis; liveness не зависит от них.

Для существующего `.env` добавьте REDIS_HOST=localhost, REDIS_PORT=6379,
REDIS_TLS=false и случайный REDIS_PASSWORD. `env:init` создаёт их для новых окружений.
Compose передаёт API внутренний адрес `redis`; основной compose не публикует порт Redis.

Проверка реального Redis через RedisService и TokenService:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --wait redis
npm run build
npm run test:redis
```

Проверка использует уникальный тестовый ключ и удаляет его в конце. Она проверяет
PING, хеширование токена, TTL, корректный/некорректный токен и удаление.
Константы времени доступны как `TIME.ONE_SECOND.IN_MS`, `TIME.ONE_HOUR.IN_SEC`,
`TIME.ONE_DAY.IN_SEC` и аналогично для минут. TTL JWT, cookie и Redis согласованы: access — 7 часов, refresh — 30 дней.

## ESM и версии инструментов

В package.json установлен `type: module`, в TypeScript — `module/moduleResolution: NodeNext`.
Локальные импорты используют расширение `.js` даже в исходных `.ts`; для каталога
нужно явно указывать `index.js`. Типы импортируются через `import type`.
Prisma генерирует ESM-клиент с `.js` в импортах; применённые SQL-миграции не меняются.

`npm run start:prod` запускает обычный Node.js с source maps, без ts-node и
CommonJS-loader. Jest 30 также работает в ESM через `--experimental-vm-modules`;
конфигурации тестов — `jest.config.mjs` и `test/jest-e2e.config.mjs`.
ESLint 10 настроен через `eslint.config.mjs`.

Прямые зависимости закреплены точными версиями и package-lock.json.
TypeScript оставлен на 6.0.3: актуальные ts-jest и typescript-eslint ещё не
поддерживают TypeScript 7. Prisma CLI, Client и pg-adapter используют стабильную
7.10.1; Prisma 8 пока RC, несмотря на npm-тег latest.
Node.js закреплён в `.nvmrc` и Docker image digest на 26.13.1.
