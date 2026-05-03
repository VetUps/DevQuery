#!/usr/bin/env bash
set -Eeuo pipefail

: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
: "${PUBLIC_FRONTEND_URL:?PUBLIC_FRONTEND_URL is required}"
: "${PUBLIC_BACKEND_URL:?PUBLIC_BACKEND_URL is required}"

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-devquery}"
VPS_ENV_FILE="${VPS_ENV_FILE:-.env}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$VPS_ENV_FILE" ]]; then
  echo "Missing VPS .env: $VPS_ENV_FILE" >&2
  exit 1
fi

docker --version
docker compose version

export BACKEND_IMAGE
export FRONTEND_IMAGE
export VPS_ENV_FILE

COMPOSE=(
  docker compose
  --env-file "$VPS_ENV_FILE"
  -f "$COMPOSE_FILE"
  --project-name "$COMPOSE_PROJECT_NAME"
)

"${COMPOSE[@]}" config >/dev/null
"${COMPOSE[@]}" pull db backend frontend
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm backend python manage.py migrate --noinput
"${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 120 backend frontend
"${COMPOSE[@]}" ps
docker image prune -f
