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

## DockerHub Publishing

Successful `main` branch runs and manual `workflow_dispatch` runs publish:

- `DOCKERHUB_USERNAME/devquery-backend`
- `DOCKERHUB_USERNAME/devquery-frontend`

Pull requests build images without pushing.

Required GitHub configuration:

- `DOCKERHUB_USERNAME` secret with the DockerHub namespace/user
- `DOCKERHUB_TOKEN` secret with a DockerHub access token
- `VITE_API_BASE_URL` variable with the public backend API base URL for the frontend build

Images are tagged as `latest` and `sha-<short_sha>`.

VPS SSH deployment is handled by Phase 9, not Phase 8.
