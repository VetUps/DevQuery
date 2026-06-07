# Кратко: запускает команды Django для backend.
import os
import sys
from pathlib import Path


def _venv_python():
    """Возвращает путь к Python из виртуального окружения."""
    backend_dir = Path(__file__).resolve().parent
    candidates = (
        backend_dir / 'venv' / 'bin' / 'python',
        backend_dir / 'venv' / 'Scripts' / 'python.exe',
    )
    for candidate in candidates:
        if candidate.exists() and Path(sys.executable).absolute() != candidate.absolute():
            return str(candidate)
    return None


def main():
    """Запускает основной сценарий файла."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.settings')
    try:
        from django.core.management import execute_from_command_line
    except ModuleNotFoundError as exc:
        if exc.name == 'django':
            python_exe = _venv_python()
            if python_exe:
                os.execv(python_exe, [python_exe, *sys.argv])
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
