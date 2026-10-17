# Zeus Workshop home server

This folder contains the production server, Postgres, and an HTTPS proxy. It has no Electron dependencies. Use one Workshop instance. Accounts and progress live in the `postgres_data` Docker volume; keep this volume across updates.

## First launch

For a dedicated Debian Proxmox guest, run `bash install-systemd.sh` as root instead of Docker. It installs a verified Node 22 distribution, Postgres, and an automatically restarting systemd service. The database credential stays in `/etc/zeus-workshop.env`; subsequent runs preserve it and existing data. Use an HTTPS proxy or Tailscale Funnel in front of port 8787. Check status with `systemctl status zeus-workshop` and logs with `journalctl -u zeus-workshop -n 60`. Enable the guest's Proxmox **Start at boot** setting.

Install Docker Engine with the Compose plugin on Linux, or Docker Desktop using Linux containers on Windows. On Windows, Docker Desktop must start when the host starts and remain running. For unattended use, a Linux Docker host is preferable.

1. Copy this folder to your server.
2. Copy `.env.example` to `.env`. Set `WORKSHOP_DOMAIN` to your own hostname. Generate a password using the command in the example, then put it in `POSTGRES_PASSWORD`. Use hexadecimal characters so the database URL needs no escaping. Keep `.env` private.
3. Point the hostname's DNS A record to your home's public IPv4 address. Use dynamic DNS if that address changes. Only add an AAAA record if IPv6 is actually reachable.
4. Give the server a fixed LAN address. Forward TCP ports 80 and 443 from your router to it and allow them in the server firewall. UDP 443 is optional. Keep the database and port 8787 private. If your ISP uses carrier-grade NAT, ordinary port forwarding will not work; arrange a public IP or an HTTPS tunnel first.
5. In this folder, run:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=60 workshop https
```

Check `https://YOUR_HOSTNAME/health`; it should return `{"ok":true}`. Caddy obtains and renews the HTTPS certificate automatically once DNS and inbound access work. WebSockets use the same HTTPS address.

In every player's Zeus app, open Workshop → Guest/account → Workshop server, enter `https://YOUR_HOSTNAME`, and save. You can also set the desktop `WORKSHOP_URL` before building. All players use the same address. Your home router may require NAT loopback or a local DNS override to reach the public name from inside your home.

The containers restart automatically after a crash or Docker/host restart. The server must remain powered on with sleep disabled, and Docker must start at boot. This does not prevent power or ISP outages.

## Updates and backups

Rebuild the server package from the source repository with `npm run workshop:prepare-deploy`, copy its files over this folder while preserving `.env`, then run `docker compose up -d --build`. Guest room admissions reset when the Workshop process restarts; account admissions persist in Postgres.

Create a private database backup (POSIX shell):

```sh
docker compose exec -T db pg_dump -U workshop -d workshop -Fc > workshop-backup.dump
```

On Windows PowerShell, avoid binary shell redirection; use:

```powershell
docker compose exec db pg_dump -U workshop -d workshop -Fc -f /tmp/workshop-backup.dump
docker compose cp db:/tmp/workshop-backup.dump ./workshop-backup.dump
```

Keep backups on another device. `docker compose down` stops the services and preserves data. Do not use `docker compose down -v` unless you intend to delete all server data and certificates.
