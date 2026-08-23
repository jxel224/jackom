#!/bin/sh
# Runs once, automatically, on first container startup (docker-entrypoint-initdb.d convention) —
# creates the separate test database alongside the default dev one ($POSTGRES_DB), so integration
# tests never touch dev data. Both live in the same local Postgres instance; only the database name
# differs (see PERMANENT_BACKEND_FOUNDATION_REPORT.md's "Test Database" section for why this is the
# simplest robust isolation strategy for this project's scale).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE "${POSTGRES_TEST_DB:-jackom_test}";
EOSQL
