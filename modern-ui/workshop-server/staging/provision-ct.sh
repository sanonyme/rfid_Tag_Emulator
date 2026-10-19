#!/bin/bash
# Run on the Proxmox host as root. Clones CT 250 → 251 with a fresh empty database.
set -euo pipefail
SRC="${WORKSHOP_PROD_CT:-250}"
DST="${WORKSHOP_DEV_CT:-251}"
IP="${WORKSHOP_DEV_IP:-192.168.10.251}"
GW="${WORKSHOP_DEV_GW:-192.168.10.1}"
BRIDGE="${WORKSHOP_DEV_BRIDGE:-vmbr0}"
CIDR="${WORKSHOP_DEV_CIDR:-24}"

test "$(id -u)" = 0 || { echo 'Run as root on the Proxmox host.'; exit 1; }
command -v pct >/dev/null

if pct status "$DST" >/dev/null 2>&1; then
  echo "CT $DST already exists. Start/restart only, or destroy it first."
  pct status "$DST"
  exit 1
fi

SNAP="${WORKSHOP_DEV_SNAP:-staging-clone}"
echo "Snapshotting running CT $SRC as $SNAP (no downtime), then cloning to $DST ($IP)..."
# Full clone of a running container requires a snapshot.
pct snapshot "$SRC" "$SNAP" --description "Staging clone base" || true
pct clone "$SRC" "$DST" --hostname zeus-workshop-dev --full --snapname "$SNAP"
pct set "$DST" --net0 "name=eth0,bridge=${BRIDGE},ip=${IP}/${CIDR},gw=${GW}"
pct set "$DST" --onboot 1
# Staging headroom (prod party sizing is applied separately on CT 250).
pct set "$DST" --cores "${WORKSHOP_DEV_CORES:-2}" --memory "${WORKSHOP_DEV_MEMORY:-2048}" --swap "${WORKSHOP_DEV_SWAP:-1024}"
pct start "$DST"
# Optional cleanup of the temporary snapshot on production.
if test "${WORKSHOP_KEEP_SNAP:-0}" != "1"; then
  pct delsnapshot "$SRC" "$SNAP" || true
fi
# Give the guest a moment to bring networking and postgres up.
sleep 5

echo "Wiping cloned database and rotating credentials..."
pct exec "$DST" -- bash -lc '
set -euo pipefail
systemctl stop zeus-workshop || true
runuser -u postgres -- dropdb --if-exists workshop
runuser -u postgres -- createdb -O workshop workshop
PASS=$(/usr/local/bin/node -e "console.log(require(\"node:crypto\").randomBytes(32).toString(\"hex\"))")
umask 077
printf "NODE_ENV=production\nHOST=0.0.0.0\nPORT=8787\nDATABASE_URL=postgresql://workshop:%s@127.0.0.1:5432/workshop\nWORKSHOP_ORIGINS=null,file://,http://localhost:5173,http://127.0.0.1:5173\n" "$PASS" > /etc/zeus-workshop.env
chmod 600 /etc/zeus-workshop.env
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE workshop PASSWORD '\''$PASS'\'';"
# Keep Brevo file if the clone still has it; restart pulls EnvironmentFile entries from the unit.
systemctl start zeus-workshop
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null; then
    echo "Staging health OK"
    exit 0
  fi
  sleep 1
done
echo "Service started but /health did not respond yet. Check: journalctl -u zeus-workshop -n 40"
exit 1
'

echo
echo "Staging CT $DST is up."
echo "  LAN API:  http://${IP}:8787/health"
echo "  In Zeus:  Workshop -> Guest/account -> Workshop server -> http://${IP}:8787 -> Save"
echo "  Ops:      bash workshop-server/staging/ops.sh health"
