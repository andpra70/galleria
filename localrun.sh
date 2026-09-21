#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export GALLERIA_PROXY_TARGET="${GALLERIA_PROXY_TARGET:-https://127.0.0.1:8443}"
export GALLERIA_PROXY_SECURE="${GALLERIA_PROXY_SECURE:-false}"
export VITE_BACKEND_HOST="${VITE_BACKEND_HOST:-belle.iliadboxos.it}"
export VITE_PRODUCTION_SERVICES_URL="${VITE_PRODUCTION_SERVICES_URL:-$GALLERIA_PROXY_TARGET}"
export VITE_APP_BASE="${VITE_APP_BASE:-/}"
npm install
npm run dev -- --host 0.0.0.0
