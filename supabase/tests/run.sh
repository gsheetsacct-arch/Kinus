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
  psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$DIR/stubs.sql" > /dev/null 2>&1
  for m in "$DIR"/../migrations/*.sql; do
    # upgrade.sql: data from older versions is seeded just before the migration that converts it
    seed="$DIR/upgrade/before_$(basename "$m" | cut -c1-4).sql"
    if [ "$name" = "upgrade" ] && [ -f "$seed" ]; then psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$seed" > /dev/null; fi
    # one transaction per file, like Supabase; a failing migration fails the run
    out="$(psql "$BASE_URL/$db" -1 -q -v ON_ERROR_STOP=1 -f "$m" 2>&1)" || { echo "$out" | grep -v NOTICE; exit 1; }
  done
  psql "$BASE_URL/$db" -q -v ON_ERROR_STOP=1 -f "$t" > /dev/null
  echo "   ok"
done
