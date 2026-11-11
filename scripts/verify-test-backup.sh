#!/bin/sh
# Solo se ejecuta dentro del servicio backup-check de compose.test.yaml.
set -eu
umask 077

if [ "${PGHOST:-}" != db-test ] || [ "${PGDATABASE:-}" != ritmo_test ] ||
   [ "${PGUSER:-}" != ritmo_test ] || [ "${PGPORT:-}" != 5432 ] ||
   [ -n "${PGSERVICE:-}${PGSERVICEFILE:-}${PGHOSTADDR:-}${PGOPTIONS:-}" ]; then
    echo "Destino rechazado: solo se permite el PostgreSQL de pruebas." >&2
    exit 1
fi

work=$(mktemp -d)
restore_db="ritmo_restore_$$"
created=0
cleanup() {
    if [ "$created" = 1 ]; then
        dropdb --if-exists "$restore_db" || true
    fi
    rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

# Datos sintéticos para comprobar todas las relaciones, aun con una suite vacía.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
INSERT INTO accounts (username, password_hash)
VALUES ('backup_verification_fixture', 'synthetic-not-a-login-hash')
ON CONFLICT (username) DO NOTHING;
WITH h AS (
  INSERT INTO habits (name, account_id)
  SELECT 'Hábito de respaldo', id FROM accounts WHERE username = 'backup_verification_fixture'
  RETURNING id
)
INSERT INTO habit_checks SELECT id, DATE '2026-11-09' FROM h;
INSERT INTO time_blocks (title, day, starts_at, ends_at, category, account_id)
SELECT 'Bloque de respaldo', DATE '2026-11-09', TIME '09:00', TIME '10:00', 'estudio', id
FROM accounts WHERE username = 'backup_verification_fixture';
INSERT INTO sessions (token_hash, account_id)
SELECT 'synthetic-backup-session', id FROM accounts WHERE username = 'backup_verification_fixture'
ON CONFLICT DO NOTHING;
INSERT INTO tasks (account_id, title, description, priority, category, due_date, completed, completed_at)
SELECT id, 'Tarea de respaldo', 'Datos sintéticos', 'alta', 'trabajo', DATE '2026-11-09', true, CURRENT_TIMESTAMP
FROM accounts WHERE username = 'backup_verification_fixture';
WITH f AS (
  INSERT INTO focus_sessions (account_id, request_id, planned_seconds, duration_seconds, state, started_at, ended_at)
  SELECT id, '00000000-0000-4000-8000-000000000001', 900, 600, 'completed',
         TIMESTAMPTZ '2026-11-09 10:00:00+00', TIMESTAMPTZ '2026-11-09 10:10:00+00'
  FROM accounts WHERE username = 'backup_verification_fixture'
  ON CONFLICT (account_id, request_id) DO NOTHING RETURNING id
)
INSERT INTO focus_segments (session_id, started_at, ended_at)
SELECT id, TIMESTAMPTZ '2026-11-09 10:00:00+00', TIMESTAMPTZ '2026-11-09 10:10:00+00' FROM f;
INSERT INTO focus_requests (account_id, request_id, session_id, operation, payload)
SELECT f.account_id, f.request_id, f.id, 'start', '{"planned_seconds":900,"task_id":null}'::jsonb
FROM focus_sessions f JOIN accounts a ON a.id = f.account_id
WHERE f.request_id = '00000000-0000-4000-8000-000000000001' AND a.username = 'backup_verification_fixture'
ON CONFLICT DO NOTHING;
COMMIT;
SQL

cat > "$work/fingerprint.sql" <<'SQL'
SELECT 'accounts', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM accounts t;
SELECT 'habits', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM habits t;
SELECT 'habit_checks', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM habit_checks t;
SELECT 'time_blocks', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM time_blocks t;
SELECT 'tasks', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM tasks t;
SELECT 'sessions', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM sessions t;
SELECT 'schema_migrations', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM schema_migrations t;
SELECT 'focus_sessions', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM focus_sessions t;
SELECT 'focus_segments', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM focus_segments t;
SELECT 'focus_requests', coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM focus_requests t;
SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
SQL

# La suite ya terminó: no hay escritores concurrentes durante la comparación.
psql -X -v ON_ERROR_STOP=1 -At -f "$work/fingerprint.sql" > "$work/before"
pg_dump --format=custom --no-owner --no-acl --file="$work/ritmo.dump"
pg_restore --list "$work/ritmo.dump" > /dev/null
createdb --template=template0 "$restore_db"
created=1
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
    --dbname="$restore_db" "$work/ritmo.dump"
psql -X -v ON_ERROR_STOP=1 -At --dbname="$restore_db" \
    -f "$work/fingerprint.sql" > "$work/after"
if ! cmp -s "$work/before" "$work/after"; then
    echo "Falló la comparación del respaldo restaurado. No se muestran datos ni sesiones." >&2
    exit 1
fi
echo "Respaldo/restauración de prueba verificados: tablas, relaciones y secuencias coinciden."
