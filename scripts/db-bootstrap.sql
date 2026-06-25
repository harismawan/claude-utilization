-- Provision the app role + database on a fresh Postgres host.
-- Pass the app password as a variable (do NOT hardcode it here):
--   PGPASSWORD=<admin-pw> psql -h 192.168.100.21 -U postgres -d postgres \
--     -v app_pw="$CLAUDE_UTIL_DB_PASSWORD" -f scripts/db-bootstrap.sql
-- Keep :app_pw in sync with the password in DATABASE_URL (.env).
-- Idempotent: safe to re-run.

-- Create the role if missing, then (re)set its password. The password is
-- interpolated outside any dollar-quoted block so psql actually substitutes
-- :'app_pw'; format(%L) handles SQL quoting/escaping.
SELECT 'CREATE ROLE claude_util LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_util')
\gexec

SELECT format('ALTER ROLE claude_util LOGIN PASSWORD %L', :'app_pw')
\gexec

-- CREATE DATABASE cannot run inside a transaction/DO block; \gexec guards it.
SELECT 'CREATE DATABASE claude_util OWNER claude_util'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'claude_util')
\gexec

\connect claude_util
ALTER SCHEMA public OWNER TO claude_util;
GRANT ALL ON SCHEMA public TO claude_util;
