@echo off
REM Compatibility shim for agent verification environments that invoke bare `pytest`.
REM This project uses Django's test runner rather than pytest.
src\backend\venv\Scripts\python.exe src\backend\manage.py test apps.qa %*
