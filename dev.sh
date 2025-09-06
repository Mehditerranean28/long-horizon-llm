#!/usr/bin/env bash
set -euo pipefail

# Root directory of the repository
ROOT_DIR=$(cd "$(dirname "$0")" && pwd)

# Start FastAPI backend
(
  cd "$ROOT_DIR/backend"
  python server.py
) &
BACKEND_PID=$!

# Start Express proxy (requires MongoDB and Stripe keys in env or defaults)
(
  cd "$ROOT_DIR/frontend"
  NODE_ENV=${NODE_ENV:-development} \
  PORT=${EXPRESS_PORT:-3000} \
  BACKEND_HTTP_URL=${BACKEND_HTTP_URL:-http://localhost:8000} \
  BACKEND_WS_URL=${BACKEND_WS_URL:-ws://localhost:8000/ws} \
  MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017/son_of_anton} \
  SESSION_SECRET=${SESSION_SECRET:-$(openssl rand -hex 32)} \
  STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-sk_test_dummykey1234567890123456789012} \
  STRIPE_PRICE_ID=${STRIPE_PRICE_ID:-price_12345} \
  STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-whsec_testsecret} \
  node server/index.js
) &
EXPRESS_PID=$!

# Start Next.js dev server
(
  cd "$ROOT_DIR/frontend"
  NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:3000/api} \
  npm run dev
) &
NEXT_PID=$!

trap "kill $BACKEND_PID $EXPRESS_PID $NEXT_PID" INT TERM
wait
