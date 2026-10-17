#!/bin/bash
# Run on the Proxmox host. Default target is staging CT 251 (never 250 unless you override).
set -euo pipefail
CT="${WORKSHOP_DEV_CT:-251}"
IP="${WORKSHOP_DEV_IP:-192.168.10.251}"
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"

usage() {
  cat <<EOF
Usage: WORKSHOP_DEV_CT=251 bash ops.sh <command>

  health       curl /health on the staging guest
  status       systemctl status zeus-workshop
  restart      restart zeus-workshop on the staging CT
  logs         last 60 journal lines
  users        list emails / names / crews
  bags         expand bag JSON to one row per item
  events       list live_events
  event-up     insert/refresh sample announcement (dev-banner)
  event-down   end sample announcement
  event-santa  insert/refresh Secret Santa opt-in (7 days)
  sql '…'      run SQL as postgres against workshop DB
  sql-file f   run a .sql file from staging/sql/ or an absolute path
EOF
}

need_pct() { command -v pct >/dev/null || { echo 'pct not found — run this on the Proxmox host.'; exit 1; }; }
sql() {
  need_pct
  pct exec "$CT" -- runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d workshop -c "$1"
}
sql_file() {
  need_pct
  local file="$1"
  if test ! -f "$file"; then
    if test -f "$HERE/sql/$file"; then file="$HERE/sql/$file"
    else echo "SQL file not found: $1"; exit 1; fi
  fi
  # Push then execute so the guest does not need the repo mounted.
  local remote="/tmp/workshop-staging-$$.sql"
  pct push "$CT" "$file" "$remote"
  pct exec "$CT" -- bash -lc "runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d workshop -f '$remote'; rm -f '$remote'"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  health)
    need_pct
    pct exec "$CT" -- curl -fsS http://127.0.0.1:8787/health
    echo
    echo "(from host LAN) curl -fsS http://${IP}:8787/health"
    ;;
  status) need_pct; pct exec "$CT" -- systemctl status zeus-workshop --no-pager ;;
  restart) need_pct; pct exec "$CT" -- systemctl restart zeus-workshop; sleep 2; pct exec "$CT" -- curl -fsS http://127.0.0.1:8787/health; echo ;;
  logs) need_pct; pct exec "$CT" -- journalctl -u zeus-workshop -n 60 --no-pager ;;
  users) sql "SELECT email, display_name, crew, handle, email_verified_at IS NOT NULL AS verified FROM users ORDER BY created_at;" ;;
  bags) sql "SELECT u.email, u.display_name, u.crew, item->>'item' AS item_id, item->>'from' AS origin FROM users u JOIN profiles p ON p.user_id=u.id CROSS JOIN LATERAL jsonb_array_elements(p.data->'bag') AS item ORDER BY u.display_name, item_id;" ;;
  events) sql "SELECT id, title, enabled, kind, metric, target, start_at, end_at FROM live_events ORDER BY start_at;" ;;
  event-up) sql_file announcement.sql ;;
  event-down) sql "UPDATE live_events SET enabled=false, end_at=now() WHERE id='dev-banner'; SELECT id, enabled, end_at FROM live_events WHERE id='dev-banner';" ;;
  event-santa) sql_file secret-santa.sql ;;
  sql) test "${1:-}" != '' || { usage; exit 1; }; sql "$1" ;;
  sql-file) test "${1:-}" != '' || { usage; exit 1; }; sql_file "$1" ;;
  ''|-h|--help|help) usage ;;
  *) echo "Unknown command: $cmd"; usage; exit 1 ;;
esac
