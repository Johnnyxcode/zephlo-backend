#!/bin/sh
set -e

mkdir -p /data

echo "Applying database schema..."
npx prisma db push --accept-data-loss

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding demo data..."
  npx prisma db seed || echo "Seed failed or skipped — continuing startup."
fi

echo "Starting API..."
exec node dist/src/main.js
