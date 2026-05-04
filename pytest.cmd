@echo off
REM Compatibility shim for agent verification environments that invoke bare `pytest`.
REM This project uses Django's test runner rather than pytest.
REM Agent/local verification runs outside Docker Compose, so use a disposable SQLite test DB
REM instead of the Compose-only MySQL host from .env (DATABASE_HOST=db).
set DJANGO_TEST_SQLITE=1
src\backend\venv\Scripts\python.exe src\backend\manage.py test apps.qa %*
