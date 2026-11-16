#!/bin/sh
# Container start-up: snapshot the database if a migration is about to change
# it, apply migrations, then run the server.
set -e

node --disable-warning=ExperimentalWarning scripts/backup-db.mjs
node prisma-cli/node_modules/prisma/build/index.js migrate deploy

# exec, so the server replaces this shell as PID 1 and receives the stop signal
# itself rather than being killed when the grace period runs out.
exec node server.js
