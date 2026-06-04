#!/bin/sh
set -e

mkdir -p /data

echo "Running database migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding demo data..."
  npx prisma db seed
fi

echo "Starting API..."
exec node dist/src/main.js
