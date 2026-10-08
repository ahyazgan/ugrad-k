#!/usr/bin/env bash
# Migration'ları geçici bir yerel PostgreSQL'de uygular ve RLS/RPC testlerini çalıştırır.
# Kullanım: supabase/tests/run.sh   (PostgreSQL 15+ sunucu ikilileri gerekli)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
pgbin="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
tmp="$(mktemp -d)"
port="${PGTEST_PORT:-54329}"
cleanup() { "$pgbin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

run_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$tmp"
run_pg "$pgbin/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
run_pg "$pgbin/pg_ctl" -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -w start >/dev/null

psql_run() { psql -h "$tmp" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_run -f "$here/supabase_stub.sql"
for f in "$root"/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql_run -f "$f"
done
psql_run -f "$root/seed.sql"
for t in "$here"/*.test.sql; do
  echo "▶ $(basename "$t")"
  psql_run -f "$t"
done
echo "✓ Tüm veritabanı testleri geçti"
