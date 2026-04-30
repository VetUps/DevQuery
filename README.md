# StackOverflow 2.0

## CI

GitHub Actions runs the CI workflow on pull requests to `main`, pushes to `main`, and manual `workflow_dispatch`.

Backend local parity:

```powershell
cd src/backend
python manage.py check
python manage.py test
```

Frontend local parity:

```powershell
cd src/frontend
npm run typecheck
npm run test:run
npm run build
```

DockerHub publishing and VPS deployment are handled by later CI/CD phases, not Phase 7.
