#!/bin/sh
# Backup automatico ogni notte: copia del database e delle foto/video nella cartella "backups".
# Gira nel servizio "backup" di docker-compose. Tiene gli ultimi KEEP_DAYS giorni di database.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"

backup_once() {
  day=$(date +%Y-%m-%d)
  mkdir -p "$BACKUP_DIR/uploads"
  # Database in formato compatto; si scrive prima in un file temporaneo così un backup interrotto non sovrascrive quello buono.
  pg_dump -h "${PGHOST:-db}" -U "${PGUSER:-stl}" -d "${PGDATABASE:-stl}" -Fc -f "$BACKUP_DIR/.db-$day.tmp"
  mv "$BACKUP_DIR/.db-$day.tmp" "$BACKUP_DIR/db-$day.dump"
  # Foto e video non cambiano mai una volta caricati: si copiano solo quelli nuovi.
  if [ -d "$UPLOADS_DIR" ]; then cp -a -n "$UPLOADS_DIR/." "$BACKUP_DIR/uploads/"; fi
  # Cancella i backup del database più vecchi di KEEP_DAYS giorni.
  find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime +"$KEEP_DAYS" -exec rm -f {} \;
  echo "$(date '+%Y-%m-%d %H:%M') backup completato: db-$day.dump"
}

if [ "${1:-}" = "once" ]; then backup_once; exit 0; fi

# Primo backup subito all'avvio, poi ogni notte all'ora BACKUP_HOUR (ora italiana).
backup_once || echo "backup non riuscito, riprovo alla prossima ora"
while true; do
  sleep 3600
  if [ "$(date +%H)" = "$(printf '%02d' "$HOUR")" ]; then backup_once || echo "backup non riuscito, riprovo domani"; fi
done
