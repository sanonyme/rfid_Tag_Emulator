#!/bin/bash
# Run on the Proxmox host as root. Exposes staging CT 251 via Tailscale Funnel :10000
# (Funnel only allows 443 / 8443 / 10000 — 8444 is not publicly reachable).
# Production stays on :8443 -> 127.0.0.1:18787 -> 192.168.10.250:8787.
set -euo pipefail
DEV_IP="${WORKSHOP_DEV_IP:-192.168.10.251}"
LISTEN="${WORKSHOP_DEV_PROXY_PORT:-18788}"
FUNNEL_PORT="${WORKSHOP_DEV_FUNNEL_PORT:-10000}"

test "$(id -u)" = 0 || { echo 'Run as root on the Proxmox host.'; exit 1; }
command -v tailscale >/dev/null
curl -fsS --connect-timeout 5 "http://${DEV_IP}:8787/health" >/dev/null

install -m 644 /dev/stdin /etc/systemd/system/zeus-workshop-dev-proxy.socket <<EOF
[Unit]
Description=Zeus Workshop staging loopback proxy listener

[Socket]
ListenStream=127.0.0.1:${LISTEN}
NoDelay=true

[Install]
WantedBy=sockets.target
EOF

install -m 644 /dev/stdin /etc/systemd/system/zeus-workshop-dev-proxy.service <<EOF
[Unit]
Description=Zeus Workshop staging proxy to CT 251
After=network-online.target
Wants=network-online.target
Requires=zeus-workshop-dev-proxy.socket

[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd ${DEV_IP}:8787
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
Restart=on-failure
RestartSec=3
EOF

systemctl daemon-reload
systemctl enable --now zeus-workshop-dev-proxy.socket
# Trigger the proxy once so the socket is live.
curl -fsS --connect-timeout 5 "http://127.0.0.1:${LISTEN}/health"
echo

# Drop the old unsupported :8444 mapping if present, then publish on an allowed Funnel port.
tailscale funnel --https=8444 off >/dev/null 2>&1 || true
tailscale funnel --bg --https="${FUNNEL_PORT}" "http://127.0.0.1:${LISTEN}"
sleep 2
tailscale funnel status
echo
echo "Staging public URL: https://proxmox.stalk-great.ts.net:${FUNNEL_PORT}"
echo "LAN URL (HTTP OK in Zeus after client update): http://${DEV_IP}:8787"
echo "Save the HTTPS URL in Zeus: Workshop -> Guest/account -> Workshop server"
