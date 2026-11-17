# Task tracker

Монорепозиторий простого таск-трекера:

- [frontend](frontend/README.md) — Next.js, FSD, shadcn.
- [backend](backend/README.md) — NestJS, Prisma, PostgreSQL, Redis.

Git-репозиторий один, в корне. У приложений пока отдельные package.json и
package-lock.json; npm workspace не настроен.

## Разработка

Установка зависимостей выполняется отдельно:

```sh
npm --prefix frontend ci
npm --prefix backend ci
```

Запуск, необходимые переменные окружения и команды проверки описаны в README
соответствующего приложения. Локальные .env не коммитятся; примеры .env.example
доступны для версионирования. Общий .gitignore действует во всём репозитории,
вложенные .gitignore добавляют исключения Next.js и Prisma.

## Работа с Git

Первый репозиторий создаётся из корня через `git init -b main`.
Далее все Git-команды выполняются из корня:

```sh
git status
git diff -- frontend/
git diff -- backend/
```

Оба приложения должны коммититься обычными каталогами, без вложенных .git и submodule.
Корневые инструкции и относительные ссылки на навыки также входят в репозиторий.
`.gitattributes` закрепляет LF для текстовых файлов, включая shell-скрипты и SQL.
При коммите сохраняйте оба package-lock.json и всю историю Prisma-миграций;
уже применённые миграции не переформатируйте и не переписывайте.

[Инструкции для агентов](AGENTS.md) · [Настройка агентов](docs/agents.md)
