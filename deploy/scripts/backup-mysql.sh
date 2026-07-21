#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_NAME:?DATABASE_NAME is required}"
: "${DATABASE_USER:?DATABASE_USER is required}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/eagle-mart}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${DATABASE_NAME}-${STAMP}.sql.gz"

mysqldump --single-transaction --quick --routines --triggers -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" | gzip > "$FILE"
find "$BACKUP_DIR" -type f -name "${DATABASE_NAME}-*.sql.gz" -mtime +7 -delete
echo "$FILE"
