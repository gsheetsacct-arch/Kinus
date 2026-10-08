#!/usr/bin/env bash
# Applies all migrations to a fresh database (with stubs for the Supabase auth/storage
# schemas) and runs each test file in its own database.
# Usage: supabase/tests/run.sh "postgresql://postgres:postgres@localhost:5432"
set -euo pipefail
BASE_URL="${1:-postgresql://postgres:postgres@localhost:5432}"
DIR="$(cd "$(dirname "$0")" && pwd)"
for t in "$DIR"/*.sql; do
  name="$(basename "$t" .sql)"
  [ "$name" = "stubs" ] && continue
  db="kinus_test_$name"
  echo "== $name"
  psql "$BASE_URL/postgres" -q -v ON_ERROR_STOP=1 -c "drop database if exists $db" -c "create database $db"
  psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$DIR/stubs.sql" 2>&1 | grep -v NOTICE || true
  for m in "$DIR"/../migrations/*.sql; do
    psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$m" 2>&1 | grep -v NOTICE || true
  done
  psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$t" > /dev/null
  echo "   ok"
done
