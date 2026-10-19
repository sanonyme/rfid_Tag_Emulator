# Home deployment

Public player address: **https://proxmox.stalk-great.ts.net:8443**

The desktop build uses this address by default. `WORKSHOP_URL` and an address saved in the Workshop account panel can override it. Existing installations can connect by saving this address in **Workshop → Guest/account → Workshop server**.

## Services

- Proxmox host: `192.168.10.200`, node `proxmox`.
- Dedicated unprivileged Debian guest: **CT 250**, `zeus-workshop`, `192.168.10.250`.
- Resources (prod CT 250, sized for a busy General party): 4 CPU, 4 GB RAM, 2 GB swap, 20 GB disk. Staging CT 251: 2 CPU, 2 GB RAM, 1 GB swap, 16 GB disk. Start at boot enabled.
- Guest server: `/opt/zeus-workshop`, `zeus-workshop.service`, port 8787.
- Guest database: local PostgreSQL, database and role `workshop`. The private connection string is in `/etc/zeus-workshop.env` (root only).
- Host loopback proxy: `zeus-workshop-proxy.socket` and `.service`, `127.0.0.1:18787` → `192.168.10.250:8787`.
- Public HTTPS/WebSockets: Tailscale Funnel port 8443 → host loopback proxy. The separate port 443 configuration is preserved.

The guest, database, app service, host socket, and Tailscale daemon are enabled at boot. Funnel runs persistently in background mode. Keep Proxmox powered on and connected to the internet. Players do not need Tailscale.

## Check and update

On Proxmox:

```sh
pct status 250
pct exec 250 -- systemctl status zeus-workshop --no-pager
pct exec 250 -- journalctl -u zeus-workshop -n 60 --no-pager
curl -fsS https://proxmox.stalk-great.ts.net:8443/health
tailscale funnel status
```

To update, run `npm run workshop:prepare-deploy` in `modern-ui` on the development computer. Transfer `server.mjs`, `schema.sql`, `package.json`, and `package-lock.json` from the generated `.workshop-deploy` directory into the guest's `/opt/zeus-workshop`. Then run `npm ci --omit=dev --ignore-scripts` there and restart `zeus-workshop`. Preserve `/etc/zeus-workshop.env` and the Postgres database. Guest admissions reset at app restart; durable account data remains in Postgres.

Reserve `192.168.10.250` for this guest in the router's DHCP configuration if the DHCP pool includes it. To remove only the public Workshop endpoint, run `tailscale funnel --https=8443 off`; do not reset all Funnel settings.

An initial full guest backup is stored on Proxmox's `local` backup storage under `/var/lib/vz/dump/` (VM ID 250). Arrange recurring backups to another disk through Proxmox's backup settings for continued protection.

Deployment checks passed against the public HTTPS address: account signup/login, two simultaneous WebSocket players, General presence, direct messages, and account/session/profile survival after rebooting CT 250. The source also passes all 379 tests, both typechecks, and the production renderer/main/preload build.

The Windows installer is `modern-ui/dist-app/workshop-preview/Zeus RFID Emulator Setup 10.3.1.exe`. The packaged app was launched with an isolated profile and no server environment override: its embedded address matches the public server, and its mini icon has no room text. The account dialog's 900×680 layout was verified in the desktop smoke test.

The pixel garden update adds animated wings, a second jump, cached scenery/sprites, and display-rate drawing for both canvases. A real Electron run measured 289 miniature paints and 289 expanded paints in two-second samples (about 144 FPS on the test display), while the hidden expanded floor painted zero times.

New signup uses Brevo email codes before creating a user/profile/session. Its server-only credentials are held in `/etc/zeus-workshop-brevo.env` (root-only), loaded as an additional systemd environment file. Brevo must authorize the home's current public IP in its authorized-IP settings and the configured sender must be active. New signup fails closed if mail delivery is unavailable. Existing-account sign-in and guest play continue working. Configure email settings privately; never distribute the server `.env` with Zeus.

Brevo authentication and sender activation were verified from CT 250. A real signup code to a test alias of the configured inbox returned a verification challenge with no account token; Brevo's delivery log confirmed `delivered`, and Postgres confirmed zero users created for that request. The test request was removed. The game/email update passes 384 tests, both typechecks, and the real two-window Electron smoke test (including entering verification codes).

The updated Windows installer is `modern-ui/dist-app/workshop-garden/Zeus RFID Emulator Setup 10.3.1.exe`. The earlier preview installer remains available separately.

The Christmas/friends update is `modern-ui/dist-app/workshop-christmas/Zeus RFID Emulator Setup 10.3.1.exe`. It adds a snowy cabin village with lanterns, garlands, a campfire and snowman, plus snow-capped striped candy-cane blocks. The Workshop and its dialogs follow the app's light/dark mode.

Accounts now receive permanent @handles. Existing accounts are backfilled without changing their ids, passwords, crew, or collection. Friends support requests, accept/decline, remove, and block/unblock. Accepted friends can chat across rooms and while one is offline; only the two accounts can fetch their last 50 messages. Log out is explicitly labeled in the account window and revokes the session. Before this migration, a database backup was saved inside CT 250 at `/root/workshop-pre-friends.dump`; the previous server bundle is `/opt/zeus-workshop/server.pre-friends.mjs`.

Validation: all 387 tests and both typechecks passed. A real two-window Electron run exercised handle lookup, requests/acceptance, private messages, logout/session revocation, and conversation restoration on sign-in. Theme screenshots were taken using the app's actual mode switch. The updated snowy scene measured roughly 145 FPS on the test display in both the widget and expanded floor, with zero expanded paints when collapsed. Production migration confirmed every existing user has a unique handle; unauthenticated friends access returns 401.

The current UI rollback installer is `modern-ui/dist-app/workshop-classic/Zeus RFID Emulator Setup 10.3.1.exe`. It restores the original compact floor, scenery, elf faces, and inventory/trade styling, while retaining the cloud controls, social features, and rendering improvements. No server bundle, database schema, or account data was changed for this rollback. All 387 tests and both typechecks pass. The two-window Electron smoke test also passes with the restored layout, including verified signup, room moderation, friends/private chat, logout, and sign-in restoration. It measured 291 miniature paints and 290 expanded paints per two seconds, with zero expanded paints while collapsed. The packaged executable opens the restored floor and account dialog successfully.

Hosting check during the UI rollback: CT 250, Postgres, the Workshop service, and the localhost proxy are healthy. The public Funnel address currently closes TLS handshakes through all three public relay addresses, despite returning HTTP 200 through the host's tailnet connection. Restarting `tailscaled` restored its online state and retained both existing routes; reannouncing the unchanged 8443 route did not resolve the public TLS failure. This external routing issue remains separate from the UI rollback.
