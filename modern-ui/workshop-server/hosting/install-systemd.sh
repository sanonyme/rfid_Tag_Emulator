#!/bin/bash
# Run inside a fresh Debian guest, from the prepared deployment directory.
set -euo pipefail
export PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
export LANG=C.UTF-8 LC_ALL=C.UTF-8
test "$(id -u)" = 0 || { echo 'Run as root inside the dedicated guest.'; exit 1; }
cd -- "$(dirname -- "$0")"
test -f server.mjs && test -f schema.sql
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl xz-utils postgresql

# Fetch Node from its official distribution and verify its published checksum.
if ! /usr/local/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' 2>/dev/null; then
  case "$(uname -m)" in x86_64) arch=x64;; aarch64) arch=arm64;; *) echo 'Unsupported architecture'; exit 1;; esac
  download=$(mktemp -d)
  curl -fsS https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$download/SHASUMS256.txt"
  archive=$(awk -v arch="$arch" '$2 ~ ("-linux-" arch "\\.tar\\.xz$") { print $2 }' "$download/SHASUMS256.txt")
  test -n "$archive"
  curl -fsS "https://nodejs.org/dist/latest-v22.x/$archive" -o "$download/$archive"
  (cd "$download" && grep "  $archive\$" SHASUMS256.txt | sha256sum --check)
  tar -xJf "$download/$archive" --strip-components=1 -C /usr/local
  # Only the known files in the temporary download directory are removed.
  rm -- "$download/$archive" "$download/SHASUMS256.txt"
  rmdir -- "$download"
fi

id workshop >/dev/null 2>&1 || useradd --system --home /var/lib/zeus-workshop --shell /usr/sbin/nologin workshop
install -d -m 755 /opt/zeus-workshop
if test "$PWD" != /opt/zeus-workshop; then
  install -m 644 server.mjs schema.sql package.json package-lock.json /opt/zeus-workshop/
fi
(cd /opt/zeus-workshop && npm ci --omit=dev --ignore-scripts)
systemctl enable --now postgresql

# Preserve the database and credential on subsequent deployments.
if ! test -f /etc/zeus-workshop.env; then
  password=$(/usr/local/bin/node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE workshop LOGIN PASSWORD '$password';
CREATE DATABASE workshop OWNER workshop;
SQL
  umask 077
  printf 'NODE_ENV=production\nHOST=0.0.0.0\nPORT=8787\nDATABASE_URL=postgresql://workshop:%s@127.0.0.1:5432/workshop\nWORKSHOP_ORIGINS=null,file://,http://localhost:5173,http://127.0.0.1:5173\n' "$password" > /etc/zeus-workshop.env
  unset password
fi
install -m 644 zeus-workshop.service /etc/systemd/system/zeus-workshop.service
systemctl daemon-reload
systemctl enable zeus-workshop
systemctl restart zeus-workshop
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/health; then printf '\nWorkshop is running.\n'; exit 0; fi
  sleep 1
done
systemctl status zeus-workshop --no-pager
exit 1
