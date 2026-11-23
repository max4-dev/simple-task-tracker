# Доска задач

Цель: ограниченная выдача карточек, безопасные перемещения, атомарный порядок колонок.

- [x] Project.boardRevision и SQL-инвалидация страниц при изменении задач/назначений/статусов/тегов.
- [x] GET board: страницы колонок и первые карточки; GET board/columns/:statusId/tasks: продолжение колонки, фильтры и total.
- [x] POST tasks/:taskId/move: expectedRevision, statusId, previousTaskId/nextTaskId (nullable); проверка полного соседства без фильтров.
- [x] Decimal(30,15), точный расчёт через BigInt, строковый ответ; перебалансировка и append для create/restore/PATCH status/delete status.
- [x] PUT board/columns/order: полный список IDs и expectedBoardRevision, одна транзакция.
- [x] Общая SHARE-блокировка организации для проектных операций; UPDATE организации для изменения членства/owner. Проект блокируется эксклюзивно.
- [x] Unit/HTTP/реальные SQL-конкурентные тесты и миграция старых данных, документация.

Курсоры связаны с проектом, колонкой, фильтрами и boardRevision. Изменённая доска даёт 409 BOARD_CHANGED; перезагрузить её. Метки времени и UUID не используются как версия. Перебалансировка не меняет относительный порядок или revision карточек, но инвалидирует страницы. Move создаёт одно событие MOVED и увеличивает revision задачи. Почта/уведомления/UI доски вне этого этапа.

Блокировки и transition tables сверены с PostgreSQL 18:
https://www.postgresql.org/docs/18/explicit-locking.html
https://www.postgresql.org/docs/18/sql-createtrigger.html

После разделения модулей реализация доски находится в BoardModule. Зависимость
направлена BoardModule → TaskModule (TaskMutationService); обратной зависимости нет.
HTTP-контракты и схема БД сохранены.
