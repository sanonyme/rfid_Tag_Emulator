# Workshop staging on Proxmox

Production stays on **CT 250** (`192.168.10.250`, Funnel `https://proxmox.stalk-great.ts.net:8443`).
Staging is a **separate** guest so you can drop live events, wipe accounts, and break things without touching player data.

| | Production | Staging |
|---|---|---|
| CT | 250 | **251** |
| Hostname | `zeus-workshop` | `zeus-workshop-dev` |
| LAN IP | `192.168.10.250` | **`192.168.10.251`** |
| API (LAN) | private | `http://192.168.10.251:8787` |
| Public HTTPS | Funnel `:8443` | Funnel **`:10000`** → `127.0.0.1:18788` → CT 251 |
| Public URL | `https://proxmox.stalk-great.ts.net:8443` | **`https://proxmox.stalk-great.ts.net:10000`** |
| Database | Postgres on CT 250 | Postgres on CT 251 only |

## One-time: create CT 251

On the **Proxmox host** (as root):

```sh
# From the repo copy on your PC, scp workshop-server/staging/ to the host, then:
bash /path/to/staging/provision-ct.sh
```

The script snapshots running CT 250 (no downtime), full-clones to 251, assigns `192.168.10.251`, wipes the copied database, and rotates the workshop DB password. Temporary snapshot `staging-clone` is removed unless `WORKSHOP_KEEP_SNAP=1`.

Or do it by hand (also needs a snapshot while 250 is running):

```sh
# Clone production (disk + config). Pick a free CTID if 251 is taken.
pct clone 250 251 --hostname zeus-workshop-dev --full
pct set 251 --net0 name=eth0,bridge=vmbr0,ip=192.168.10.251/24,gw=192.168.10.1
pct set 251 --onboot 1
pct start 251

# Inside the clone: wipe the copied DB so it never shares production rows.
pct exec 251 -- bash -lc '
set -euo pipefail
systemctl stop zeus-workshop
runuser -u postgres -- dropdb --if-exists workshop
runuser -u postgres -- createdb -O workshop workshop
# Fresh password in /etc/zeus-workshop.env (keep HOST/PORT/ORIGINS).
PASS=$(/usr/local/bin/node -e "console.log(require(\"node:crypto\").randomBytes(32).toString(\"hex\"))")
umask 077
grep -v "^DATABASE_URL=" /etc/zeus-workshop.env > /tmp/zeus-workshop.env.new || true
printf "NODE_ENV=production\nHOST=0.0.0.0\nPORT=8787\nDATABASE_URL=postgresql://workshop:%s@127.0.0.1:5432/workshop\nWORKSHOP_ORIGINS=null,file://,http://localhost:5173,http://127.0.0.1:5173\n" "$PASS" > /etc/zeus-workshop.env
chmod 600 /etc/zeus-workshop.env
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE workshop PASSWORD '\''$PASS'\'';"
systemctl start zeus-workshop
curl -fsS http://127.0.0.1:8787/health
'
```

Reserve `192.168.10.251` in DHCP if needed. Schema is applied when `zeus-workshop` starts.

Optional: copy Brevo env from CT 250 if you need signup codes on staging:

```sh
pct pull 250 /etc/zeus-workshop-brevo.env /tmp/zeus-workshop-brevo.env
pct push 251 /tmp/zeus-workshop-brevo.env /etc/zeus-workshop-brevo.env
pct exec 251 -- chmod 600 /etc/zeus-workshop-brevo.env
pct exec 251 -- systemctl restart zeus-workshop
rm -f /tmp/zeus-workshop-brevo.env
```

## Point Zeus at staging

Zeus requires **HTTPS** for public hostnames. Staging is on Funnel port **10000** (production stays on **8443**). Tailscale Funnel only allows `443` / `8443` / `10000` — `:8444` is not reachable from the internet.

In the desktop app: **Workshop → Guest/account → Workshop server** →  
`https://proxmox.stalk-great.ts.net:10000` → **Save server address**.

LAN HTTP also works after the client update: `http://192.168.10.251:8787` (private RFC1918 only).

That overrides the production Funnel URL for this install only. Clear or change it when you want production again.

For `npm run dev` you can also put in `modern-ui/.env` (desktop only, never commit secrets):

```env
WORKSHOP_URL=https://proxmox.stalk-great.ts.net:10000
```

Install/reinstall the Funnel proxy on the Proxmox host with:

```sh
bash /root/zeus-workshop-staging/install-funnel-proxy.sh
```

## Health and deploy

```sh
# On Proxmox host
bash staging/ops.sh health
bash staging/ops.sh status

# Deploy a new server build to staging first (from modern-ui on your PC):
npm run workshop:prepare-deploy
# Copy .workshop-deploy/{server.mjs,schema.sql,package.json,package-lock.json} into CT 251 /opt/zeus-workshop
# Then on host:
bash staging/ops.sh restart
```

Promote to CT 250 only after staging looks good.

## Live events (staging DB)

From the Proxmox host:

```sh
bash staging/ops.sh event-up          # insert/refresh the sample announcement
bash staging/ops.sh event-down        # end it immediately
bash staging/ops.sh event-santa       # Secret Santa opt-in for 7 days
bash staging/ops.sh users             # list accounts
bash staging/ops.sh bags              # one row per bag item
bash staging/ops.sh sql "SELECT id,title,enabled FROM live_events;"
```

Or apply the SQL files under `staging/sql/` with `ops.sh sql-file …`.

Open Workshop with the staging URL; banners refresh on open and about every 60 seconds.

## Optional Funnel for HTTPS staging

Do **not** reuse production `:8443`. Prefer `bash staging/install-funnel-proxy.sh` (Funnel **`:10000`**). Manual equivalent:

```sh
# On Proxmox host
# Proxy 127.0.0.1:18788 → 192.168.10.251:8787, then:
# tailscale funnel --bg --https=10000 http://127.0.0.1:18788
```

Save that Funnel URL in Zeus instead of the LAN IP when off-LAN.

## Rules

- Never run `ops.sh` against CT **250** for experiments (default CTID is 251).
- Never point player Zeus installs at staging.
- Staging DB wipes are allowed; production dumps are for restore only.
- Optional: refresh staging from a prod dump when you want realistic data:

```sh
pct exec 250 -- runuser -u postgres -- pg_dump -Fc workshop -f /tmp/workshop-prod.dump
pct pull 250 /tmp/workshop-prod.dump /tmp/workshop-prod.dump
pct push 251 /tmp/workshop-prod.dump /tmp/workshop-prod.dump
pct exec 251 -- bash -lc 'systemctl stop zeus-workshop; runuser -u postgres -- dropdb --if-exists workshop; runuser -u postgres -- createdb -O workshop workshop; runuser -u postgres -- pg_restore -d workshop --clean --if-exists /tmp/workshop-prod.dump || true; systemctl start zeus-workshop'
```
