#!/bin/sh
set -e

# Clear any rows in _prisma_migrations left in a failed state by a previous
# deploy attempt. All migration SQL in this repo is idempotent, so re-running
# an already-partially-applied migration is safe. This unblocks `migrate deploy`
# when a prior deploy left a failed row behind (Prisma error P3009).
#
# We use `|| true` because the table may not exist yet on a fresh database;
# in that case migrate deploy will create it from scratch.
cat <<'EOF' > /tmp/prisma-cleanup.sql
DELETE FROM "_prisma_migrations" WHERE finished_at IS NULL;
EOF
npx prisma db execute --file /tmp/prisma-cleanup.sql --schema prisma/schema.prisma >/dev/null 2>&1 || true
rm -f /tmp/prisma-cleanup.sql

npx prisma migrate deploy

exec node dist/index.js
