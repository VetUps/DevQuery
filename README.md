# StackOverflow 2.0

## Локальные тестовые данные

После применения миграций можно наполнить локальную БД воспроизводимым набором пользователей, вопросов, ответов, комментариев, голосов и событий репутации:

```bash
cd src/backend
python3 manage.py migrate
python3 manage.py seed_local_data
```

Повторный запуск `seed_local_data` идемпотентен: команда обновляет существующие seed-записи и не плодит дубли. Если нужно пересобрать набор с нуля:

```bash
cd src/backend
python3 manage.py seed_local_data --reset
```

Команда защищена от случайного запуска на production-like БД: без `DEBUG=True` или SQLite она завершится ошибкой. Для осознанного запуска на отдельной локальной БД можно передать `--allow-production`.

Готовые локальные аккаунты используют пароль `Password123!`:

- `admin.local@example.com` — администратор с доступом к admin-panel.
- `newcomer.local@example.com` — новичок с protected-вопросом.
- `participant.local@example.com` — участник с ответами, голосами и комментариями.
- `expert.local@example.com` — эксперт с принятым решением.
- `moderated.local@example.com` — пользователь с ручным уровнем репутации для проверки moderation flow.
