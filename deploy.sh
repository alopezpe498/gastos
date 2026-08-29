#!/usr/bin/env bash
# Despliegue de gastos en el servidor.
# Uso: ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Descartando cambios locales y actualizando desde origin/main"
git fetch origin
git reset --hard origin/main
git pull --ff-only origin main

echo "==> Cargando nvm y usando Node 22"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if ! command -v nvm >/dev/null 2>&1; then
  echo "ERROR: no se ha encontrado nvm en $NVM_DIR" >&2
  exit 1
fi
nvm use 22

echo "==> Instalando dependencias"
npm ci

echo "==> Construyendo el frontend"
npm run build

echo "==> Reiniciando el proceso de pm2"
# --update-env hace que pm2 recoja los cambios de ecosystem.config.cjs.
pm2 restart gastos --update-env

echo "==> Listo. Estado actual:"
pm2 status gastos
